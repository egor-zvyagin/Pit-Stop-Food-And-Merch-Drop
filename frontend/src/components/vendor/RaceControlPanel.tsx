'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '@iconify/react';
import { CircuitFlag, CircuitState } from '@/lib/types';

interface RaceControlPanelProps {
  vendorPin: string;
}

const FLAG_CONFIG: Array<{
  flag: CircuitFlag;
  label: string;
  icon: string;
  colors: { active: string; idle: string };
}> = [
  {
    flag: 'GREEN_FLAG',
    label: 'Green Flag',
    icon: 'mdi:flag',
    colors: {
      active: 'border-emerald-500 bg-emerald-500/25 text-emerald-300 shadow-lg shadow-emerald-500/25 ring-2 ring-emerald-400/50',
      idle: 'border-neutral-700 bg-neutral-900/80 text-neutral-400 hover:border-emerald-500/50 hover:text-emerald-300',
    },
  },
  {
    flag: 'SAFETY_CAR',
    label: 'Safety Car',
    icon: 'mdi:car-emergency',
    colors: {
      active: 'border-amber-500 bg-amber-500/25 text-amber-300 shadow-lg shadow-amber-500/25 ring-2 ring-amber-400/50',
      idle: 'border-neutral-700 bg-neutral-900/80 text-neutral-400 hover:border-amber-500/50 hover:text-amber-300',
    },
  },
  {
    flag: 'RED_FLAG',
    label: 'Red Flag',
    icon: 'mdi:flag',
    colors: {
      active: 'border-red-500 bg-red-500/25 text-red-300 shadow-lg shadow-red-500/25 ring-2 ring-red-400/50',
      idle: 'border-neutral-700 bg-neutral-900/80 text-neutral-400 hover:border-red-500/50 hover:text-red-300',
    },
  },
  {
    flag: 'POST_RACE',
    label: 'Post Race',
    icon: 'mdi:flag-checkered',
    colors: {
      active: 'border-indigo-500 bg-indigo-500/25 text-indigo-300 shadow-lg shadow-indigo-500/25 ring-2 ring-indigo-400/50',
      idle: 'border-neutral-700 bg-neutral-900/80 text-neutral-400 hover:border-indigo-500/50 hover:text-indigo-300',
    },
  },
];

