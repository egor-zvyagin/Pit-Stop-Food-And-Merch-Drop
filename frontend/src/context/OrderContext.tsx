"use client";

import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";

import { CATALOG_ITEMS, CATALOG_BY_ID, resolveOptionLabels } from "@/data/catalog";
import { PIT_STOPS, PitStop, PitStopId } from "@/data/pitStopConstantData";
import { COLLECT_STATUS, CollectStatus } from "@/data/collectConstantData";
import { TicketProfile } from "@/lib/types";

export type ActiveOrderItem = {
  itemId: string;
  quantity: number;
  unitPrice: number;
  name?: string;
  image?: string;
  isFree?: boolean;
  /** Kitchen option labels, e.g. ["No pickles"]. */
  options?: string[];
};

/**
 * Cart lines are keyed by item and chosen options, so "burger" and
 * "burger, no pickles" are separate lines. An item with no options keeps its
 * plain ID as the key.
 */
export function lineKey(itemId: string, optionIds: readonly string[] = []): string {
  if (optionIds.length === 0) return itemId;
  return `${itemId}~${[...optionIds].sort().join("+")}`;
}

export function parseLineKey(key: string): { itemId: string; optionIds: string[] } {
  const [itemId, rest] = key.split("~");
  return { itemId, optionIds: rest ? rest.split("+").filter(Boolean) : [] };
}

export type CartLine = {
  key: string;
  itemId: string;
  optionIds: string[];
  optionLabels: string[];
  quantity: number;
  unitPrice: number;
};

export type ActiveOrder = {
  reference: string;
  orderId?: string;
  collectionCode: string;
  pinCode?: string;
  pitStopId: PitStopId | string;
  items: ActiveOrderItem[];
  totalPaid: number;
  rewardPoints: number;
  status: CollectStatus | string;
  estimatedMinutes?: number;
  qrCodeSrc?: string;
  qrPayload?: string;
  lockerNumber?: string;
  stationName?: string;
  createdAt?: string;
  /** True for a Demo Mode order that never reached the server. */
  isLocalDemo?: boolean;
};

export type PlaceOrderInput = {
  totalPaid: number;
  rewardPoints: number;
  freeItemId?: string | null;
  reference?: string;
  collectionCode?: string;
  qrPayload?: string;
  lockerNumber?: string;
  ticketCode?: string;
  isLocalDemo?: boolean;
};

export const DEMO_TICKETS: Record<string, TicketProfile> = {
  "GP-3820-X": {
    ticketCode: "GP-3820-X",
    verified: true,
    holderName: "Alex Morgan",
    ticketType: "Grandstand, three-day",
    viewingArea: {
      grandstand: "Clark Grandstand (VIP)",
      turn: "Turn 9",
      seat: "Row H, Seat 14",
      nearestGate: "Gate 3 (Canterbury Rd)",
      recommendedDropStation: "M2",
    },
    loyaltyTier: "VIP Fan",
    loyaltyPoints: 1850,
  },
  "GP-9014-P": {
    ticketCode: "GP-9014-P",
    verified: true,
    holderName: "Jordan Lee",
    ticketType: "Grandstand, Sunday",
    viewingArea: {
      grandstand: "Waite Grandstand",
      turn: "Turn 11",
      seat: "Row K, Seat 22",
      nearestGate: "Gate 5 (Fitzroy St)",
      recommendedDropStation: "M3",
    },
    loyaltyTier: "Gold Fan",
    loyaltyPoints: 720,
  },
};

export interface OrderContextType {
  // Pit Stop
  selectedPitStopId: PitStopId | null;
  selectedPitStop: PitStop | undefined;
  setSelectedPitStopId: (id: PitStopId) => void;

