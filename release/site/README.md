# Static privacy and support source

`privacy.md` and `support.md` are the canonical public-page drafts. They are intentionally marked `blocked-on-owner-input` and must not be presented as live policies.

Before hosting:

1. Complete the legal/developer name, monitored support email, host, and URLs in `release/OWNER_INPUTS.md`.
2. Replace the draft notices with the verified owner values. Do not add tracking scripts, cookies, forms, or remote fonts.
3. Render the Markdown as accessible static HTML over HTTPS with stable `/privacy` and `/support` routes.
4. Confirm both pages work without authentication, redirects to unrelated domains, or geographic blocking.
5. Put the exact final URLs in `EXPO_PUBLIC_PRIVACY_URL` and `EXPO_PUBLIC_SUPPORT_URL`; put the monitored email in `EXPO_PUBLIC_SUPPORT_EMAIL`.
6. Build the release app and confirm Profile shows only the configured valid HTTPS links.
7. Save a dated browser capture and response-header check as release evidence.

**OWNER INPUT:** Hosting, public contact, legal name, final URLs, and publication remain owner-controlled.
