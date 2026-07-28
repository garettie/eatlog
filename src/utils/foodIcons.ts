import type { MaterialCommunityIcons } from '@expo/vector-icons';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/**
 * Keyword → food icon map. Ordered most-specific first; first hit wins.
 * Every icon name is verified against the bundled MaterialCommunityIcons
 * glyphmap — do not add names without checking they exist.
 */
const RULES: [string[], IconName][] = [
  // Poultry / meat
  [['chicken', 'poultry', 'drumstick', 'wings', 'nugget', 'tenders'], 'food-drumstick'],
  [['turkey'], 'food-turkey'],
  [['bacon', 'pork', 'ham', 'pulled'], 'pig'],
  [['steak', 'beef', 'brisket', 'roast', 'mince', 'ground'], 'food-steak'],
  [['sausage', 'hot dog', 'hotdog', 'bratwurst'], 'food-hot-dog'],
  [['burger', 'hamburger', 'cheeseburger', 'slider'], 'hamburger'],
  [['kebab', 'skewer', 'grill', 'bbq', 'barbecue'], 'grill'],
  // Seafood
  [['sushi', 'sashimi'], 'fish'],
  [['salmon', 'tuna', 'cod', 'tilapia', 'trout', 'fish', 'shrimp', 'prawn', 'seafood', 'crab', 'lobster'], 'fish'],
  // Eggs & dairy
  [['omelette', 'omelet', 'scrambled', 'fried egg'], 'egg-fried'],
  [['egg', 'eggs'], 'egg'],
  [['cheese', 'quesadilla', 'mozzarella', 'cheddar', 'parmesan'], 'cheese'],
  [['yogurt', 'yoghurt', 'parfait'], 'cup'],
  // Carbs & grains
  [['rice', 'risotto', 'quinoa', 'couscous', 'grain', 'pilaf'], 'rice'],
  [['pasta', 'spaghetti', 'penne', 'linguine', 'fettuccine', 'macaroni', 'lasagna', 'mac '], 'pasta'],
  [['noodle', 'ramen', 'pho', 'udon', 'pad thai', 'lo mein'], 'noodles'],
  [['burrito', 'wrap', 'gyro', 'taco', 'fajita', 'enchilada'], 'wrap'],
  [['croissant', 'pastry', 'danish', 'donut', 'doughnut', 'eclair'], 'food-croissant'],
  [['bread', 'toast', 'sandwich', 'bagel', 'bun', 'roll', 'brioche', 'naan', 'pita', 'sub', 'panini', 'baguette'], 'bread-slice'],
  [['pretzel'], 'pretzel'],
  [['pizza'], 'pizza'],
  [['oat', 'oatmeal', 'porridge', 'cereal', 'granola', 'muesli'], 'bowl'],
  [['pancake', 'crepe', 'waffle', 'french toast'], 'cake-variant'],
  // Produce
  [['avocado', 'guacamole'], 'leaf'],
  [['salad', 'spinach', 'kale', 'lettuce', 'greens', 'arugula', 'broccoli'], 'leaf'],
  [['carrot'], 'carrot'],
  [['corn'], 'corn'],
  [['mushroom'], 'mushroom'],
  [['tomato', 'salsa'], 'fruit-cherries'],
  [['berries', 'strawberr', 'blueberr', 'raspberr', 'blackberr', 'cherry', 'cherries'], 'fruit-cherries'],
  [['grape'], 'fruit-grapes'],
  [['pineapple', 'mango', 'papaya', 'coconut'], 'fruit-pineapple'],
  [['watermelon', 'melon'], 'fruit-watermelon'],
  [['orange', 'lemon', 'lime', 'grapefruit', 'citrus'], 'fruit-citrus'],
  [['apple', 'banana', 'peach', 'pear', 'plum', 'fruit', 'apricot'], 'food-apple'],
  [['sprout'], 'sprout'],
  // Snacks & sweets
  [['chips', 'crisps', 'fries', 'wedges', 'hash brown', 'tater'], 'french-fries'],
  [['popcorn'], 'popcorn'],
  [['peanut', 'almond', 'cashew', 'walnut', 'nuts', 'trail mix', 'pistachio', 'pecan'], 'peanut'],
  [['cookie', 'biscuit', 'brownie', 'shortbread'], 'cookie'],
  [['chocolate', 'cocoa', 'candy', 'fudge', 'truffle'], 'candy'],
  [['cake', 'cupcake', 'cheesecake', 'tiramisu'], 'cake'],
  [['ice cream', 'gelato', 'sundae', 'frozen yogurt', 'froyo'], 'ice-cream'],
  [['popsicle', 'ice pop', 'sorbet'], 'ice-pop'],
  [['muffin', 'scone'], 'muffin'],
  [['protein bar', 'granola bar', 'energy bar', 'supplement'], 'nutrition'],
  [['honey', 'jam', 'jelly', 'marmalade', 'spread'], 'pot'],
  // Soups & bowls
  [['soup', 'stew', 'chili', 'curry', 'broth', 'gumbo', 'chowder', 'mashed'], 'pot-mix'],
  [['bowl', 'stir fry', 'stir-fry', 'poke', 'buddha', 'casserole'], 'bowl-mix'],
  [['hummus', 'dip', 'guac'], 'bowl-mix-outline'],
  [['sauce', 'dressing', 'gravy', 'mayo', 'ketchup', 'mustard'], 'bowl-mix-outline'],
  // Drinks
  [['protein shake', 'smoothie', 'shake'], 'blender'],
  [['coffee', 'latte', 'cappuccino', 'espresso', 'macchiato', 'mocha', 'americano'], 'coffee'],
  [['matcha', 'green tea', 'herbal tea', 'tea', 'chai'], 'tea'],
  [['boba', 'bubble tea', 'milk tea'], 'cup'],
  [['juice', 'lemonade'], 'cup'],
  [['milk'], 'cup'],
  [['beer', 'ale', 'lager', 'stout', 'ipa'], 'beer'],
  [['wine'], 'glass-wine'],
  [['cocktail', 'margarita', 'mojito', 'martini', 'vodka', 'whiskey', 'whisky', 'rum', 'gin', 'tequila'], 'glass-cocktail'],
  [['soda', 'cola', 'soft drink', 'energy drink', 'sparkling'], 'bottle-soda'],
  [['water', 'hydration'], 'cup-water'],
  [['oil', 'vinegar'], 'bottle-wine'],
  // Beans & misc
  [['beans', 'lentil', 'chickpea', 'edamame', 'tofu', 'tempeh'], 'seed'],
  [['pot', 'crock'], 'pot'],
  // Prepared meals
  [['dumpling', 'gyoza', 'wonton', 'spring roll', 'egg roll'], 'food-variant'],
  [['charcuterie', 'platter', 'cheese board'], 'cheese'],
];

const FALLBACK: IconName = 'silverware-fork-knife';

/**
 * Pick a food-relevant icon for a logged food or meal name.
 * Deterministic and offline — works retroactively on existing logs.
 */
export function foodIcon(name: string): IconName {
  const n = name.toLowerCase();
  for (const [keywords, icon] of RULES) {
    for (const k of keywords) {
      if (n.includes(k)) return icon;
    }
  }
  return FALLBACK;
}