export default function RaceControlPanel({ vendorPin }: RaceControlPanelProps) {
  const [circuitState, setCircuitState] = useState<CircuitState | null>(null);
  const [flagLoading, setFlagLoading] = useState(false);
  const [restockLoading, setRestockLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Fetch current circuit status
  const fetchCircuit = useCallback(async () => {
    try {
      const res = await fetch('/api/circuit/status');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) setCircuitState(data.data);
      }
    } catch {
      // Offline
    }
  }, []);

  useEffect(() => {
    fetchCircuit();
    const id = setInterval(fetchCircuit, 8000);
    return () => clearInterval(id);
  }, [fetchCircuit]);

  const handleFlagChange = async (flag: CircuitFlag) => {
    if (flagLoading || circuitState?.flag === flag) return;
    setFlagLoading(true);
    try {
      const res = await fetch('/api/circuit/status', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Vendor-Pin': vendorPin,
        },
        body: JSON.stringify({ flag }),
      });
      const data = await res.json();
      if (data.success) {
        setCircuitState(data.data ?? { ...circuitState, flag } as CircuitState);
        showToast(`Race control → ${flag.replace('_', ' ')}`);
      } else {
        showToast(data.error ?? 'Failed to update circuit flag', 'error');
      }
    } catch {
      showToast('Network error — circuit flag not updated', 'error');
    } finally {
      setFlagLoading(false);
    }
  };

  const handleRestock = async (mode: 'restock_all' | 'flash_drop') => {
    setRestockLoading(mode);
    try {
      const res = await fetch('/api/inventory/restock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Vendor-Pin': vendorPin,
        },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(
          mode === 'flash_drop' ? '⚡ Flash Drop triggered!' : '✓ All items restocked'
        );
      } else {
        showToast(data.error ?? 'Restock failed', 'error');
      }
    } catch {
      showToast('Network error — restock not applied', 'error');
    } finally {
      setRestockLoading(null);
    }
  };

  const activeFlag = circuitState?.flag;

  return (
    <div className="rounded-2xl border border-neutral-800 bg-[#121620] p-6 shadow-xl space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-neutral-800 pb-3">
        <Icon icon="mdi:flag-checkered" width={20} height={20} className="text-red-500" />
        <h2 className="font-display font-black text-base uppercase tracking-wider text-white">
          Race Control
        </h2>
        {activeFlag && (
          <span className="ml-auto text-xs font-mono text-neutral-400">
            Active: <span className="text-white font-bold">{activeFlag.replace('_', ' ')}</span>
          </span>
        )}
      </div>

      {/* Circuit flag buttons */}
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-2">
          Circuit Flag
        </div>
        <div className="grid grid-cols-2 gap-2">
          {FLAG_CONFIG.map(({ flag, label, icon, colors }) => (
            <button
              key={flag}
              type="button"
              disabled={flagLoading}
              onClick={() => handleFlagChange(flag)}
              className={`flex items-center gap-2 rounded-xl border p-3 font-display font-bold text-sm transition-all shadow ${
                activeFlag === flag ? colors.active + ' shadow-lg' : colors.idle
              } disabled:opacity-60`}
            >
              <Icon
                icon={icon}
                width={18}
                height={18}
                className={flag === 'RED_FLAG' ? 'text-red-400' : ''}
              />
              <span className="uppercase tracking-wide text-xs">{label}</span>
              {activeFlag === flag && (
                <span className="ml-auto text-[10px] font-black uppercase opacity-80">●</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Circuit state info */}
      {circuitState && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 text-xs text-neutral-400 space-y-1">
          <div className="flex justify-between">
            <span>Queue Multiplier</span>
            <span className="font-mono font-bold text-white">×{circuitState.queueMultiplier}</span>
          </div>
          <div className="flex justify-between">
            <span>Off-Peak Discount</span>
            <span className="font-mono font-bold text-emerald-400">
              {circuitState.offPeakDiscountPct > 0 ? `-${circuitState.offPeakDiscountPct}%` : '—'}
            </span>
          </div>
          <div className="text-neutral-500 italic truncate">{circuitState.message}</div>
        </div>
      )}

      {/* Merch Drop Buttons */}
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-2">
          Merch Drops
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={restockLoading !== null}
            onClick={() => handleRestock('restock_all')}
            className="flex items-center justify-center gap-2 rounded-xl border border-sky-500/40 bg-sky-950/30 hover:bg-sky-900/50 py-2.5 font-display font-bold text-xs uppercase tracking-wider text-sky-300 disabled:opacity-50 transition-colors"
          >
            {restockLoading === 'restock_all' ? (
              <Icon icon="mdi:loading" width={15} height={15} className="animate-spin" />
            ) : (
              <Icon icon="mdi:package-variant-closed" width={15} height={15} />
            )}
            Restock All Items
          </button>

          <button
            type="button"
            disabled={restockLoading !== null}
            onClick={() => handleRestock('flash_drop')}
            className="flex items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-950/30 hover:bg-amber-900/50 py-2.5 font-display font-bold text-xs uppercase tracking-wider text-amber-300 disabled:opacity-50 transition-colors"
          >
            {restockLoading === 'flash_drop' ? (
              <Icon icon="mdi:loading" width={15} height={15} className="animate-spin" />
            ) : (
              <Icon icon="mdi:lightning-bolt" width={15} height={15} />
            )}
            Flash Drop (2 Left)
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`rounded-xl border p-2.5 text-xs font-semibold text-center transition-all ${
            toast.type === 'success'
              ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300'
              : 'border-red-500/40 bg-red-950/30 text-red-300'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