  // Cart
  quantities: Record<string, number>;
  /** Non-empty cart lines with names resolved, in the order they were added. */
  cartLines: CartLine[];
  addToCart: (itemId: string, optionIds?: string[], qty?: number) => void;
  increaseQuantity: (id: string) => void;
  decreaseQuantity: (id: string) => void;
  setQuantity: (id: string, qty: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;

  // Active Order
  activeOrder: ActiveOrder | null;
  setActiveOrder: (order: ActiveOrder | null | ((prev: ActiveOrder | null) => ActiveOrder | null)) => void;
  updateActiveOrderStatus: (status: CollectStatus | string) => void;
  placeOrder: (input: PlaceOrderInput) => ActiveOrder | null;
  resetOrderState: () => void;

  // Ticket Profile
  ticketProfile: TicketProfile | null;
  activeTicketCode: string;
  switchTicket: (code: string) => Promise<boolean>;
  setTicketProfile: (profile: TicketProfile) => void;
}

const OrderContext = createContext<OrderContextType | undefined>(undefined);

function createEmptyQuantities(): Record<string, number> {
  const initial: Record<string, number> = {};
  for (const item of CATALOG_ITEMS) {
    initial[item.id] = 0;
  }
  return initial;
}

export function OrderProvider({ children }: { children: ReactNode }) {
  const [selectedPitStopId, setSelectedPitStopId] = useState<PitStopId | null>("M2");
  const [quantities, setQuantities] = useState<Record<string, number>>(createEmptyQuantities());
  const [activeOrder, setActiveOrder] = useState<ActiveOrder | null>(null);
  const [activeTicketCode, setActiveTicketCode] = useState<string>("GP-3820-X");
  const [ticketProfile, setTicketProfile] = useState<TicketProfile | null>(DEMO_TICKETS["GP-3820-X"]);

  // Hydrate from localStorage
  useEffect(() => {
    try {
      // 1. Ticket
      const savedTicket = localStorage.getItem("ausgp_ticket_code");
      const targetTicketCode = savedTicket || "GP-3820-X";
      // Reads browser storage after hydration: reading it during render would
      // make the server and client HTML differ.
      setActiveTicketCode(targetTicketCode);

      const cachedProfile = localStorage.getItem("ausgp_ticket_profile");
      if (cachedProfile) {
        setTicketProfile(JSON.parse(cachedProfile));
      } else if (DEMO_TICKETS[targetTicketCode]) {
        setTicketProfile(DEMO_TICKETS[targetTicketCode]);
      }

      // 2. Active Order
      const savedOrder = localStorage.getItem("ausgp_active_order");
      if (savedOrder) {
        const parsed = JSON.parse(savedOrder);
        setActiveOrder(parsed);
        if (parsed.pitStopId) {
          setSelectedPitStopId(parsed.pitStopId);
        }
      }

      // 3. Cart
      const savedCart = localStorage.getItem("pitstop_cart_v1");
      if (savedCart) {
        const parsedCart = JSON.parse(savedCart) as Record<string, number>;
        const valid: Record<string, number> = {};
        for (const [key, qty] of Object.entries(parsedCart)) {
          if (CATALOG_BY_ID.has(parseLineKey(key).itemId) && Number(qty) > 0) {
            valid[key] = Math.min(20, Math.floor(Number(qty)));
          }
        }
        setQuantities({ ...createEmptyQuantities(), ...valid });
      }

      // 4. Station
      const savedStation = localStorage.getItem("ausgp_pitstop_id");
      if (savedStation) {
        setSelectedPitStopId(savedStation as PitStopId);
      }
    } catch {
      // Ignore localStorage read errors
    }
  }, []);

  // Persist order changes
  useEffect(() => {
    try {
      if (activeOrder) {
        localStorage.setItem("ausgp_active_order", JSON.stringify(activeOrder));
      } else {
        localStorage.removeItem("ausgp_active_order");
      }
    } catch {
      // Ignore
    }
  }, [activeOrder]);

  // Persist the cart so a reload or a dropped connection keeps it
  const cartHydrated = React.useRef(false);
  useEffect(() => {
    if (!cartHydrated.current) {
      cartHydrated.current = true;
      return;
    }
    try {
      const nonEmpty = Object.fromEntries(Object.entries(quantities).filter(([, q]) => q > 0));
      localStorage.setItem("pitstop_cart_v1", JSON.stringify(nonEmpty));
    } catch {
      // Ignore
    }
  }, [quantities]);

  // Persist ticket changes
  const switchTicket = useCallback(async (code: string): Promise<boolean> => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return false;

    // Check demo tickets first
    if (DEMO_TICKETS[trimmed]) {
      const demo = DEMO_TICKETS[trimmed];
      setActiveTicketCode(trimmed);
      setTicketProfile(demo);
      try {
        localStorage.setItem("ausgp_ticket_code", trimmed);
        localStorage.setItem("ausgp_ticket_profile", JSON.stringify(demo));
      } catch {
        // Ignore
      }
      return true;
    }

    // Try server verification API
    try {
      const res = await fetch("/api/auth/verify-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketCode: trimmed }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setActiveTicketCode(trimmed);
        setTicketProfile(data.data);
        try {
          localStorage.setItem("ausgp_ticket_code", trimmed);
          localStorage.setItem("ausgp_ticket_profile", JSON.stringify(data.data));
        } catch {
          // Ignore
        }
        return true;
      }
    } catch {
      // Offline fallback
    }

    // Fallback profile for custom unverified ticket
    const customProfile: TicketProfile = {
      ticketCode: trimmed,
      verified: true,
      holderName: "Trackside Guest",
      ticketType: "General Admission Pass",
      viewingArea: {
        grandstand: "General Admission",
        turn: "Turn 1",
        seat: "Standing Area",
        nearestGate: "Gate 1",
        recommendedDropStation: "M1",
      },
      loyaltyTier: "Bronze Fan",
      loyaltyPoints: 100,
    };
    setActiveTicketCode(trimmed);
    setTicketProfile(customProfile);
    try {
      localStorage.setItem("ausgp_ticket_code", trimmed);
      localStorage.setItem("ausgp_ticket_profile", JSON.stringify(customProfile));
    } catch {
      // Ignore
    }
    return true;
  }, []);

