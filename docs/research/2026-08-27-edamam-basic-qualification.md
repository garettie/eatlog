# Edamam Enterprise Basic qualification

## Question

Can Eatlog use Edamam's US$14 Food Database API Enterprise Basic plan in a commercial consumer app while permanently retaining and exporting each user-confirmed food name, portion, calories, protein, carbohydrates, and fat?

## Result

Edamam's public Enterprise Basic terms fail Eatlog's permanent confirmed nutrition snapshot gate. Do not start the trial or run the Philippine acceptance benchmark unless Edamam grants a written exception that survives cancellation.

## Verified public facts

- Enterprise Basic costs US$14 per month, includes 100,000 calls per month, allows 50 food-and-nutrition requests per minute and 50 UPC requests per minute, and runs month to month. The plan page advertises a 30-day trial. This clears Eatlog's US$25 cost ceiling and 18,000-request stress envelope on published usage limits. [Food Database API plans](https://developer.edamam.com/food-database-api)
- The API covers common foods, restaurant items, packaged products, UPC/ITN/EAN lookup, calories, protein, carbohydrates, fat, and serving measures. [Food Database API overview and plans](https://developer.edamam.com/food-database-api) [Food Database API documentation](https://developer.edamam.com/food-database-api-docs)
- Enterprise Basic permits caching only `foodId` and the food label. Its plan column does not permit caching protein, net carbohydrates, total fat, or calories. The next plan, Enterprise Core at US$69 per month, permits those four values. [Food Database API plans](https://developer.edamam.com/food-database-api)
- Edamam says a canceled subscriber must return all nutritional information supplied by Edamam and may no longer use it in any form. [Edamam API FAQ](https://developer.edamam.com/api/faq)
- Edamam's API terms require permanent deletion of Edamam Content used, stored, or archived when the agreement ends. They also prohibit copying or archiving Edamam Content without prior written consent. [Edamam API Terms of Use](https://developer.edamam.com/signup)
- Edamam requires "powered by" attribution with its linked logo. [Edamam API FAQ](https://developer.edamam.com/api/faq) [Attribution guidance](https://developer.edamam.com/attribution)
- Paid credentials require an Edamam account and a credit card. The API key belongs to the developer application; the public documentation does not require each Eatlog user to hold an Edamam account. [Edamam API FAQ](https://developer.edamam.com/api/faq)

## Hard-gate assessment

| Eatlog gate | Public result |
|---|---|
| Cost at 18,000 requests per month | Pass |
| Month-to-month, no annual minimum | Pass |
| Text and UPC/EAN lookup | Pass on documented capability |
| Commercial consumer-app use | Enterprise positioning supports it, but exact display and proxy terms should be confirmed in writing |
| Cloudflare Worker proxying | Not expressly confirmed |
| Cache search and barcode responses for up to 24 hours | Fail or unknown beyond `foodId` and label |
| Permanently retain confirmed calories and macros | Fail |
| Export portable historical logs | Fail because retained Edamam nutrition may not survive cancellation |
| No provider-managed end-user account | Appears to pass; written confirmation still required |
| Philippine quality | Unknown until a production-equivalent trial runs |

The retention and cancellation failures are fatal under Eatlog's accepted benchmark. Catalog quality cannot override them.

## Only route to a trial

Ask Edamam to grant a written Enterprise Basic exception covering all of the following before entering payment details or consuming the one-time trial:

1. commercial display in Eatlog's consumer mobile app through a Cloudflare Worker, without Edamam-managed end-user accounts;
2. caching normalized search and barcode responses for up to 24 hours;
3. permanent on-device storage and export of each user-confirmed food name, portion, calories, protein, carbohydrates, and fat;
4. continued use of those historical snapshots after downgrade, cancellation, account deletion, or Edamam termination;
5. no upgrade above US$14 per month, annual commitment, MAU charge, or overage beyond a hard US$25 invoice ceiling;
6. text, common-food, branded-food, UPC/EAN, and practical-measure access for the 30-day trial and production plan;
7. Philippine catalog scope, attribution placement, support route, quota behavior, and failure responses.

Use Edamam's support control or `api@edamam.com`, both listed in its FAQ. A refusal, silence, or exception tied to Enterprise Core disqualifies Edamam. If Edamam grants every term, run the frozen 260-case Philippine-stratified benchmark through the staging Worker before selection.
