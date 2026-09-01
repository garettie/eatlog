# Eatlog public website

This directory is a dependency-free static website for Eatlog. It includes the marketing homepage and stable `/privacy`, `/terms`, and `/support` route directories. `privacy.md`, `terms.md`, and `support.md` remain the canonical legal and support drafts.

## Local preview

From `release/site`, run:

```bash
python3 -m http.server 4173
```

Open `http://127.0.0.1:4173/`. The site has no cookies, analytics, forms, or remote fonts. Onest, the Eatlog mark, and the social image are bundled under this directory.

## Verification

Run `npm run site:check` from the repository root to enforce the published-site contract across all four routes, local assets, semantic page structure, indexing, security headers, direct support, and the no-tracker rule.

## Cloudflare Pages

Use Git integration with these build settings:

- Root directory: repository root (leave the field blank)
- Build command: `npm run site:check`
- Build output directory: `release/site`

No Pages Function is required. Cloudflare Pages reads `_headers` from the output directory and applies the content-security, anti-framing, permissions, and cache rules. The production site is `https://eatlog.pages.dev`.

## Published legal pages

Privacy Policy version 1.2 and the Terms of Use are effective September 1, 2026.

- Privacy: `https://eatlog.pages.dev/privacy`
- Terms: `https://eatlog.pages.dev/terms`
- Support: `https://eatlog.pages.dev/support`
- Developer: Sean Garette Gajitos
- Contact: `sggajitos@gmail.com`
- Support response target: within 3 business days

Material changes to data processing, pricing, renewal, lifetime scope, or fair use require updated legal copy, a new effective date, `npm run site:check`, and any notice required by the platform stores or applicable law.
