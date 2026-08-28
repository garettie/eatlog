import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const siteRoot = dirname(fileURLToPath(import.meta.url));
const publicationMode = process.argv.includes('--publication');
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
]);

const legalFactPatterns = new Map([
  ['privacy', [/Sean Garette Gajitos/, /sggajitos@gmail\.com/, /August 28, 2026|2026-08-28/, /(?:Version|policy_version:)\s*1\.1/i, /five initial photo or description estimates per rolling 24 hours/i, /meal and component re-estimates require Manok, Itik, or complimentary access/i, /Google Gemini/, /Cloudflare/, /RevenueCat/, /USDA FoodData Central/, /Open Food Facts/, /Health Connect/, /not a medical device/i]],
  ['terms', [/Sean Garette Gajitos/, /sggajitos@gmail\.com/, /August 28, 2026|2026-08-28/, /(?:Version|policy_version:)\s*1\.1/i, /five initial photo or description estimates in any rolling 24-hour window/i, /Meal and component re-estimates are not included in Pugo/i, /30 combined AI operations/, /250 per rolling 30 days/, /Lifetime/i, /not a medical device/i, /dispute terms/i]],
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
assert.doesNotMatch(homepage, /name="robots" content="noindex/i, 'homepage must remain indexable');
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
if (publicationMode) {
  for (const [route, html] of [...pages].filter(([path]) => path !== '/')) {
    assert.doesNotMatch(html, /noindex|Publication blocked|Contact pending|release preview|Owner input required/i, `${route} still contains a publication blocker`);
  }
  assert.match(pages.get('/support'), /href="mailto:[^"@]+@[^"@]+"/i, '/support needs a monitored email link');
  const robots = readSiteFile('robots.txt');
  assert.doesNotMatch(robots, /Disallow:\s*\/(privacy|terms|support)/, 'robots.txt still blocks a compliance route');
  assert.doesNotMatch(headers, /X-Robots-Tag: noindex/, '_headers still blocks compliance-page indexing');
  for (const [documentName, sources] of legalSources) {
    for (const source of sources) {
      assert.doesNotMatch(source, /blocked-on-owner-input|Publication blocked|release preview|not a live|Owner input|required before publication|noindex,nofollow/i, `${documentName} still contains a publication blocker`);
      for (const factPattern of legalFactPatterns.get(documentName)) {
        assert.match(source, factPattern, `${documentName} source is missing ${factPattern}`);
      }
    }
  }
} else {
  for (const html of compliancePages) {
    assert.match(html, /name="robots" content="noindex,nofollow"/, 'draft compliance pages must stay unindexed');
  }
  for (const route of ['/privacy', '/terms']) {
    assert.match(headers, new RegExp(`${route}\\*\\s+[\\s\\S]*?X-Robots-Tag: noindex, nofollow`), `_headers must keep draft ${route} responses unindexed`);
  }
}

console.log(`Eatlog site ${publicationMode ? 'publication' : 'preview'} checks passed for ${routes.size} routes.`);
