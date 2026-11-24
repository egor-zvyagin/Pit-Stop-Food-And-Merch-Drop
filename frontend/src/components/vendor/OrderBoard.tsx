'use client';

import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { CATALOG_BY_ID } from '@/data/catalog';
import { minutesSince, nextAction, OrderSummary, NextStatus } from './types';

const COLUMNS: { status: string; title: string; empty: string }[] = [
  { status: 'RECEIVED', title: 'New', empty: 'No new orders.' },
  { status: 'PREPARING', title: 'Preparing', empty: 'Nothing on the pass.' },
  { status: 'READY_FOR_PICKUP', title: 'Ready in lockers', empty: 'No orders waiting.' },
];

/** Minutes after which an order's age turns amber, then red, by column. */
const AGE_LIMITS: Record<string, [number, number]> = {
  RECEIVED: [2, 4],
  PREPARING: [6, 10],
  READY_FOR_PICKUP: [10, 20],
};

function ageTone(status: string, mins: number | null): string {
  if (mins === null) return 'text-[#9aa3ab]';
  const [warn, late] = AGE_LIMITS[status] ?? [10, 20];
  if (mins >= late) return 'text-[#ff5a4e]';
  if (mins >= warn) return 'text-[#ffb020]';
  return 'text-[#9aa3ab]';
}

function OrderCard({
  order,
  selected,
  busy,
  onSelect,
  onAdvance,
}: {
  order: OrderSummary;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onAdvance: (status: NextStatus) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const age = minutesSince(order.createdAt, now);
  const action = nextAction(String(order.status));
  const locker = order.station.lockerNumber.replace('#', '');

  return (
    <li
      className={`rounded-[12px] border bg-[#1d2125] p-3 transition-colors ${
        selected ? 'border-[#ffd100]' : 'border-[#2c3238] hover:border-[#454c54]'
      }`}
    >
      <button type="button" onClick={onSelect} className="block w-full text-left" aria-label={`Open order ${order.pinCode || order.orderId}`}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-display text-[30px] font-black leading-none tabular text-[#ffd100]">
            {order.pinCode || '----'}
          </span>
          <span className="flex items-baseline gap-3 text-[13px]">
            {locker && <span className="text-white">Locker <span className="font-display text-[18px] font-bold">{locker}</span></span>}
            {age !== null && <span className={`tabular ${ageTone(String(order.status), age)}`}>{age}m</span>}
          </span>
        </div>
        <ul className="mt-2 space-y-1 text-[14px]">
          {order.items.map((item, i) => (
            <li key={`${item.itemId}-${i}`} className="leading-snug">
              <span className="font-semibold">{item.quantity}×</span> {CATALOG_BY_ID.get(item.itemId)?.name ?? item.name}
              {item.options && item.options.length > 0 && (
                <span className="ml-1 rounded bg-[#ffd100]/15 px-1.5 py-0.5 text-[12px] font-semibold text-[#ffd100]">
                  {item.options.join(', ')}
                </span>
              )}
            </li>
          ))}
        </ul>
        {order.isGroupOrder && (
          <p className="mt-2 flex items-center gap-1 text-[12px] text-[#9aa3ab]">
            <Users size={13} aria-hidden /> Group{order.seatNote ? `: ${order.seatNote}` : ''}
          </p>
        )}
      </button>
      {action && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onAdvance(action.status)}
          className={`mt-3 h-10 w-full rounded-[8px] text-[14px] font-semibold transition-colors disabled:opacity-50 ${
            action.status === 'READY_FOR_PICKUP'
              ? 'bg-[#ffd100] text-[#1d2125] hover:bg-[#f0c200]'
              : 'border border-[#454c54] text-white hover:bg-[#2c3238]'
          }`}
        >
          {action.label}
        </button>
      )}
    </li>
  );
}

/** The kitchen's view: one column per stage, oldest order first. */
export default function OrderBoard({
  orders,
  selectedId,
  busyId,
  onSelect,
  onAdvance,
}: {
  orders: OrderSummary[];
  selectedId?: string;
  busyId?: string | null;
  onSelect: (order: OrderSummary) => void;
  onAdvance: (order: OrderSummary, status: NextStatus) => void;
}) {
  return (
    <section aria-label="Order board" className="grid min-h-[420px] grid-cols-1 gap-4 md:grid-cols-3">
      {COLUMNS.map((col) => {
        const list = orders
          .filter((o) => o.status === col.status)
          .sort((a, b) => Date.parse(a.createdAt ?? '') - Date.parse(b.createdAt ?? ''));
        return (
          <div key={col.status} className="flex min-w-0 flex-col rounded-[14px] bg-[#191c20] p-3">
            <h2 className="mb-3 flex items-center justify-between px-1 text-[15px] font-semibold">
              {col.title}
              <span className="rounded-full bg-[#2c3238] px-2 py-0.5 text-[13px] tabular">{list.length}</span>
            </h2>
            {list.length === 0 ? (
              <p className="px-1 py-6 text-center text-[14px] text-[#6f7880]">{col.empty}</p>
            ) : (
              <ul className="space-y-3">
                {list.map((order) => (
                  <OrderCard
                    key={order.orderId}
                    order={order}
                    selected={order.orderId === selectedId}
                    busy={busyId === order.orderId}
                    onSelect={() => onSelect(order)}
                    onAdvance={(status) => onAdvance(order, status)}
                  />
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}
