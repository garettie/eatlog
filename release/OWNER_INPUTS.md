# Eatlog release owner inputs

Updated: 2026-08-10

Engineering can finish local subscription implementation without these values. Do not copy placeholders from this document into app configuration, policy copy, or store forms.

| Input or owner action | Status | Needed before | Blocker |
| --- | --- | --- | --- |
| Public developer or legal name used in both listings and the privacy policy | Awaiting owner | Public release | OWNER INPUT |
| Monitored support email used by users, providers, and store reviewers | Supplied 2026-08-24: `sggajitos@gmail.com` | Submission | Ready to configure |
| Public support-response expectation for the support page | Supplied 2026-08-24: within 3 business days | Submission | Ready to publish |
| Owner-controlled HTTPS host or domain for stable `/privacy`, `/terms`, and `/support` pages | Awaiting owner | Submission | OWNER INPUT |
| Final privacy-policy, Terms, and support URLs after hosting | Awaiting host choice and publication | Submission | OWNER INPUT |
| Register Eatlog's read-only Open Food Facts use and monitored contact in the provider API usage form | Awaiting support email and owner submission | Public release | OWNER INPUT |
| Launch countries beyond the fixed Philippines storefront | Awaiting owner | Submission | OWNER INPUT |
| Decide who may receive direct preview APKs after launch and remove any public APK link before the paid Play release | Awaiting owner | Public release | OWNER INPUT |
| Google Play developer enrollment; account type and creation date | Unverified | Submission | STORE ACCOUNT |
| Apple Developer Program enrollment and App Store Connect access | Unverified | Signed build | STORE ACCOUNT |
| Reserve `com.sgaret.eatlog` with Apple; use `com.sgaret.eatlog.dev` for development | Candidate recorded; reservation account-bound and unverified | Signed build | STORE ACCOUNT |
| Apple Team ID and the person who controls two-factor authentication | Awaiting enrollment/account owner | Signed build | CREDENTIAL |
| Google and Apple store agreements | Unverified | Submission | STORE ACCOUNT |
| Google payments profile, banking, tax, legal identity, and payout setup | Unverified | Public release | STORE ACCOUNT |
| Apple Paid Apps Agreement, banking, tax, legal identity, and payout setup | Unverified | Public release | STORE ACCOUNT |
| RevenueCat project, Test Store app, `eatlog_paid` entitlement, and `default` offering | Awaiting owner dashboard work | Subscription preview | STORE ACCOUNT |
| Google Manok PHP 79 monthly product/trial and Itik PHP 799 lifetime product | Do not create until owner approves Play action | Closed testing | STORE ACCOUNT |
| Equivalent prices and availability for any additional launch countries | Awaiting country choice and console review | Public release | OWNER INPUT |
| Stable App Store Connect SKU | Awaiting owner | App record | OWNER INPUT |
| Public copyright rights-holder name | Awaiting owner | Submission | OWNER INPUT |
| Store-review contact name, monitored email, phone number, and time zone | Awaiting owner | Submission | OWNER INPUT |
| Digital Services Act trader decision and verification if any EU country is selected | Awaiting launch-country choice | Submission | OWNER INPUT |
| Google service account or EAS-managed submission access | Do not create until the Play app record exists | Submission | CREDENTIAL |
| App Store Connect API key or EAS-managed Apple credentials | Do not create until enrollment and app record exist | Submission | CREDENTIAL |
| Available Android devices: API 26, API 36/current, Samsung-class, small and large phone | Awaiting owner inventory | Final build | PHYSICAL DEVICE |
| Available iPhones: minimum supported iOS, current iOS, small and large phone | Awaiting owner inventory | Final build | PHYSICAL DEVICE |
| Named release/support owner who can monitor support, deploy or roll back the Worker, and rotate secrets | Awaiting owner | Public release | OWNER INPUT |
| Confirm production Google Gemini and Cloudflare retention, abuse-protection, and logging settings against the privacy/store disclosures | Requires production-account access | Public release | CREDENTIAL |
| Verify production Worker secret bindings and rotate any USDA, Gemini, or rate-limit secret exposed in an older client or log | Requires production-account access and key owners | Public release | CREDENTIAL |
| Configure and verify Gemini quota/budget alerts plus Cloudflare usage/error notifications supported by the account plan | Requires production-account access and budget owner | Public release | CREDENTIAL |
| Record the production Worker URL/version, previous healthy version, rollback target, deployed rate-limit bindings, and the EAS environments that contain only the public Worker URL | Requires Cloudflare and EAS access | Submission | CREDENTIAL |
| Budget approval for paid memberships, EAS builds, provider usage, domain hosting, and test devices | Awaiting owner | Paid action | PAID SERVICE |

Fixed product decisions already supplied by the owner:

- The product and installed app name remain Eatlog.
- Android package remains `com.sgaret.eatlog`; Android ships first.
- The iOS candidates are `com.sgaret.eatlog` and `com.sgaret.eatlog.dev`.
- Eatlog remains paid acquisition until the owner-approved free-app launch checkpoint. The target model is free Pugo, PHP 79 monthly Manok with an eligible one-month trial, and PHP 799 lifetime Itik.
- Entitlement identifier is `eatlog_paid`; RevenueCat offering is `default`. Android product identifiers and options are fixed in `SUBSCRIPTION_IMPLEMENTATION_PLAN.md`.
- Android and iOS purchases are separate.
- Health Connect remains Android-only. HealthKit and Apple Health remain outside v1.
