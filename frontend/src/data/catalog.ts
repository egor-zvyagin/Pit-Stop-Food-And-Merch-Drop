import { CatalogItem } from '@/lib/types';

/**
 * The trackside menu, the same at every pickup pod (M1 to M4).
 *
 * Item IDs are stable keys shared with the stock records in the database, so
 * they are never renamed even when an item's display name changes.
 * Products and brands are invented for this project.
 */
export const CATALOG_ITEMS: CatalogItem[] = [
  {
    id: 'apex-burger',
    name: 'Apex burger',
    category: 'food',
    subCategory: 'meal',
    price: 16.5,
    image: '/images/burger.jpg',
    prepTime: 'About 4 min',
    prepMins: 4,
    tag: 'Most ordered',
    inStock: true,
    availableUnits: 75,
    stock: 75,
    description:
      'Two smashed beef patties, cheddar, pickles, onion and house sauce on a toasted brioche bun.',
    allergens: ['Gluten', 'Milk', 'Egg', 'Sesame', 'Mustard'],
    options: [
      { id: 'no-pickles', label: 'No pickles' },
      { id: 'no-onion', label: 'No onion' },
      { id: 'no-cheese', label: 'No cheese' },
      { id: 'sauce-side', label: 'Sauce on the side' },
    ],
    isAlcoholic: false,
  },
  {
    id: 'loaded-fries',
    name: 'Loaded fries',
    category: 'food',
    subCategory: 'snack',
    price: 12.0,
    image: '/images/loaded-fries.jpg',
    prepTime: 'About 3 min',
    prepMins: 3,
    inStock: true,
    availableUnits: 60,
    stock: 60,
    description: 'Skin-on fries with smoked brisket, pickled jalapeños and warm cheese sauce.',
    allergens: ['Milk', 'Soy'],
    dietary: ['Gluten free'],
    options: [
      { id: 'no-jalapenos', label: 'No jalapeños' },
      { id: 'no-brisket', label: 'No brisket' },
    ],
    isAlcoholic: false,
  },
  {
    id: 'pitlane-pizza',
    name: 'Margherita slice box',
    category: 'food',
    subCategory: 'meal',
    price: 18.0,
    image: '/images/pizza.jpg',
    prepTime: 'About 5 min',
    prepMins: 5,
    inStock: true,
    availableUnits: 45,
    stock: 45,
    description: 'Three wood-fired slices with tomato, fior di latte and fresh basil.',
    allergens: ['Gluten', 'Milk'],
    dietary: ['Vegetarian'],
    options: [{ id: 'chilli-oil', label: 'Add chilli oil' }],
    isAlcoholic: false,
  },
  {
    id: 'craft-lager',
    name: 'Lager four-pack',
    category: 'food',
    subCategory: 'beverage',
    price: 36.0,
    image: '/images/beer.jpg',
    prepTime: 'Packed and chilled',
    prepMins: 0,
    inStock: true,
    availableUnits: 50,
    stock: 50,
    description: 'Four 375 ml cans of crisp Melbourne lager, 4.6% ABV. ID checked at pickup.',
    allergens: ['Gluten'],
    isAlcoholic: true,
  },
  {
    id: 'red-bull',
    name: 'Volt energy drink',
    category: 'food',
    subCategory: 'beverage',
    price: 6.5,
    image: '/images/energy-can.jpg',
    prepTime: 'Packed and chilled',
    prepMins: 0,
    inStock: true,
    availableUnits: 120,
    stock: 120,
    description: 'Lightly sparkling citrus energy drink, 250 ml. Contains 80 mg of caffeine.',
    dietary: ['Vegan', 'Gluten free'],
    isAlcoholic: false,
  },
  {
    id: 'still-water',
    name: 'Spring water',
    category: 'food',
    subCategory: 'beverage',
    price: 4.5,
    image: '/images/water.jpg',
    prepTime: 'Packed and chilled',
    prepMins: 0,
    inStock: true,
    availableUnits: 150,
    stock: 150,
    description: 'Still Victorian spring water, 600 ml. Free refill stations are at every gate.',
    dietary: ['Vegan', 'Gluten free'],
    isAlcoholic: false,
  },
  {
    id: 'gp-cap-2026',
    name: 'Race weekend cap',
    category: 'merch',
    subCategory: 'accessory',
    price: 65.0,
    image: '/images/cap.jpg',
    prepTime: 'Packed in your locker',
    prepMins: 0,
    tag: 'Limited run',
    inStock: true,
    availableUnits: 4,
    stock: 4,
    isLimitedDrop: true,
    description:
      'Six-panel cap with the Albert Park circuit outline embroidered on the front. One size, adjustable strap.',
    isAlcoholic: false,
  },
  {
    id: 'ferrari-tee',
    name: 'Pit crew tee',
    category: 'merch',
    subCategory: 'apparel',
    price: 95.0,
    image: '/images/crew-tee.jpg',
    prepTime: 'Packed in your locker',
    prepMins: 0,
    tag: 'Limited run',
    inStock: true,
    availableUnits: 6,
    stock: 6,
    isLimitedDrop: true,
    description:
      'Lightweight technical tee in asphalt black with hi-vis shoulder stripes. Size L, relaxed fit.',
    isAlcoholic: false,
  },
  {
    id: 'hi-fi-earplugs',
    name: 'Hearing protection',
    category: 'merch',
    subCategory: 'accessory',
    price: 18.0,
    image: '/images/earplugs.jpg',
    prepTime: 'Packed in your locker',
    prepMins: 0,
    inStock: true,
    availableUnits: 80,
    stock: 80,
    description:
      'Reusable earplugs that cut 28 dB but keep commentary clear. Comes with a cord and carry case.',
    isAlcoholic: false,
  },
];

export const CATALOG_BY_ID = new Map<string, CatalogItem>(
  CATALOG_ITEMS.map((item) => [item.id, item])
);

/** Resolve option IDs to the labels the kitchen sees, dropping unknown IDs. */
export function resolveOptionLabels(itemId: string, optionIds: readonly string[] = []): string[] {
  const item = CATALOG_BY_ID.get(itemId);
  if (!item?.options) return [];
  const wanted = new Set(optionIds);
  return item.options.filter((o) => wanted.has(o.id)).map((o) => o.label);
}
