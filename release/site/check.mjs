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

for (const [route, html] of pages) {
  assert.match(html, /^<!doctype html>/i, `${route} needs an HTML doctype`);
  assert.match(html, /<html lang="en">/, `${route} needs a language`);
  assert.match(html, /<meta name="viewport"/, `${route} needs a viewport meta tag`);
  assert.match(html, /<title>[^<]+<\/title>/, `${route} needs a title`);
  assert.match(html, /<main\b/, `${route} needs a main landmark`);
  assert.match(html, /<h1\b/, `${route} needs one primary heading`);
  assert.match(html, /href="\/styles\.css"/, `${route} needs the shared stylesheet`);
  assert.doesNotMatch(html, /<(form|iframe)\b/i, `${route} must stay form- and embed-free`);
  assert.doesNotMatch(html, /(googletagmanager|google-analytics|segment\.com|mixpanel|hotjar)/i, `${route} must stay tracker-free`);

  const resourcePaths = [...html.matchAll(/(?:src|href)="(\/(?:assets|fonts)\/[^"?#]+|\/(?:styles\.css|site\.js|site\.webmanifest))"/g)].map((match) => match[1]);
  for (const resourcePath of resourcePaths) {
    assert.ok(existsSync(join(siteRoot, resourcePath.slice(1))), `${route} references missing resource ${resourcePath}`);
  }
}

const homepage = pages.get('/');
for (const route of ['/privacy', '/terms', '/support']) {
  assert.match(homepage, new RegExp(`href="${route}"`), `homepage needs a ${route} link`);
}
assert.doesNotMatch(homepage, /name="robots" content="noindex/i, 'homepage must remain indexable');

const compliancePages = ['/privacy', '/terms'].map((route) => pages.get(route));
const headers = readSiteFile('_headers');
assert.match(headers, /Content-Security-Policy:/, '_headers needs a content security policy');
assert.match(headers, /X-Content-Type-Options: nosniff/, '_headers needs MIME-sniffing protection');
assert.match(headers, /X-Frame-Options: DENY/, '_headers needs anti-framing protection');
if (publicationMode) {
  for (const [route, html] of [...pages].filter(([path]) => path !== '/')) {
    assert.doesNotMatch(html, /noindex|Publication blocked|Contact pending|release preview|Owner input required/i, `${route} still contains a publication blocker`);
  }
  assert.match(pages.get('/support'), /href="mailto:[^"@]+@[^"@]+"/i, '/support needs a monitored email link');
  const robots = readSiteFile('robots.txt');
  assert.doesNotMatch(robots, /Disallow:\s*\/(privacy|terms|support)/, 'robots.txt still blocks a compliance route');
  assert.doesNotMatch(headers, /X-Robots-Tag: noindex/, '_headers still blocks compliance-page indexing');
} else {
  for (const html of compliancePages) {
    assert.match(html, /name="robots" content="noindex,nofollow"/, 'draft compliance pages must stay unindexed');
  }
  for (const route of ['/privacy', '/terms']) {
    assert.match(headers, new RegExp(`${route}\\*\\s+[\\s\\S]*?X-Robots-Tag: noindex, nofollow`), `_headers must keep draft ${route} responses unindexed`);
  }
}

console.log(`Eatlog site ${publicationMode ? 'publication' : 'preview'} checks passed for ${routes.size} routes.`);
