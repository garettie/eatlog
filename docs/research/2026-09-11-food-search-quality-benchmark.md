# Food search quality benchmark: Eatlog vs FatSecret

## Question

Would a US-only FatSecret database give better results than Eatlog's USDA and Open Food Facts search for ordinary foods, and where does the gap come from?

FatSecret is not a shipping option on any tier. Its terms require food names, portions, and macros to be deleted or re-fetched within 24 hours and deleted when the license ends, and they apply the same way to Basic, Premier Free, and Premier ([terms](https://platform.fatsecret.com/terms), [storable data](https://platform.fatsecret.com/docs/guides/storable-data)). This benchmark only measures result quality.

## Method

- **Queries.** The 45 common and 5 branded queries from `scripts/evaluate-food-search.ts`. No Filipino dishes, because neither USDA/OFF nor FatSecret's US dataset has them.
- **Eatlog.** The app's own pipeline (`createFoodSearchRemoteProviders` + `FoodSearchEngine.searchRemote`) against the deployed Worker, with the OFF user agent the app sends, no personal history, and requests 2.5 s apart. Common queries use `common` mode (USDA FNDDS, SR Legacy, Foundation). Branded queries use `full` mode (adds USDA Branded and OFF). Captured 2026-09-11.
- **FatSecret.** The public website search at `foods.fatsecret.com/calories-nutrition/search`, top 5 per query, captured the same day. This is the consumer site, not the Platform API.
- **Grades.**
  - *Right food in top 3:* the plain or named form a person most likely meant. Mixed dishes, flours, desserts, syrups, or a different food containing the word do not count.
  - *Serving:* the top result's default amount. A real unit (slice, cup, oz, large) or a 100 g reference.
  - *Failed:* the search returned an error or nothing.

## Results

| | Eatlog | FatSecret |
|---|---|---|
| Common: right food in top 3 | **20 / 45** (44%) | **45 / 45** (100%) |
| Common: searches that failed | **15 / 45** (33%) | 0 / 45 |
| Common: right food when the search returned anything | 20 / 30 (67%) | 45 / 45 |
| Common: top result has a real serving | **0 / 45** | 37 / 45 (82%) |
| Branded: right food in top 3 | 5 / 5 (2 with USDA half failed) | 5 / 5 |
| Branded: top result has a real serving | 1 / 5 | 5 / 5 |

### Common queries

| Query | Eatlog top 3 | Eatlog grade | FatSecret top 3 | FatSecret grade |
|---|---|---|---|---|
| rice | Rice Dressing; Rice Paper; Rice Pilaf | Miss · 100 g | White Rice; Jasmine Rice (Dream Dinners); Cooked Rice | Hit · 1 cup cooked |
| white rice | Beans And White Rice; Rice White Cooked Glutinous; Black Beans And White Rice | Miss · 100 g | White Rice; White Rice (Long-Grain, Cooked); Steamed Rice | Hit · 1 cup cooked |
| brown rice | Beans And Brown Rice; Flavored Rice Brown And Wild; Black Beans And Brown Rice | Miss · 100 g | Brown Rice; Fully Cooked Long Grain Brown Rice (Trader Joe's); Brown Rice (Kroger) | Hit · 1 cup cooked |
| bread | Bread Fruit; Bread Naan; Bread Zucchini | Miss · 100 g | Bread; Multi Grain Whole Grain Bread (Shaw's); Whole Wheat Bread | Hit · 1 regular slice |
| pasta | none | Failed (502) | Penne; Spaghetti; Rotini Pasta (Barilla) | Hit · 1 cup cooked |
| oatmeal | Oatmeal Multigrain; Oatmeal Nfs; Oatmeal Reduced Sugar | Hit · 100 g | Oatmeal; 100% Whole Grain Oatmeal (Quaker); Old Fashioned Oatmeal (Kroger) | Hit · 1 cup cooked |
| egg | Egg Benedict; Egg Creamed; Egg Deviled | Miss · 100 g | Egg; Egg (Great Value); Fried Egg | Hit · 1 large |
| chicken breast | none | Failed (502) | Chicken Breast; Skinless Chicken Breast; Chicken Breast (Kirkland Signature) | Hit · 100 g |
| fried chicken | Rice Fried With Chicken; Chicken Meatless Breaded Fried; Chicken Fried With Potatoes Vegetable Frozen Meal | Miss · 100 g | Baked or Fried Coated Chicken Breast with Skin; same, thigh; same, drumstick | Hit · 1/2 small |
| ground beef | none | Failed (502) | Ground Beef (Cooked); Ground Beef 93/7 (Cub Foods); Ground Beef 85/15 | Hit · 1 oz cooked |
| pork chop | none | Failed (502) | Pork Chops (Top Loin, Boneless); Pork Chops (Center Loin, Bone-In, Broiled); Pork Loin Boneless Center Cut Chops (Wal-Mart) | Hit · 1 oz |
| tuna | Tuna Cake Or Patty; Tuna Salad With Cheese; Tuna Salad With Egg | Miss · 100 g | Tuna in Water (Canned); Chunk Light Tuna in Water (StarKist); Tuna | Hit · 100 g |
| tofu | Tofu Yogurt; Tofu Fried; Tofu Dried Frozen | Miss · 100 g | Organic Firm Tofu (Trader Joe's); Extra Firm Tofu (Simple Truth Organic); Firm Tofu (Nasoya) | Hit · 3 oz |
| banana | Banana Baked; Banana Raw; Banana Chips | Hit · 100 g | Bananas (USDA); Banana (Generic); Bananas (Dole) | Hit · 1 medium |
| apple | none | Failed (502) | Apples (USDA); Honeycrisp Apples; Apple (Cosmic Crisp) | Hit · 1 medium |
| potato | none | Failed (502) | Potato; Roasted Potato; Boiled Potato | Hit · 100 g |
| tomato | none | Failed (502) | Tomatoes; Tomatoes (Roma); Red Tomatoes | Hit · 100 g |
| broccoli | Broccoli Raw; Broccoli Raab Raw; Broccoli Raab Cooked | Hit · 100 g | Broccoli; Cooked Broccoli (Fat Not Added); Cooked Broccoli (Fat Added) | Hit · 1 cup chopped |
| avocado | none | Failed (502) | Avocado (Calavo); Avocados (USDA); Avocado (Avocados From Mexico) | Hit · 1 avocado |
| milk | none | Failed (502) | Whole Milk; 2% Fat Milk; 1% Fat Milk | Hit · 1 cup |
| cheddar cheese | Cheese Cheddar; Cheese Cheddar Reduced Fat; Cheese Spread American Or Cheddar Cheese Base | Hit · 100 g | Cheddar Cheese (USDA); Sharp Cheddar Cheese (Great Value); Deli Style Sliced Natural Cheddar Cheese (Sargento) | Hit · 1 slice |
| yogurt | none | Failed (502) | Plain Yogurt; Light Nonfat Yogurt (Great Value); Nonfat Plain Greek Yogurt (Chobani) | Hit · 100 g |
| butter | none | Failed (502) | Butter (USDA); Butter (Salted) (USDA); Salted Butter (Land O'Lakes) | Hit · 1 tbsp |
| peanut butter | none | Failed (502) | Peanut Butter; Creamy Peanut Butter (Skippy); Creamy Peanut Butter (Jif) | Hit · 1 tbsp |
| hamburger | Hamburger; Hamburger Slider; Hamburger Nfs | Hit · 100 g | Ground Beef 80/20; Hamburger on Bun; Ground Beef 85/15 Patty | Hit · 1 oz |
| pizza | Pizza Rolls; Pizza No Cheese Thick Crust; Pizza Hut 12 Cheese Pizza Pan Crust | Hit · 100 g | Cheese Pizza; Pizza with Meat; 14" Pepperoni Pizza | Hit · 1 piece |
| pancakes | Pancake Syrup; Pancakes Chocolate; Pancakes Fruit | Miss · 100 g | Plain Pancakes (USDA); Pancakes with Butter and Syrup (USDA); Homestyle Pancakes (Aunt Jemima) | Hit · 1 pancake |
| sandwich | Sandwich Spread; Sandwich Nfs; Crackers Sandwich | Hit · 100 g | Ham and Cheese Sandwich (USDA); Sandwich; Turkey Sandwich | Hit · 1 sandwich |
| fried rice | Rice Fried Meatless; Rice Fried Nfs; Rice Fried With Beef | Hit · 100 g | Fried Rice; Chinese Fried Rice; Meatless Fried Rice | Hit · 1 cup |
| chicken soup | Soup Chicken; Soup Chicken Noodle; Soup Chicken Canned | Hit · 100 g | Chicken Soup; Chicken Noodle Soup (Home Recipe); Chicken Vegetable Soup | Hit · 1 cup |
| coffee | Coffee Brewed; Coffee Substitute; Coffee Cappuccino | Hit · 100 g | Coffee; Coffee (Brewed From Grounds); Coffee with Cream | Hit · 1 mug |
| orange juice | Orange Juice 100 Nfs; Orange Juice Beverage 40 50 Juice Light; Orange Juice 100 Frozen Reconstituted | Hit · 100 g | Orange Juice; 100% Pure Florida Orange Juice (Florida's Natural); 100% Pure Orange Juice (Simply Orange) | Hit · 1 cup |
| soda | Whiskey And Soda; Vodka And Soda; Bread Irish Soda | Miss · 100 g | Soda (Generic); Pepsi; Soda (Pepsi) | Hit · 1 can |
| potato chips | Potato Chips Nfs; Potato Chips Plain; Potato Chips Unsalted | Hit · 100 g | Potato Chips; Wavy Original Potato Chips (Lay's); Original Potato Chips (Great Value) | Hit · 1 single-serving bag |
| granola bar | Cereal Or Granola Bar (three identical rows) | Hit · 100 g | Chewy Granola Bars Chocolate Chip (Quaker); Crunchy Granola Bars Oats 'N Honey (Nature Valley); Chewy Dipps Granola Bars (Quaker) | Hit · 1 bar |
| raw chicken breast | none | Failed (502) | Skinless Chicken Breast; Raw Chicken Breast Pieces (Foster Farms); Raw Boneless Skinless Chicken Breast Pieces (Pilgrim's Pride) | Hit · 100 g |
| grilled chicken breast | none | Failed (502) | Skinless Chicken Breast; Grilled Chicken Breast; Grilled Chicken Breast (HEB) | Hit · 100 g |
| boiled egg | Egg Whole Boiled Or Poached; Egg Whole Cooked Hard Boiled | Hit · 100 g | Boiled Egg; Hard-Boiled Egg; Hard Boiled Eggs (Great Value) | Hit · 1 large |
| scrambled egg | Egg Omelet Or Scrambled Egg Made With Butter; same, margarine; same, oil | Hit · 100 g | Scrambled Egg; Scrambled Egg (Whole, Cooked); Egg | Hit · 2 eggs |
| poached egg | Egg Whole Boiled Or Poached; Egg Whole Cooked Poached | Hit · 100 g | Poached Egg (USDA); Poached Egg (Generic); 2 Poached Eggs (Village Inn) | Hit · 1 large |
| toasted bread | Bread Rye Toasted; Bread Vegetable Toasted; Bread White Toasted | Hit · 100 g | Toasted Bread; Toasted White Bread; Toasted Wheat Bran Bread | Hit · 1 regular slice |
| baked potato | Potato Baked Nfs; Potato Chips Baked Flavored; Potato Chips Baked Plain | Hit · 100 g | Baked Potato (Peel Eaten); Baked Potato (Peel Not Eaten); Russet Potatoes (Baked) | Hit · 1 medium |
| canned tuna | none | Failed (network) | Canned Tuna (Great Value); Canned Tuna in Water (Chicken of the Sea); Tuna in Water (Canned) | Hit · 1 can drained |
| frozen broccoli | Broccoli Frozen Cooked With Oil; same, butter or margarine; same, no added fat | Hit · 100 g | Frozen Broccoli Florets (Great Value); Frozen Broccoli Cuts (Kroger); Frozen Broccoli Florets (Trader Joe's) | Hit · 1 cup |
| steamed rice | Rice White Steamed Chinese Restaurant | Hit · 100 g | Steamed Rice; Steamed Rice (Boiling Point); White Rice (Long-Grain, Cooked) | Hit · 100 g |

### Branded queries

| Query | Eatlog top 3 | Eatlog grade | FatSecret top 3 | FatSecret grade |
|---|---|---|---|---|
| Coca Cola | Coca Cola (OFF, no brand shown, three rows) | Hit · 100 g | Coca-Cola Classic 12 oz; Diet Coke; Coke Zero | Hit · 1 can |
| Oreo cookies | Oreo Cookies (OFF, three rows) | Hit, USDA half 502 · 100 g | Chocolate Sandwich Cookies (Oreo); Double Stuf Sandwich Cookies (Oreo); Oreo Thins | Hit · 3 cookies |
| Nutella hazelnut spread | Nutella Hazelnut Spread; Nutella Hazelnut Spread With Cocoa (two rows) | Hit · 100 g | Hazelnut Spread (Nutella); Nutella Mini Cups; Nutella & Go! | Hit · 2 tbsp |
| Cheerios cereal | Cheerios Cereal (General Mills); Cheerios Cereal (General Mills Sales Inc.); Cheerios Cereal (OFF) | Hit · 3/4 cup (20g) (age 1-3 years) | Cheerios; Honey Nut Cheerios; Whole Grain Cheerios | Hit · 1 1/2 cups |
| Jif peanut butter | Jif Peanut Butter; Jif Peanut Butter Creamy; Jif Peanut Butter Chocolate | Hit, USDA half 502 · 100 g | Creamy Peanut Butter (Jif); Natural Creamy Peanut Butter (Jif); Extra Crunchy Peanut Butter (Jif) | Hit · 2 tbsp |

## Where the gap comes from

### 1. A third of common searches fail because of an Eatlog Worker bug

All 16 Worker failures (14 common searches plus the USDA half of 2 branded ones) returned `502 MALFORMED_UPSTREAM`, "Upstream service returned an invalid food." `worker/src/index.ts:1122-1125` rejects the whole USDA page if any one of its 25 foods fails `normalizeUsdaFood`, which requires nutrient IDs 1008, 1003, 1005, and 1004.

Checked against USDA directly for three of the queries:

- "chicken breast": "Chicken, breast, boneless, skinless, raw" and "Chicken, breast, meat and skin, raw" (Foundation) report energy only as 2047/2048, not 1008. "Lunchmeat, chicken breast, sliced" (Foundation) has none of the four.
- "pork chop": "Pork, chop, center cut, raw" (Foundation) reports energy only as 2047/2048.
- "milk": "Milk, human" (FNDDS) has none of the four.

The failing searches are staples: chicken breast, milk, apple, potato, tomato, butter, peanut butter, pasta, yogurt, ground beef, avocado. The "canned tuna" failure was a network error and succeeded on retry.

### 2. Ranking hands the tiebreak to USDA

The 30 common searches that did return got the right food in the top 3 in 20 cases. The comparator in `src/services/foodSearchCore.ts:237-278` sorts by match class, then personal history, then preparation, usability, and data type, and finally by USDA's own order. Every FNDDS result that starts with the query word ("Rice Dressing", "Rice Paper", "Egg Benedict", "Bread Fruit") lands in the same match class as the plain food. With no history, USDA's order decides, and it puts dishes first.

### 3. No servings in the result list

All 45 common searches defaulted the top result to a 100 g reference. The USDA search response carried no portions for any of them. Portions arrive only from the per-food detail call (`loadFoodDetails`) after a food is opened, which this benchmark did not measure. FatSecret shows a real unit on 37 of 45.

### 4. Names read like database rows

USDA descriptions come through flattened and inverted: "Oatmeal Nfs", "Orange Juice 100 Nfs", "Egg Omelet Or Scrambled Egg Ns As To Fat", "Cheese Cheddar", "Soup Chicken". OFF rows showed no brand and repeated ("Coca Cola" three times, "Oreo Cookies" three times).

### 5. FatSecret's generic foods are largely USDA's

Several FatSecret results are labeled "(USDA)": Bananas, Apples, Butter, Cheddar Cheese, Plain Pancakes, Poached Egg. Its chicken breast (195 kcal, 29.55 g protein per 100 g) matches USDA's roasted breast with skin. FatSecret's advantage for common foods is cleaned-up names, ranking, and servings on top of that data, plus branded US products with store-label servings.

## Caveats

- Grades are one reviewer's judgment against the rubric above.
- FatSecret results come from its public website, not the API, and were not re-fetched for the spot-check, because WebFetch caches pages for 15 minutes.
- USDA's `DEMO_KEY` rate limit stopped the per-record nutrient check after three queries. The Worker's error message confirms the same rejection path for all 16 failures, but the specific bad record was identified only for chicken breast, pork chop, and milk.
- Spot-check: re-running rice, egg, and tofu through the Worker returned the same top 5. Apple returned 502 again. Canned tuna, a network failure during capture, succeeded on retry.
