import { existsSync, readFileSync } from 'node:fs';

export function readLocalEnv(key: string): string {
  const supplied = process.env[key]?.trim();
  if (supplied) return supplied;
  if (!existsSync('.env.local')) return '';
  const line = readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${key}=`));
  return line?.slice(line.indexOf('=') + 1).trim().replace(/^(['"])(.*)\1$/, '$2') ?? '';
}
