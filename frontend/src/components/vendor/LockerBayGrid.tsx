'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { LockerBayStatus } from '@/lib/types';

interface OrderSummaryLike {
  orderId: string;
  pinCode: string;
  status: string;
  station: {
    id: string;
    name: string;
    lockerNumber: string;
    walkTimeMins: number;
  };
}

interface LockerBayGridProps {
  stationId: string;
  vendorPin: string;
  activeOrderId?: string;
  onSelectOrder: (orderId: string) => void;
  recentOrders?: OrderSummaryLike[];
  onBaysUpdated?: (bays: LockerBayStatus[]) => void;
}

const DEFAULT_BAYS = ['#01', '#02', '#03', '#04', '#05', '#06', '#07', '#08'];

export default function LockerBayGrid({
  stationId,
  vendorPin,
  activeOrderId,
  onSelectOrder,
  recentOrders = [],
  onBaysUpdated,
}: LockerBayGridProps) {
  const [remoteBays, setRemoteBays] = useState<LockerBayStatus[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch locker status from server if available
  const fetchLockers = useCallback(async () => {
    if (!stationId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/stations/lockers?stationId=${encodeURIComponent(stationId)}`, {
        headers: {
          'X-Vendor-Pin': vendorPin,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.bays)) {
          setRemoteBays(data.bays);
          onBaysUpdated?.(data.bays);
          return;
        }
      }
      setRemoteBays(null);
    } catch {
      // Fallback to local computation
      setRemoteBays(null);
    } finally {
      setLoading(false);
    }
  }, [stationId, vendorPin, onBaysUpdated]);

  useEffect(() => {
    fetchLockers();
    const interval = setInterval(fetchLockers, 5000);
    return () => clearInterval(interval);
  }, [fetchLockers]);

  // If remote is null (e.g. offline or route pending), compute from recentOrders
  const computedBays: LockerBayStatus[] = useMemo(() => {
    if (remoteBays && remoteBays.length > 0) {
      return remoteBays;
    }

    // Filter orders for this station that are not completed
    const stationOrders = recentOrders.filter(
      (o) =>
        (!o.station?.id || o.station.id === stationId) &&
        o.status !== 'COMPLETED'
    );

    // Build map from locker number to order
    const map = new Map<string, OrderSummaryLike>();
    for (const ord of stationOrders) {
      const locker = ord.station?.lockerNumber;
      if (locker && DEFAULT_BAYS.includes(locker)) {
        if (!map.has(locker)) {
          map.set(locker, ord);
        }
      }
    }

    // Fill unassigned orders to remaining bays
    const unassigned = stationOrders.filter(
      (o) => !o.station?.lockerNumber || !DEFAULT_BAYS.includes(o.station.lockerNumber)
    );
    let unassignedIdx = 0;

    const list: LockerBayStatus[] = DEFAULT_BAYS.map((bay) => {
      let ord = map.get(bay);
      if (!ord && unassignedIdx < unassigned.length) {
        ord = unassigned[unassignedIdx++];
      }

      if (ord) {
        return {
          bay,
          stationId,
          status: 'OCCUPIED',
          orderId: ord.orderId,
          pinCode: ord.pinCode,
          orderStatus: ord.status,
          updatedAt: new Date().toISOString(),
        };
      }

      return {
        bay,
        stationId,
        status: 'AVAILABLE',
      };
    });

    return list;
  }, [remoteBays, recentOrders, stationId]);

  // Keep parent in sync with computed bays if remote was null
  useEffect(() => {
    if (!remoteBays) {
      onBaysUpdated?.(computedBays);
    }
  }, [computedBays, remoteBays, onBaysUpdated]);

  const occupiedCount = computedBays.filter((b) => b.status === 'OCCUPIED').length;

  const tone = (orderStatus?: string) =>
    orderStatus === 'READY_FOR_PICKUP'
      ? 'border-[#3ccf7f]/60 bg-[#3ccf7f]/10'
      : orderStatus === 'PREPARING'
      ? 'border-[#ffb020]/50 bg-[#ffb020]/10'
      : 'border-[#454c54] bg-[#1d2125]';

  return (
    <section aria-labelledby="lockers-heading" className="rounded-[14px] bg-[#191c20] p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="lockers-heading" className="text-[17px] font-semibold">
          Lockers at pod {stationId}
        </h2>
        <span className="text-[13px] text-[#9aa3ab] tabular">
          {loading && !remoteBays ? 'Loading…' : `${occupiedCount} of ${computedBays.length} in use`}
        </span>
      </div>
      <ul className="mt-3 grid grid-cols-4 gap-2 lg:grid-cols-8">
        {computedBays.map((bay) => {
          const used = bay.status === 'OCCUPIED' && bay.orderId;
          const selected = used && bay.orderId === activeOrderId;
          return (
            <li key={bay.bay}>
              <button
                type="button"
                disabled={!used}
                onClick={() => bay.orderId && onSelectOrder(bay.orderId)}
                aria-label={used ? `Locker ${bay.bay}, order PIN ${bay.pinCode ?? ''}` : `Locker ${bay.bay}, empty`}
                className={`flex h-[72px] w-full flex-col justify-between rounded-[10px] border px-2 py-1.5 text-left transition-colors ${
                  used ? tone(bay.orderStatus) : 'border-dashed border-[#353b42] text-[#6f7880]'
                } ${selected ? 'ring-2 ring-[#ffd100]' : ''} ${used ? 'hover:border-white/60' : 'cursor-default'}`}
              >
                <span className="font-display text-[15px] font-bold">{bay.bay}</span>
                {used ? (
                  <span className="font-display text-[20px] font-black leading-none tabular text-[#ffd100]">{bay.pinCode ?? ''}</span>
                ) : (
                  <span className="text-[12px]">Empty</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
