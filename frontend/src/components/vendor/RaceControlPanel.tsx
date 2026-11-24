'use client';

import { useEffect, useState } from 'react';
import type { CircuitFlag, CircuitState } from '@/lib/types';
import { useLiveCatalog } from '@/lib/useLiveCatalog';

const FLAGS: { flag: CircuitFlag; label: string; effect: string; active: string }[] = [
  { flag: 'GREEN_FLAG', label: 'Green Flag', effect: '10% off, normal queues', active: 'border-[#3ccf7f] bg-[#3ccf7f]/15 text-[#7ee2a8]' },
  { flag: 'SAFETY_CAR', label: 'Safety Car', effect: 'No discount, queues ×1.6', active: 'border-[#ffd100] bg-[#ffd100]/15 text-[#ffd100]' },
  { flag: 'RED_FLAG', label: 'Red Flag', effect: 'No discount, queues ×2', active: 'border-[#ff5a4e] bg-[#ff5a4e]/15 text-[#ff9b93]' },
  { flag: 'POST_RACE', label: 'Chequered', effect: '15% off, queues ×1.2', active: 'border-white bg-white/10 text-white' },
];

/**
 * Race control and stock. The flag sets prices and queue estimates in the
 * fan app; stock shows what is about to run out.
 */
export default function RaceControlPanel({
  vendorPin,
  onNotice,
}: {
  vendorPin: string;
  onNotice: (message: string, type?: 'success' | 'warning' | 'info') => void;
}) {
  const [circuit, setCircuit] = useState<CircuitState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const items = useLiveCatalog();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/circuit/status', { cache: 'no-store' });
        const data = await res.json();
        const state = data.circuit ?? data.data;
        if (!cancelled && data.success && state) setCircuit(state);
      } catch {
        // Offline: keep the last flag.
      }
    }
    void load();
    const id = setInterval(load, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  async function setFlag(flag: CircuitFlag) {
    if (busy || circuit?.flag === flag) return;
    setBusy(flag);
    try {
      const res = await fetch('/api/circuit/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Vendor-Pin': vendorPin },
        body: JSON.stringify({ flag }),
      });
      const data = await res.json();
      if (data.success) {
        setCircuit(data.circuit ?? data.data ?? ({ ...circuit, flag } as CircuitState));
        onNotice(`Race control set to ${FLAGS.find((f) => f.flag === flag)?.label}. Fan prices update within seconds.`, 'success');
      } else {
        onNotice(data.error ?? 'The flag was not changed.', 'warning');
      }
    } catch {
      onNotice('No connection, so the flag was not changed.', 'warning');
    } finally {
      setBusy(null);
    }
  }

  async function restock(body: Record<string, unknown>, done: string) {
    setBusy(JSON.stringify(body));
    try {
      const res = await fetch('/api/inventory/restock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Vendor-Pin': vendorPin },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      onNotice(data.success ? done : data.error ?? 'Stock was not changed.', data.success ? 'success' : 'warning');
    } catch {
      onNotice('No connection, so stock was not changed.', 'warning');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section aria-labelledby="race-heading" className="rounded-[14px] bg-[#191c20] p-4">
        <h2 id="race-heading" className="text-[17px] font-semibold">
          Race control
        </h2>
        <p className="mt-0.5 text-[13px] text-[#9aa3ab]">Set this when the flag changes on track.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {FLAGS.map((f) => {
            const on = circuit?.flag === f.flag;
            return (
              <button
                key={f.flag}
                type="button"
                onClick={() => void setFlag(f.flag)}
                disabled={busy !== null}
                aria-pressed={on}
                className={`rounded-[10px] border px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${
                  on ? f.active : 'border-[#353b42] text-white hover:bg-[#2c3238]'
                }`}
              >
                <span className="block text-[15px] font-semibold">{f.label}</span>
                <span className={`block text-[12px] ${on ? 'opacity-90' : 'text-[#9aa3ab]'}`}>{f.effect}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="stock-heading" className="rounded-[14px] bg-[#191c20] p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="stock-heading" className="text-[17px] font-semibold">
            Stock
          </h2>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void restock({ mode: 'restock_all', stock: 50 }, 'Every item restocked to 50.')}
            className="text-[13px] font-semibold text-[#ffd100] underline underline-offset-2 disabled:opacity-50"
          >
            Restock all to 50
          </button>
        </div>
        <ul className="mt-2 divide-y divide-[#2c3238] text-[14px]">
          {items.map((item) => {
            const out = !item.inStock || item.stock <= 0;
            const low = !out && item.stock <= 5;
            return (
              <li key={item.id} className="flex items-center justify-between gap-3 py-1.5">
                <span className="min-w-0 truncate">{item.name}</span>
                <span className="flex shrink-0 items-center gap-3">
                  {item.category === 'merch' && item.isLimitedDrop && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() =>
                        void restock({ mode: 'flash_drop', itemId: item.id, stock: 10 }, `${item.name}: 10 released for a flash drop.`)
                      }
                      className="text-[12px] font-semibold text-[#9aa3ab] underline underline-offset-2 hover:text-white disabled:opacity-50"
                    >
                      Release 10
                    </button>
                  )}
                  <span
                    className={`min-w-[3.5rem] rounded-full px-2 py-0.5 text-center text-[13px] font-semibold tabular ${
                      out ? 'bg-[#ff5a4e]/15 text-[#ff9b93]' : low ? 'bg-[#ffb020]/15 text-[#ffd27a]' : 'text-[#9aa3ab]'
                    }`}
                  >
                    {out ? 'Sold out' : `${item.stock} left`}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
