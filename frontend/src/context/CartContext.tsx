'use client';

import React from 'react';
import { useOrder } from './OrderContext';
import { VIEWING_LOCATIONS } from '../data/dropPoints';
import { MenuItem } from '../data/menu';

export interface CartItem {
  item: MenuItem;
  quantity: number;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  // Passthrough wrapper since OrderProvider in OrderContext.tsx is the single source of truth
  return <>{children}</>;
}

export function useCart() {
  const order = useOrder();
  return {
    cart: [] as CartItem[],
    cartCount: order.totalItems,
    subtotal: order.totalPrice,
    discountAmount: 0,
    total: order.totalPrice,
    activeOrder: order.activeOrder,
    createOrder: () => order.activeOrder,
    clearActiveOrder: () => order.resetOrderState(),
    selectedLocation: VIEWING_LOCATIONS[0],
    setSelectedLocation: () => {},
    selectedDropPoint: VIEWING_LOCATIONS[0].dropPoints[0],
    setSelectedDropPoint: () => {},
    addToCart: (item: MenuItem) => order.increaseQuantity(item.id),
    removeFromCart: (itemId: string) => order.decreaseQuantity(itemId),
    updateQuantity: (itemId: string, delta: number) => {
      if (delta > 0) order.increaseQuantity(itemId);
      else order.decreaseQuantity(itemId);
    },
    clearCart: () => order.clearCart(),
    isGroupOrder: false,
    setIsGroupOrder: () => {},
    dynamicDiscountPct: 10,
    isDiscountActive: true,
  };
}

export default CartProvider;
