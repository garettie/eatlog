import { DurableObject } from 'cloudflare:workers';

import {
  THIRTY_DAYS_MS,
  decideQuota,
  operationClass,
  quotaUsage,
  type PaidAccessKind,
  type QuotaEvent,
} from './subscriptions';

interface DurableEnv {}
interface CacheRow { [key: string]: SqlStorageValue; access_json: string; subject: string | null; valid_until: number }
interface EventRow { [key: string]: SqlStorageValue; operation_class: QuotaEvent['operationClass']; timestamp: number; request_id: string }

export class EntitlementQuotaState extends DurableObject<DurableEnv> {
  constructor(ctx: DurableObjectState, env: DurableEnv) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS access_cache (customer_key TEXT PRIMARY KEY, access_json TEXT NOT NULL, subject TEXT, valid_until INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS quota_events (subject TEXT NOT NULL, operation_class TEXT NOT NULL, timestamp INTEGER NOT NULL, request_id TEXT NOT NULL, PRIMARY KEY(subject, request_id));
      CREATE TABLE IF NOT EXISTS quota_requests (subject TEXT NOT NULL, request_id TEXT NOT NULL, state TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(subject, request_id));
      CREATE TABLE IF NOT EXISTS webhook_events (event_id TEXT PRIMARY KEY, event_timestamp INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS webhook_subjects (customer_key TEXT PRIMARY KEY, last_event_timestamp INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS quota_events_subject_time ON quota_events(subject, timestamp);
    `);
    try { this.ctx.storage.sql.exec('ALTER TABLE quota_requests ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0'); } catch {}
  }

  // fallow-ignore-next-line unused-class-member -- Cloudflare invokes the Durable Object fetch entry point.
  async fetch(request: Request): Promise<Response> {
    const body = request.method === 'POST' ? await request.json() as Record<string, unknown> : {};
    const path = new URL(request.url).pathname;
    const sql = this.ctx.storage.sql;
    if (path === '/cache/get') {
      const customerKey = String(body.customerKey ?? '');
      const now = Number(body.now);
      const row = [...sql.exec<CacheRow>('SELECT access_json, subject, valid_until FROM access_cache WHERE customer_key = ?', customerKey)][0];
      if (!row || (body.stale !== true && row.valid_until <= now)) return Response.json(null);
      return Response.json({ access: JSON.parse(row.access_json), subjectIdentity: row.subject, validUntil: row.valid_until });
    }
    if (path === '/cache/put') {
      sql.exec('INSERT OR REPLACE INTO access_cache (customer_key, access_json, subject, valid_until) VALUES (?, ?, ?, ?)', String(body.customerKey), JSON.stringify(body.access), body.subjectIdentity == null ? null : String(body.subjectIdentity), Number(body.validUntil));
      return Response.json({ ok: true });
    }
    if (path === '/webhook') {
      const eventId = String(body.eventId ?? '');
      const eventTimestamp = Number(body.eventTimestamp);
      const customerKeys = Array.isArray(body.customerKeys) ? body.customerKeys.map(String) : [];
      sql.exec('DELETE FROM webhook_events WHERE event_timestamp <= ?', Date.now() - THIRTY_DAYS_MS);
      if ([...sql.exec('SELECT event_id FROM webhook_events WHERE event_id = ?', eventId)].length) return Response.json({ result: 'duplicate' });
      const stale = customerKeys.some((key) => {
        const row = [...sql.exec<{ last_event_timestamp: number }>('SELECT last_event_timestamp FROM webhook_subjects WHERE customer_key = ?', key)][0];
        return row != null && eventTimestamp < row.last_event_timestamp;
      });
      if (stale) return Response.json({ result: 'stale' });
      sql.exec('INSERT INTO webhook_events (event_id, event_timestamp) VALUES (?, ?)', eventId, eventTimestamp);
      for (const key of customerKeys) {
        sql.exec('INSERT OR REPLACE INTO webhook_subjects (customer_key, last_event_timestamp) VALUES (?, ?)', key, eventTimestamp);
        sql.exec('DELETE FROM access_cache WHERE customer_key = ?', key);
      }
      return Response.json({ result: 'accepted' });
    }
    if (path === '/quota/usage' || path === '/quota/reserve') {
      const subject = String(body.subject ?? '');
      const access = String(body.access) as PaidAccessKind;
      const now = Number(body.now);
      sql.exec('DELETE FROM quota_events WHERE timestamp <= ?', now - THIRTY_DAYS_MS);
      sql.exec('DELETE FROM quota_requests WHERE created_at <= ?', now - THIRTY_DAYS_MS);
      const rows = [...sql.exec<EventRow>('SELECT operation_class, timestamp, request_id FROM quota_events WHERE subject = ? AND timestamp > ? ORDER BY timestamp', subject, access === 'manok-trial' ? 0 : now - THIRTY_DAYS_MS)];
      const events = rows.map((row) => ({ operationClass: row.operation_class, timestamp: row.timestamp, requestId: row.request_id }));
      if (path === '/quota/usage') return Response.json(quotaUsage(events, access, now));
      const requestId = String(body.requestId ?? '');
      const prior = [...sql.exec<{ state: string }>('SELECT state FROM quota_requests WHERE subject = ? AND request_id = ?', subject, requestId)][0];
      if (prior?.state === 'reserved' || prior?.state === 'finalized') return Response.json({ allowed: true, duplicate: true, usage: quotaUsage(events, access, now) });
      const operation = String(body.operation ?? '');
      const decision = decideQuota(events, access, operation, now);
      if (!decision.allowed) return Response.json(decision);
      sql.exec('INSERT OR REPLACE INTO quota_requests (subject, request_id, state, created_at) VALUES (?, ?, ?, ?)', subject, requestId, 'reserved', now);
      sql.exec('INSERT OR REPLACE INTO quota_events (subject, operation_class, timestamp, request_id) VALUES (?, ?, ?, ?)', subject, operationClass(access, operation), now, requestId);
      return Response.json({ ...decision, usage: quotaUsage([...events, { operationClass: operationClass(access, operation), timestamp: now, requestId }], access, now) });
    }
    if (path === '/quota/finalize') {
      sql.exec("UPDATE quota_requests SET state = 'finalized' WHERE subject = ? AND request_id = ? AND state = 'reserved'", String(body.subject), String(body.requestId));
      return Response.json({ ok: true });
    }
    if (path === '/quota/refund') {
      const subject = String(body.subject);
      const requestId = String(body.requestId);
      const prior = [...sql.exec<{ state: string }>('SELECT state FROM quota_requests WHERE subject = ? AND request_id = ?', subject, requestId)][0];
      if (prior?.state === 'reserved') {
        sql.exec("UPDATE quota_requests SET state = 'refunded' WHERE subject = ? AND request_id = ?", subject, requestId);
        sql.exec('DELETE FROM quota_events WHERE subject = ? AND request_id = ?', subject, requestId);
      }
      return Response.json({ ok: true });
    }
    return new Response('Not found', { status: 404 });
  }
}
