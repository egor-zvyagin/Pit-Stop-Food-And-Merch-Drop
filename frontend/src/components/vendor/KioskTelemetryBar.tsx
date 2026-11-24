'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from "@/components/ui/Icon";
import { CircuitState, LockerBayStatus } from '@/lib/types';
import { getPendingSyncActions, flushSyncQueue } from '@/lib/offline/syncQueue';

interface KioskTelemetryBarProps {
  vendorPin: string;
  activeOrdersCount: number;
  lockerBays: LockerBayStatus[];
  airplaneMode: boolean;
  onAirplaneModeToggle: (value: boolean) => void;
  onSyncComplete?: (resolved: number, failed: number) => void;
}

export default function KioskTelemetryBar({
  vendorPin,
  activeOrdersCount,
  lockerBays,
  airplaneMode,
  onAirplaneModeToggle,
  onSyncComplete,
}: KioskTelemetryBarProps) {
  const [circuitState, setCircuitState] = useState<CircuitState | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);
  const [lowStockAlerts, setLowStockAlerts] = useState(0);

  // Avg prep time estimate (minutes) – rough heuristic based on queue depth
  const avgPrepTime = Math.max(2, Math.round(activeOrdersCount * 1.5));

  const occupiedBays = lockerBays.filter((b) => b.status === 'OCCUPIED').length;
  const totalBays = lockerBays.length || 8;

  // Poll pending sync count
  useEffect(() => {
    const refresh = () => setPendingCount(getPendingSyncActions().length);
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, []);

  // Poll circuit state
  useEffect(() => {
    let cancelled = false;
    const fetchCircuit = async () => {
      try {
        const res = await fetch('/api/circuit/status');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data.success && data.data) setCircuitState(data.data);
        }
      } catch {
        // Offline – ignore
      }
    };
    fetchCircuit();
    const id = setInterval(fetchCircuit, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Poll low-stock from inventory
  useEffect(() => {
    let cancelled = false;
    const fetchInventory = async () => {
      try {
        const res = await fetch('/api/inventory');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data.success && Array.isArray(data.items)) {
            const low = data.items.filter(
              (item: { stock: number; inStock: boolean }) =>
                item.inStock && item.stock > 0 && item.stock <= 5
            ).length;
            setLowStockAlerts(low);
          }
        }
      } catch {
        // Offline
      }
    };
    fetchInventory();
    const id = setInterval(fetchInventory, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const handleManualSync = useCallback(async () => {
    if (syncing || airplaneMode) return;
    setSyncing(true);
    try {
      const { resolved, failed } = await flushSyncQueue(vendorPin);
      setPendingCount(getPendingSyncActions().length);
      onSyncComplete?.(resolved, failed);
      setSyncToast(
        resolved > 0
          ? `✓ Synced ${resolved} action${resolved !== 1 ? 's' : ''}${failed > 0 ? ` (${failed} failed)` : ''}`
          : failed > 0
          ? `⚠ ${failed} action${failed !== 1 ? 's' : ''} failed to sync`
          : 'Nothing to sync'
      );
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncToast(null), 3500);
    }
  }, [syncing, airplaneMode, vendorPin, onSyncComplete]);

  const flagColors: Record<string, string> = {
    GREEN_FLAG: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    SAFETY_CAR: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    RED_FLAG: 'text-red-400 bg-red-500/10 border-red-500/30',
    POST_RACE: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
  };

  const flagIcon: Record<string, string> = {
    GREEN_FLAG: 'mdi:flag',
    SAFETY_CAR: 'mdi:car-emergency',
    RED_FLAG: 'mdi:flag',
    POST_RACE: 'mdi:flag-checkered',
  };

  const flagLabel: Record<string, string> = {
    GREEN_FLAG: 'Green Flag',
    SAFETY_CAR: 'Safety Car',
    RED_FLAG: 'Red Flag',
    POST_RACE: 'Post Race',
  };

  const activeFlagKey = circuitState?.flag ?? 'GREEN_FLAG';

  return (
    <div className="rounded-2xl border border-neutral-800 bg-[#121620] p-4 shadow-xl space-y-3">
      {/* Title row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon icon="mdi:chart-line" width={18} height={18} className="text-red-500" />
          <h2 className="font-display font-black text-sm text-white">
            Kiosk Telemetry
          </h2>
        </div>

        {/* Airplane Mode Simulator toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <span className="text-xs text-neutral-400 font-medium">✈ Airplane Mode</span>
          <button
            type="button"
            role="switch"
            aria-checked={airplaneMode}
            aria-label="Airplane Mode"
            onClick={() => onAirplaneModeToggle(!airplaneMode)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
              airplaneMode ? 'bg-amber-500' : 'bg-neutral-700'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                airplaneMode ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
          {airplaneMode && (
            <span className="text-[10px] font-bold text-amber-400 border border-amber-500/30 bg-amber-500/10 rounded px-1">
              OFFLINE
            </span>
          )}
        </label>
      </div>

      {/* KPI chips */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {/* Active Orders */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-3 space-y-0.5">
          <div className="text-[11px] font-bold text-neutral-500">
            Active Orders
          </div>
          <div className="text-2xl font-display font-black text-white tabular-nums">
            {activeOrdersCount}
          </div>
        </div>

        {/* Avg Prep Time */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-3 space-y-0.5">
          <div className="text-[11px] font-bold text-neutral-500">
            Avg Prep
          </div>
          <div className="text-2xl font-display font-black text-white tabular-nums">
            ~{avgPrepTime}
            <span className="text-sm font-medium text-neutral-400 ml-1">min</span>
          </div>
        </div>

        {/* Locker Bay Utilization */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-3 space-y-0.5">
          <div className="text-[11px] font-bold text-neutral-500">
            Locker Bays
          </div>
          <div className="text-2xl font-display font-black text-white tabular-nums">
            {occupiedBays}
            <span className="text-sm font-medium text-neutral-400">/{totalBays}</span>
          </div>
          <div className="text-[10px] text-neutral-500">Occupied</div>
        </div>

        {/* Low Stock Alerts */}
        <div
          className={`rounded-xl border p-3 space-y-0.5 ${
            lowStockAlerts > 0
              ? 'border-amber-500/30 bg-amber-950/20'
              : 'border-neutral-800 bg-neutral-900/70'
          }`}
        >
          <div className="text-[11px] font-bold text-neutral-500">
            Low Stock
          </div>
          <div
            className={`text-2xl font-display font-black tabular-nums ${
              lowStockAlerts > 0 ? 'text-amber-400' : 'text-neutral-500'
            }`}
          >
            {lowStockAlerts}
          </div>
          <div className="text-[10px] text-neutral-500">Items ≤5 left</div>
        </div>
      </div>

      {/* Bottom row: circuit flag + sync badge */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {/* Active circuit flag */}
        {circuitState && (
          <div
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold ${
              flagColors[activeFlagKey] ?? flagColors.GREEN_FLAG
            }`}
          >
            <Icon icon={flagIcon[activeFlagKey] ?? 'mdi:flag'} width={14} height={14} />
            <span>{flagLabel[activeFlagKey]}</span>
            {circuitState.offPeakDiscountPct > 0 && (
              <span className="ml-1 opacity-70">−{circuitState.offPeakDiscountPct}%</span>
            )}
          </div>
        )}

        {/* Pending Cloud Sync badge */}
        <button
          type="button"
          onClick={handleManualSync}
          disabled={syncing || airplaneMode}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-all ${
            pendingCount > 0
              ? 'border-sky-500/40 bg-sky-950/30 text-sky-300 hover:bg-sky-900/50'
              : 'border-neutral-700 bg-neutral-900 text-neutral-400 hover:text-neutral-200'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          title={airplaneMode ? 'Disable Airplane Mode to sync' : 'Flush pending actions to cloud'}
        >
          <Icon
            icon={syncing ? 'mdi:loading' : 'mdi:cloud-sync-outline'}
            width={14}
            height={14}
            className={syncing ? 'animate-spin' : ''}
          />
          <span>
            {syncing ? 'Syncing…' : `Pending Cloud Sync (${pendingCount})`}
          </span>
        </button>

        {/* Sync result toast inline */}
        {syncToast && (
          <span className="text-[11px] font-semibold text-emerald-400 animate-pulse">
            {syncToast}
          </span>
        )}
      </div>
    </div>
  );
}
