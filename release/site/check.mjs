import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const siteRoot = dirname(fileURLToPath(import.meta.url));
const routes = new Map([
  ['/', 'index.html'],
  ['/privacy', 'privacy/index.html'],
  ['/terms', 'terms/index.html'],
  ['/support', 'support/index.html'],
]);

const readSiteFile = (relativePath) => readFileSync(join(siteRoot, relativePath), 'utf8');
const pages = new Map([...routes].map(([route, file]) => [route, readSiteFile(file)]));
const legalSources = new Map([
  ['privacy', [readSiteFile('privacy.md'), pages.get('/privacy')]],
  ['terms', [readSiteFile('terms.md'), pages.get('/terms')]],
  ['support', [readSiteFile('support.md'), pages.get('/support')]],
]);

const legalFactPatterns = new Map([
  ['privacy', [/Sean Garette Gajitos/, /sggajitos@gmail\.com/, /September 24, 2026|2026-09-24/, /1\.3/, /device credential store/, /model-list endpoint/, /directly to Google Gemini/, /through its Cloudflare Worker/, /separate consent records/, /30 per rolling 24 hours|hosted allowance/, /Gemini terms/, /RevenueCat/, /USDA FoodData Central/, /Open Food Facts/, /Health Connect/, /Delete all data/, /not a medical device/i]],
  ['terms', [/Sean Garette Gajitos/, /sggajitos@gmail\.com/, /September 24, 2026|2026-09-24/, /1\.3/, /0BSD/, /one-time, non-renewing purchase/, /Legacy subscription customers/, /30 combined/, /250 in a rolling 30-day window/, /five recent provider responses/, /Google sets separate limits for My key/, /not a medical device/i]],
  ['support', [/sggajitos@gmail\.com/, /September 24, 2026|2026-09-24/, /My key/, /Eatlog AI/, /Restore purchases/, /\.eatlog-backup/, /\.marco-backup/, /CSV export cannot be restored/, /Remove key/, /Delete all data/]],
]);

