'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Icon } from "@/components/ui/Icon";
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

  return (
    <div className="rounded-2xl border border-neutral-800 bg-[#121620] p-6 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
        <div className="flex items-center gap-2">
          <Icon icon="mdi:locker-multiple" width={22} height={22} className="text-red-500" />
          <h2 className="font-display font-black text-base text-white">
            Smart Locker Bays (Pod {stationId})
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-neutral-400">
            {occupiedCount}/8 Occupied
          </span>
          <button
            type="button"
            onClick={fetchLockers}
            className="text-neutral-400 hover:text-white p-1 transition-colors"
            title="Refresh bays"
          >
            <Icon icon="mdi:refresh" width={16} height={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 8-Bay Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {computedBays.map((bay) => {
          const isOccupied = bay.status === 'OCCUPIED';
          const isSelected = isOccupied && bay.orderId === activeOrderId;
          const status = bay.orderStatus || (isOccupied ? 'READY' : 'AVAILABLE');

          let badgeColor = 'bg-neutral-800 text-neutral-400 border-neutral-700';
          let borderColor = 'border-neutral-800 bg-neutral-900/60';

          if (isOccupied) {
            if (status === 'READY_FOR_PICKUP' || status === 'READY') {
              badgeColor = 'bg-blue-500/20 text-blue-400 border-blue-500/30';
              borderColor = isSelected
                ? 'border-blue-500 ring-2 ring-blue-500/40 bg-blue-950/20'
                : 'border-blue-500/40 bg-blue-950/10 hover:border-blue-500/70';
            } else if (status === 'PREPARING') {
              badgeColor = 'bg-amber-500/20 text-amber-400 border-amber-500/30';
              borderColor = isSelected
                ? 'border-amber-500 ring-2 ring-amber-500/40 bg-amber-950/20'
                : 'border-amber-500/40 bg-amber-950/10 hover:border-amber-500/70';
            } else {
              badgeColor = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
              borderColor = isSelected
                ? 'border-emerald-500 ring-2 ring-emerald-500/40 bg-emerald-950/20'
                : 'border-emerald-500/40 bg-emerald-950/10 hover:border-emerald-500/70';
            }
          }

          return (
            <button
              key={bay.bay}
              type="button"
              disabled={!isOccupied}
              onClick={() => {
                if (isOccupied && bay.orderId) {
                  onSelectOrder(bay.orderId);
                }
              }}
              className={`flex flex-col justify-between p-3.5 rounded-xl border transition-all text-left min-h-[115px] ${borderColor} ${
                isOccupied
                  ? 'cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0'
                  : 'cursor-default opacity-60'
              }`}
            >
              {/* Top row: Bay # and status badge */}
              <div className="flex items-center justify-between w-full">
                <span className="font-display font-black text-base text-white">
                  {bay.bay}
                </span>
                <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 border ${badgeColor}`}>
                  {isOccupied ? (status === 'READY_FOR_PICKUP' ? 'Ready' : status === 'PREPARING' ? 'Prep' : 'Active') : 'Free'}
                </span>
              </div>

              {/* Middle & Bottom: Order info or empty state */}
              {isOccupied ? (
                <div className="mt-2 space-y-1">
                  <div className="font-mono text-xs font-bold text-red-400 truncate">
                    {bay.orderId}
                  </div>
                  <div className="flex items-center justify-between text-xs text-neutral-300">
                    <span className="text-[11px] text-neutral-400">PIN:</span>
                    <span className="font-mono font-black text-white bg-neutral-800/80 px-1.5 py-0.5 rounded border border-neutral-700">
                      {bay.pinCode || '••••'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex items-center justify-center text-xs text-neutral-500 py-1 font-medium">
                  <Icon icon="mdi:lock-open-outline" width={16} height={16} className="mr-1 text-neutral-600" />
                  Available
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