  const selectedPitStop = useMemo(() => {
    return PIT_STOPS.find((stop) => stop.id === selectedPitStopId);
  }, [selectedPitStopId]);

  const handleSetSelectedPitStopId = useCallback((id: PitStopId) => {
    setSelectedPitStopId(id);
    try {
      localStorage.setItem("ausgp_pitstop_id", id);
    } catch {
      // Ignore
    }
  }, []);

  const addToCart = useCallback((itemId: string, optionIds: string[] = [], qty = 1) => {
    const key = lineKey(itemId, optionIds);
    setQuantities((current) => ({
      ...current,
      [key]: Math.min(20, (current[key] ?? 0) + qty),
    }));
  }, []);

  const increaseQuantity = useCallback((id: string) => {
    setQuantities((current) => ({
      ...current,
      [id]: Math.min(20, (current[id] ?? 0) + 1),
    }));
  }, []);

  const decreaseQuantity = useCallback((id: string) => {
    setQuantities((current) => ({
      ...current,
      [id]: Math.max(0, (current[id] ?? 0) - 1),
    }));
  }, []);

  const setQuantity = useCallback((id: string, qty: number) => {
    setQuantities((current) => ({
      ...current,
      [id]: Math.max(0, qty),
    }));
  }, []);

  const clearCart = useCallback(() => {
    setQuantities(createEmptyQuantities());
  }, []);

  const totalItems = useMemo(() => {
    return Object.values(quantities).reduce((total, q) => total + q, 0);
  }, [quantities]);

