import { CatalogItem } from '@/lib/types';
import { CATALOG_ITEMS } from './catalog';

export type MenuCategory = 'food' | 'merch' | 'rewards';

export interface MenuItem extends CatalogItem {
  popular?: boolean;
}

// Re-export canonical catalog items
export { CATALOG_ITEMS };

// Backwards-compatible alias for existing components
export const MENU_ITEMS: MenuItem[] = CATALOG_ITEMS.map((item) => ({
  ...item,
  popular: ['apex-burger', 'pitlane-pizza', 'craft-lager', 'gp-cap-2026'].includes(item.id),
}));
