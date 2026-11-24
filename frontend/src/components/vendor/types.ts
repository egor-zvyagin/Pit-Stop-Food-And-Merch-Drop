import type { OrderStatus } from '@/lib/types';

/** An order as the staff terminal shows it. */
export interface OrderSummary {
  orderId: string;
  /** Empty when the order was read from a pass offline: the PIN is not in the pass. */
  pinCode: string;
  status: OrderStatus | string;
  station: {
    id: string;
    name: string;
    /** Empty when unknown offline. */
    lockerNumber: string;
    walkTimeMins: number;
  };
  items: Array<{
    itemId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    options?: string[];
  }>;
  total: number;
  qrPayload?: string;
  createdAt?: string;
  updatedAt?: string;
  isGroupOrder?: boolean;
  seatNote?: string;
  nonce?: string;
}

export type NextStatus = 'PREPARING' | 'READY_FOR_PICKUP' | 'COMPLETED';

/** The one action that moves an order forward, by its current status. */
export function nextAction(status: string): { status: NextStatus; label: string } | null {
  switch (status) {
    case 'RECEIVED':
      return { status: 'PREPARING', label: 'Start preparing' };
    case 'PREPARING':
      return { status: 'READY_FOR_PICKUP', label: 'Mark ready' };
    case 'READY_FOR_PICKUP':
      return { status: 'COMPLETED', label: 'Mark collected' };
    default:
      return null;
  }
}

export const STATUS_LABEL: Record<string, string> = {
  RECEIVED: 'New',
  PREPARING: 'Preparing',
  READY_FOR_PICKUP: 'Ready',
  COMPLETED: 'Collected',
};

export function minutesSince(iso?: string, now = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 60000));
}