for (const [route, html] of pages) {
  assert.match(html, /^<!doctype html>/i, `${route} needs an HTML doctype`);
  assert.match(html, /<html lang="en">/, `${route} needs a language`);
  assert.match(html, /<meta\b[^>]*\bname\s*=\s*["']viewport["'][^>]*>/i, `${route} needs a viewport meta tag`);
  assert.match(html, /<title>[^<]+<\/title>/, `${route} needs a title`);
  assert.match(html, /<main\b/, `${route} needs a main landmark`);
  assert.match(html, /<h1\b/, `${route} needs one primary heading`);
  assert.match(html, /<main id="main" tabindex="-1">/, `${route} needs a focusable skip target`);
  assert.match(html, /href="\/styles\.css(?:\?[^\"]+)?"/, `${route} needs the shared stylesheet`);
  assert.doesNotMatch(html, /<(form|iframe)\b/i, `${route} must stay form- and embed-free`);
  assert.doesNotMatch(html, /(googletagmanager|google-analytics|segment\.com|mixpanel|hotjar)/i, `${route} must stay tracker-free`);

  const directResourcePaths = [...html.matchAll(/(?:src|href)="(\/(?:assets|fonts)\/[^"?#]+|\/(?:[a-z0-9-]+\.css|site\.js|site\.webmanifest))(?:\?[^\"]*)?"/gi)].map((match) => match[1]);
  const srcsetResourcePaths = [...html.matchAll(/srcset="([^"]+)"/g)].flatMap((match) => match[1].split(',').map((candidate) => candidate.trim().split(/\s+/)[0]));
  const resourcePaths = [...new Set([...directResourcePaths, ...srcsetResourcePaths])];
  for (const resourcePath of resourcePaths) {
    assert.ok(existsSync(join(siteRoot, resourcePath.slice(1))), `${route} references missing resource ${resourcePath}`);
  }
}

const homepage = pages.get('/');
for (const route of ['/privacy', '/terms', '/support']) {
  assert.match(homepage, new RegExp(`href="${route}"`), `homepage needs a ${route} link`);
}
assert.match(homepage, /free, open-source/i, 'homepage must lead with free and open-source positioning');
assert.match(homepage, /href="https:\/\/github\.com\/garettie\/eatlog"/, 'homepage needs a source link');
assert.match(homepage, /Eatlog Omelette/, 'homepage needs the optional paid plan');
assert.match(homepage, /your own Google Gemini key/, 'homepage needs optional BYOK');
assert.match(homepage, /30 per rolling 24 hours; 250 per rolling 30 days/, 'homepage needs the hosted allowance');
assert.match(homepage, /src="\/assets\/diary-cropped\.jpg"/, 'hero needs the current Diary screenshot');
assert.match(homepage, /src="\/assets\/consistency-cropped\.jpg"/, 'story trend needs the current consistency screenshot');
assert.match(homepage, /src="\/assets\/planscreen3-405\.jpg"/, 'story step 04 keeps its plan-update screenshot');
assert.doesNotMatch(homepage, /\b(?:Pugo|Manok|Itik)\b|PHP\s*79|PHP\s*799|paid adaptive|paid features monthly/i, 'homepage still sells obsolete plans');
assert.equal([...homepage.matchAll(/class="tier-tab(?: is-selected)?"/g)].length, 2, 'mobile comparison needs exactly two tabs');
assert.equal([...homepage.matchAll(/class="tier-panel"/g)].length, 2, 'mobile comparison needs exactly two panels');
for (const id of ['eatlog', 'omelette']) {
  assert.match(homepage, new RegExp(`id="tier-tab-${id}"[\\s\\S]*?aria-controls="tier-panel-${id}"`), `${id} tab needs a matching panel`);
  assert.match(homepage, new RegExp(`id="tier-panel-${id}"[\\s\\S]*?aria-labelledby="tier-tab-${id}"`), `${id} panel needs a matching tab`);
}
assert.doesNotMatch(homepage, /tier-(?:pugo|manok|itik)(?:\.svg|"|\b)/i, 'homepage references obsolete tier artwork');
assert.match(homepage, /href="\/styles\.css\?v=[^"]+"/, 'homepage stylesheet needs a cache-busting version');
assert.match(homepage, /href="\/home\.css\?v=[^"]+"/, 'homepage stylesheet override needs a cache-busting version');
assert.match(homepage, /src="\/site\.js\?v=[^"]+"/, 'homepage script needs a cache-busting version');
assert.match(homepage, /<a class="header-action" href="#release-status">Release status<\/a>/, 'release status link needs the homepage release target');
assert.match(homepage, /<section\b(?=[^>]*\bclass=["'][^"']*\bmog-final\b[^"']*["'])(?=[^>]*\bid=["']release-status["'])[^>]*>/i, 'homepage needs a release status target');
assert.match(homepage, /<button\b[^>]*\bdata-cook-button\b[^>]*>\s*Let him cook!\s*<\/button>/i, 'release section needs the cooking interaction');
assert.match(homepage, /src="\/assets\/fire-click\.svg"/, 'cooking interaction needs the one-shot fire SVG');

const compliancePages = ['/privacy', '/terms'].map((route) => pages.get(route));
const headers = readSiteFile('_headers');
assert.match(headers, /Content-Security-Policy:/, '_headers needs a content security policy');
assert.match(headers, /X-Content-Type-Options: nosniff/, '_headers needs MIME-sniffing protection');
assert.match(headers, /X-Frame-Options: DENY/, '_headers needs anti-framing protection');
assert.match(headers, /\/privacy\*\s+Cache-Control: public, max-age=300, must-revalidate/, '_headers needs a Privacy cache rule');
assert.match(headers, /\/terms\*\s+Cache-Control: public, max-age=300, must-revalidate/, '_headers needs a Terms cache rule');
assert.match(headers, /\/support\*\s+Cache-Control: public, max-age=300, must-revalidate/, '_headers needs a Support cache rule');
for (const [route, html] of pages) {
  assert.equal(/noindex|preview draft/i.test(html), false, `${route} still contains a preview publication blocker`);
}
assert.match(pages.get('/support'), /href="mailto:[^"@]+@[^"@]+"/i, '/support needs a monitored email link');
const robots = readSiteFile('robots.txt');
assert.doesNotMatch(robots, /Disallow:\s*\/(privacy|terms|support)/, 'robots.txt still blocks a compliance route');
assert.equal(/X-Robots-Tag: noindex/.test(headers), false, '_headers still blocks compliance-page indexing');
for (const [documentName, sources] of legalSources) {
  for (const source of sources) {
    assert.equal(/publication_status:\s*preview-draft|preview draft|noindex,nofollow/i.test(source), false, `${documentName} still contains a preview marker`);
    if (documentName !== 'support') assert.match(source, /effective/i, `${documentName} needs an effective date for publication`);
    for (const factPattern of legalFactPatterns.get(documentName)) {
      assert.match(source, factPattern, `${documentName} source is missing ${factPattern}`);
    }
    assert.doesNotMatch(source, /\b(?:Pugo|Manok|Itik)\b|three initial photo or description estimates|PHP\s*79|PHP\s*799|paid adaptive/i, `${documentName} has obsolete sales language`);
  }
}

console.log(`Eatlog site publication checks passed for ${routes.size} routes.`);
