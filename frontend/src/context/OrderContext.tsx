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

import { ORDER_ITEMS } from "@/data/orderConstantData";
import { CATALOG_ITEMS } from "@/data/catalog";
import { PIT_STOPS, PitStop, PitStopId } from "@/data/pitStopConstantData";
import { COLLECT_STATUS, CollectStatus } from "@/data/collectConstantData";
import { DEMO_QR_CODE_SRC } from "@/data/demoConstantData";
import { TicketProfile } from "@/lib/types";

export type ActiveOrderItem = {
  itemId: string;
  quantity: number;
  unitPrice: number;
  name?: string;
  image?: string;
  isFree?: boolean;
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
};

export const DEMO_TICKETS: Record<string, TicketProfile> = {
  "GP-3820-X": {
    ticketCode: "GP-3820-X",
    verified: true,
    holderName: "Alex Hamilton",
    ticketType: "Paddock Club VIP",
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
    holderName: "Jordan Piastri",
    ticketType: "Grandstand Pass",
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
  for (const item of ORDER_ITEMS) {
    initial[item.id] = 0;
  }
  for (const item of CATALOG_ITEMS) {
    if (!(item.id in initial)) {
      initial[item.id] = 0;
    }
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

      // 3. Station
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

  const increaseQuantity = useCallback((id: string) => {
    setQuantities((current) => ({
      ...current,
      [id]: (current[id] ?? 0) + 1,
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

  const totalPrice = useMemo(() => {
    // Combine catalog & order constant items for full coverage
    let sum = 0;
    for (const [id, qty] of Object.entries(quantities)) {
      if (qty <= 0) continue;
      const catItem = CATALOG_ITEMS.find((c) => c.id === id);
      if (catItem) {
        sum += catItem.price * qty;
      } else {
        const ordItem = ORDER_ITEMS.find((o) => o.id === id);
        if (ordItem) {
          sum += ordItem.price * qty;
        }
      }
    }
    return sum;
  }, [quantities]);

  const placeOrder = useCallback(
    ({
      totalPaid,
      rewardPoints,
      freeItemId,
      reference,
      collectionCode,
      qrPayload,
      lockerNumber,
    }: PlaceOrderInput): ActiveOrder | null => {
      if (!selectedPitStopId || totalItems === 0) return null;

      const orderItems: ActiveOrderItem[] = [];

      for (const [id, qty] of Object.entries(quantities)) {
        if (qty <= 0) continue;
        const catItem = CATALOG_ITEMS.find((c) => c.id === id);
        const ordItem = ORDER_ITEMS.find((o) => o.id === id);
        const name = catItem?.name || ordItem?.name || id.toUpperCase();
        const unitPrice = catItem?.price ?? ordItem?.price ?? 0;
        const image = catItem?.image || "/images/burger.jpg";

        orderItems.push({
          itemId: id,
          quantity: qty,
          unitPrice,
          name,
          image,
        });
      }

      if (freeItemId) {
        const catItem = CATALOG_ITEMS.find((c) => c.id === freeItemId);
        const ordItem = ORDER_ITEMS.find((o) => o.id === freeItemId);
        orderItems.push({
          itemId: freeItemId,
          quantity: 1,
          unitPrice: 0,
          name: catItem?.name || ordItem?.name || freeItemId.toUpperCase(),
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
        items: orderItems,
        totalPaid,
        rewardPoints,
        status: COLLECT_STATUS.RECEIVED,
        estimatedMinutes: 3,
        qrPayload: qrPayload || `AGPC1.AGPC-2027-KEY-01.DEMO.${ref}`,
        lockerNumber: lockerNumber || "#04",
        qrCodeSrc: DEMO_QR_CODE_SRC,
      };

      setActiveOrder(newOrder);
      setQuantities(createEmptyQuantities());
      return newOrder;
    },
    [selectedPitStopId, selectedPitStop, totalItems, quantities]
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
