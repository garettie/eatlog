# Eatlog public website

This directory is a dependency-free static website for Eatlog. It includes the marketing homepage and stable `/privacy`, `/terms`, and `/support` route directories. `privacy.md`, `terms.md`, and `support.md` remain the canonical legal and support drafts.

## Local preview

From `release/site`, run:

```bash
python3 -m http.server 4173
```

Open `http://127.0.0.1:4173/`. The site has no cookies, analytics, forms, or remote fonts. Onest, the Eatlog mark, and the social image are bundled under this directory.

## Verification

Run `npm run site:check` from the repository root to validate all four routes, local assets, semantic page structure, and the no-tracker rule. Before public hosting, run `node release/site/check.mjs --publication`; it fails while owner details, direct support, `noindex`, or crawler blocks remain.

## Cloudflare Pages

Use Git integration with these build settings:

- Root directory: repository root (leave the field blank)
- Build command: `npm run site:check`
- Build output directory: `release/site`

No Pages Function is required. Cloudflare Pages reads `_headers` from the output directory and applies the content-security, anti-framing, permissions, draft-indexing, and cache rules. Keep the generated `*.pages.dev` URL or attach an owner-controlled custom domain, then record the exact HTTPS route URLs in `release/OWNER_INPUTS.md`.

## Publication gate

The support page is ready to publish. Privacy and Terms carry `noindex` metadata and `robots.txt` blocks because their owner-controlled legal values are unresolved. Before hosting those legal pages as live policies:

1. Complete the public developer or legal name, governing law, host, and final URLs in `release/OWNER_INPUTS.md`. Support uses `sggajitos@gmail.com` and a 3-business-day response window.
2. Replace each visible draft notice and contact placeholder with verified values.
3. Confirm production-provider settings match the Privacy Policy.
4. Remove `noindex` from Privacy and Terms and remove their `Disallow` entries from `robots.txt` and `_headers`.
5. Host the directory over HTTPS with stable `/privacy`, `/terms`, and `/support` routes.
6. Put the exact final URLs in `EXPO_PUBLIC_PRIVACY_URL`, `EXPO_PUBLIC_TERMS_URL`, and `EXPO_PUBLIC_SUPPORT_URL`; put the monitored email in `EXPO_PUBLIC_SUPPORT_EMAIL`.
7. Build the release app and confirm Profile opens only the configured HTTPS links.
8. Save dated desktop and phone browser captures plus response-header checks as release evidence.

Do not publish guessed owner values or replace the static support contact with an unmonitored form.