  const cartLines = useMemo<CartLine[]>(() => {
    const lines: CartLine[] = [];
    for (const [key, qty] of Object.entries(quantities)) {
      if (qty <= 0) continue;
      const { itemId, optionIds } = parseLineKey(key);
      const catItem = CATALOG_BY_ID.get(itemId);
      if (!catItem) continue;
      const unitPrice = catItem.price;
      lines.push({
        key,
        itemId,
        optionIds,
        optionLabels: resolveOptionLabels(itemId, optionIds),
        quantity: qty,
        unitPrice,
      });
    }
    return lines;
  }, [quantities]);

  const totalPrice = useMemo(() => {
    return cartLines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  }, [cartLines]);

  const placeOrder = useCallback(
    ({
      totalPaid,
      rewardPoints,
      freeItemId,
      reference,
      collectionCode,
      qrPayload,
      lockerNumber,
      isLocalDemo,
    }: PlaceOrderInput): ActiveOrder | null => {
      if (!selectedPitStopId || totalItems === 0) return null;

      const orderItems: ActiveOrderItem[] = [];

      for (const line of cartLines) {
        const catItem = CATALOG_BY_ID.get(line.itemId);
        orderItems.push({
          itemId: line.itemId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          name: catItem?.name || line.itemId,
          image: catItem?.image || "/images/burger.jpg",
          options: line.optionLabels.length > 0 ? line.optionLabels : undefined,
        });
      }

      if (freeItemId) {
        const catItem = CATALOG_BY_ID.get(freeItemId);
        orderItems.push({
          itemId: freeItemId,
          quantity: 1,
          unitPrice: 0,
          name: catItem?.name || freeItemId,
          image: catItem?.image || "/images/burger.jpg",
          isFree: true,
        });
      }

      const orderNumber = collectionCode || Date.now().toString().slice(-4);
      const ref = reference || `GP-2026-${orderNumber}`;

      const newOrder: ActiveOrder = {
        reference: ref,
        orderId: ref,
        collectionCode: orderNumber,
        pinCode: orderNumber,
        pitStopId: selectedPitStopId,
        stationName: selectedPitStop?.name || `Pit Stop ${selectedPitStopId}`,
        createdAt: new Date().toISOString(),
        items: orderItems,
        totalPaid,
        rewardPoints,
        status: COLLECT_STATUS.RECEIVED,
        estimatedMinutes: 3,
        qrPayload: qrPayload || `AGPC1.AGPC-2027-KEY-01.DEMO.${ref}`,
        lockerNumber: lockerNumber || "#04",
        isLocalDemo: Boolean(isLocalDemo),
      };

      setActiveOrder(newOrder);
      setQuantities(createEmptyQuantities());
      return newOrder;
    },
    [selectedPitStopId, selectedPitStop, totalItems, cartLines]
  );

  const updateActiveOrderStatus = useCallback((status: CollectStatus | string) => {
    setActiveOrder((current) => {
      if (!current) return null;
      return { ...current, status };
    });
  }, []);

  const resetOrderState = useCallback(() => {
    setSelectedPitStopId("M2");
    setQuantities(createEmptyQuantities());
    setActiveOrder(null);
    try {
      localStorage.removeItem("ausgp_active_order");
    } catch {
      // Ignore
    }
  }, []);

  return (
    <OrderContext.Provider
      value={{
        selectedPitStop,
        selectedPitStopId,
        setSelectedPitStopId: handleSetSelectedPitStopId,
        quantities,
        cartLines,
        addToCart,
        increaseQuantity,
        decreaseQuantity,
        setQuantity,
        clearCart,
        totalItems,
        totalPrice,
        activeOrder,
        setActiveOrder,
        updateActiveOrderStatus,
        placeOrder,
        resetOrderState,
        ticketProfile,
        activeTicketCode,
        switchTicket,
        setTicketProfile,
      }}
    >
      {children}
    </OrderContext.Provider>
  );
}

export function useOrder(): OrderContextType {
  const context = useContext(OrderContext);
  if (!context) {
    throw new Error("useOrder must be used inside OrderProvider");
  }
  return context;
}

export default OrderProvider;
