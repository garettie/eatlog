# Nutritics commercial qualification

Research date: 2026-08-27

This note answers [issue #17, Qualify Nutritics' API offer for Eatlog](https://github.com/garettie/eatlog/issues/17). It uses only public Nutritics pages. No quote was requested and no account or trial was created.

## Result

Nutritics publicly documents the core food-search API capabilities Eatlog needs. It does not publish enough commercial or licence information to qualify an offer. Do not start a catalog trial until Nutritics supplies a written quote and written answers to every unknown below.

## Verified public facts

### Catalog and API

- Nutritics markets a Food Data API for use in another platform's backend. It claims access to more than one million generic and branded foods and recipes from official national, international, and branded databases. This is a provider claim, not an Eatlog quality result. [Food Data API and Integrations](https://www.nutritics.com/en/product/food-data-api/)
- The public explorer documents text search through `LIST`, including the example `LIST/food=banana`. It says `LIST` searches the data sources enabled for the developer account and returns matching objects with a `resultCount`. [API explorer](https://www.nutritics.com/api/v1.2/explorer/)
- The explorer documents UPC-A lookup by prepending an underscore to a barcode. Its food object has `barcode`, `brand`, `name`, source-database, country-of-origin, and whole-food fields. The product page separately claims both generic and branded coverage. [API explorer](https://www.nutritics.com/api/v1.2/explorer/) [Food Data API and Integrations](https://www.nutritics.com/en/product/food-data-api/)
- Food results can include available portions, up to five named portion fields, portion quantities, serving counts, and metric or imperial quantities. Quantity syntax includes grams, kilograms, pounds, ounces, millilitres, named portions, average units such as apples or slices, and recipe servings. Whether returned records have useful Philippine portions remains untested. [API explorer](https://www.nutritics.com/api/v1.2/explorer/)
- The food schema exposes `energyKcal`, `protein`, `carbohydrate`, and `fat`. The product page claims up to 258 nutrient parameters. [API explorer](https://www.nutritics.com/api/v1.2/explorer/) [Food Data API and Integrations](https://www.nutritics.com/en/product/food-data-api/)
- Nutritics calls its databases international. Its product page names regional output and label formats for the EU, US, Australia, New Zealand, and South Africa. These statements do not establish Philippine catalog coverage. [API explorer](https://www.nutritics.com/api/v1.2/explorer/) [Food Data API and Integrations](https://www.nutritics.com/en/product/food-data-api/)

### Access, integration, and support

- The public endpoint pattern is `https://www.nutritics.com/api/v1.2/{FUNCTION}/...`. Nutritics documents HTTPS, JSON responses, GET and POST requests, and HTTP Basic authentication. The product page says Basic credentials go in the request header, while explorer examples show the username and password in the URL. A production trial must confirm the current credential format. [API explorer](https://www.nutritics.com/api/v1.2/explorer/) [Food Data API and Integrations](https://www.nutritics.com/en/product/food-data-api/)
- Nutritics expressly describes using the API in a platform backend. The documented HTTPS, header-authenticated REST design is technically compatible with a Cloudflare Worker proxy. This is a technical inference, not contractual permission to proxy or display Nutritics data to consumers. [Food Data API and Integrations](https://www.nutritics.com/en/product/food-data-api/)
- API access is sales-led. The product page offers "Request free quote" links to Nutritics' contact and demo routes rather than a self-service API price. [Food Data API and Integrations](https://www.nutritics.com/en/product/food-data-api/) [Contact Nutritics](https://www.nutritics.com/en/contact-us/) [Book a demo](https://www.nutritics.com/en/book-a-demo/)
- Nutritics says it assigns an Integrations Manager during implementation and provides API users a dedicated support inbox with access to specialist developers after integration. It publishes no API support SLA on the product page. [Food Data API and Integrations](https://www.nutritics.com/en/product/food-data-api/)

## Sales-gated unknowns

The reviewed public pages do not answer the following requirements. "Unknown" is not evidence that Nutritics refuses the term.

| Eatlog gate | Public result |
| --- | --- |
| Production price at 6,000 baseline and 18,000 stress requests per month | Unknown. No API price or included request allowance is published. |
| US$25 all-in monthly invoice ceiling | Unknown. Setup fees, seat fees, database fees, minimum spend, taxes, and overages are not published. |
| Contract duration and cancellation | Unknown for the API offer. No month-to-month commitment or absence of an annual or enterprise minimum is stated. |
| Trial credentials | Unknown. The public demo and quote routes do not promise production-equivalent API trial access or a trial duration. |
| Quotas and rate limits | Unknown. No monthly quota, burst rate, concurrency limit, or response to exhaustion is published. |
| Overage controls | Unknown. No hard cap, automatic shutoff, alerting, or opt-in overage mechanism is published. |
| Philippine provider catalog | Unknown. Public claims of international data and named regional formats provide no explicit Philippine database, branded-food sample, barcode evidence, or coverage commitment. |
| Production authentication | Partly documented. Basic authentication is public, but the current credential issue and rotation process require confirmation. |
| Cloudflare Worker proxy permission | Unknown as a contractual right. Backend integration is marketed, but Cloudflare Worker proxying is not named. |
| Consumer display | Unknown as a contractual right. The product page mentions results for an end user, but it is not an API licence grant for Eatlog's consumer app. |
| Short cache of provider catalog search and barcode responses | Unknown. No public API cache duration or allowed cached fields are stated. |
| Permanent confirmed nutrition snapshot in personal history | Unknown. No public API term grants permanent storage of a user-confirmed food name, portion, calories, protein, carbohydrates, and fat. |
| Export and post-termination use | Unknown. No public API term grants user export or continued use of confirmed nutrition snapshots after downgrade, cancellation, account deletion, or termination. |
| Provider-managed end-user account | Unknown. Public material does not say whether each Eatlog user must have a Nutritics user or client account. |
| Support commitment | Partly documented. An integration manager and API support inbox are advertised, but channel details, hours, response targets, escalation, and SLA are unknown. |

Nutritics' general February 2025 terms cover subscription services, customer data, and termination, but the public page does not grant the API-specific consumer display, cache, personal-history, export, or post-termination rights Eatlog needs. Its customer-data export language must not be treated as permission to retain Nutritics' provider catalog. [Terms and Conditions](https://www.nutritics.com/en/terms-conditions/)

## Ready-to-send vendor qualification request

**Subject: Written Food Data API quote and licence confirmation for Eatlog**

Hello Nutritics team,

Eatlog is a consumer food-logging app evaluating one paid food-data provider. Please provide a written quote and written answers to the points below. Our expected traffic is 6,000 requests per month, with a stress case of 18,000 requests per month. The entire production service must cost no more than US$25 per month, including platform, database, seat, setup, support, and request charges.

1. Quote the exact monthly price, included requests, taxes or fees, contract duration, cancellation terms, and any minimum commitment. Confirm there is no annual or enterprise minimum.
2. State the monthly, per-minute, burst, and concurrency limits. Describe throttling and quota-exhaustion responses. Confirm either no overage or a hard billing stop that prevents the invoice from exceeding US$25 without our prior written opt-in.
3. Provide production-equivalent trial credentials and state the trial duration, enabled databases, request limits, and support route.
4. Confirm that the trial and quoted production offer include text search, UPC-A and any EAN or GTIN lookup, generic foods, branded foods, practical portions, calories, protein, carbohydrates, and fat.
5. Identify the Philippine provider catalog included in the offer. Please provide database names, source and update details, and sample evidence for ordinary Filipino foods and Philippine packaged-food barcodes. We will measure quality separately in a fixed trial benchmark.
6. Confirm the current authentication method, credential rotation process, and permission for Eatlog to keep the credential in a Cloudflare Worker and proxy requests to Nutritics. Eatlog end users must not need Nutritics-managed accounts.
7. Grant commercial display of results in Eatlog's consumer app. State any attribution, branding, or placement requirements.
8. Permit Eatlog to cache normalized provider catalog search and barcode responses for up to 24 hours for performance and resilience. State any field, location, or refresh restrictions.
9. Distinguish the provider catalog from a confirmed nutrition snapshot. Eatlog will not copy or expose the provider catalog. When a user selects and confirms an item, Eatlog must be allowed to store the food name, portion, calories, protein, carbohydrates, and fat permanently in that user's personal history and include those values in the user's export.
10. Confirm that each user's confirmed nutrition snapshots may remain usable and exportable after subscription downgrade, cancellation, Eatlog account deletion, or termination by either party. State that no later provider deletion request applies to those snapshots.
11. Provide the API support channels, service hours, response targets, escalation path, uptime commitment, and notice process for API or database changes.

Please attach or link the API licence and order terms that contain these permissions and limits. A sales summary without matching written licence terms will not complete qualification.

Thank you.

## Qualification decision rule

Advance Nutritics to Eatlog's provider trial only if the written offer clears every commercial, architecture, account, display, cache, and confirmed-snapshot gate. Silence, a price above US$25 all in, uncapped overage, a required provider-managed end-user account, or missing post-termination snapshot rights disqualifies the offer before catalog testing.
