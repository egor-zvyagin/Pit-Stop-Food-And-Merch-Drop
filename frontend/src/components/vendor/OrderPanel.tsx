'use client';

import { FormEvent } from 'react';
import { Camera, CircleAlert, CircleCheck, ShieldAlert, X } from 'lucide-react';
import { CATALOG_BY_ID } from '@/data/catalog';
import { NextStatus, nextAction, OrderSummary, STATUS_LABEL } from './types';

export type PassCheck =
  | { kind: 'none' }
  | { kind: 'valid'; message: string; latencyMs: number }
  | { kind: 'found'; message: string }
  | { kind: 'replay'; message: string }
  | { kind: 'invalid'; message: string };

const money = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

function CheckResult({ check }: { check: PassCheck }) {
  if (check.kind === 'none') return null;
  const tone =
    check.kind === 'valid' || check.kind === 'found'
      ? 'border-[#3ccf7f]/40 bg-[#3ccf7f]/10 text-[#7ee2a8]'
      : check.kind === 'replay'
      ? 'border-[#ffb020]/40 bg-[#ffb020]/10 text-[#ffd27a]'
      : 'border-[#ff5a4e]/40 bg-[#ff5a4e]/10 text-[#ff9b93]';
  const Glyph = check.kind === 'valid' || check.kind === 'found' ? CircleCheck : check.kind === 'replay' ? ShieldAlert : CircleAlert;
  const title =
    check.kind === 'valid'
      ? 'Pass is genuine'
      : check.kind === 'found'
      ? 'Order found'
      : check.kind === 'replay'
      ? 'Pass already used'
      : 'Pass rejected';
  return (
    <div role="status" className={`flex gap-3 rounded-[10px] border px-3 py-2.5 text-[14px] ${tone}`}>
      <Glyph size={20} className="mt-0.5 shrink-0" aria-hidden />
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-[13px] opacity-90">{check.message}</p>
      </div>
    </div>
  );
}

/** Right-hand rail: check a pass or PIN, then act on the order. */
export default function OrderPanel({
  passInput,
  onPassInput,
  onVerify,
  verifying,
  check,
  scannerActive,
  scannerError,
  onStartScanner,
  onStopScanner,
  onSample,
  order,
  onClear,
  busy,
  airplaneMode,
  onAdvance,
}: {
  passInput: string;
  onPassInput: (value: string) => void;
  onVerify: () => void;
  verifying: boolean;
  check: PassCheck;
  scannerActive: boolean;
  scannerError: string;
  onStartScanner: () => void;
  onStopScanner: () => void;
  onSample: (value: string) => void;
  order: OrderSummary | null;
  onClear: () => void;
  busy: boolean;
  airplaneMode: boolean;
  onAdvance: (status: NextStatus) => void;
}) {
  const action = order ? nextAction(String(order.status)) : null;

  function submit(e: FormEvent) {
    e.preventDefault();
    onVerify();
  }

  return (
    <aside className="space-y-4">
      <section aria-labelledby="check-heading" className="rounded-[14px] bg-[#191c20] p-4">
        <h2 id="check-heading" className="text-[17px] font-semibold">
          Check a pass
        </h2>
        <p className="mt-0.5 text-[13px] text-[#9aa3ab]">
          Scan the fan&apos;s QR code or type their pickup PIN. QR passes are checked on this device, so they work without signal.
        </p>

        {scannerActive ? (
          <div className="mt-3 space-y-2">
            <div id="qr-reader-container" className="overflow-hidden rounded-[10px] bg-black" />
            <button
              type="button"
              onClick={onStopScanner}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-[8px] border border-[#454c54] text-[14px] font-semibold hover:bg-[#2c3238]"
            >
              <X size={16} aria-hidden /> Stop camera
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onStartScanner}
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-[8px] border border-[#454c54] text-[15px] font-semibold hover:bg-[#2c3238]"
          >
            <Camera size={18} aria-hidden /> Scan QR code
          </button>
        )}
        {scannerError && <p className="mt-2 text-[13px] text-[#ff9b93]">Camera unavailable: {scannerError}</p>}

        <form onSubmit={submit} className="mt-3 flex gap-2">
          <label htmlFor="pass-input" className="sr-only">
            Pickup PIN or pass code
          </label>
          <input
            id="pass-input"
            value={passInput}
            onChange={(e) => onPassInput(e.target.value)}
            placeholder="PIN or pass code"
            autoComplete="off"
            className="h-11 min-w-0 flex-1 rounded-[8px] border border-[#353b42] bg-[#1d2125] px-3 text-[16px] tabular text-white placeholder:text-[#6f7880] focus:border-[#ffd100] focus:outline-none"
          />
          <button
            type="submit"
            disabled={verifying || !passInput.trim()}
            className="h-11 rounded-[8px] bg-[#ffd100] px-4 text-[15px] font-semibold text-[#1d2125] hover:bg-[#f0c200] disabled:opacity-50"
          >
            {verifying ? 'Checking…' : 'Check'}
          </button>
        </form>
        <p className="mt-2 text-[12px] text-[#6f7880]">
          Sample:{' '}
          <button type="button" className="underline underline-offset-2 hover:text-white" onClick={() => onSample('8821')}>
            PIN 8821
          </button>
        </p>

        <div className="mt-3">
          <CheckResult check={check} />
        </div>
      </section>

      <section aria-labelledby="order-heading" className="rounded-[14px] bg-[#191c20] p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 id="order-heading" className="text-[17px] font-semibold">
            {order ? 'Order' : 'No order selected'}
          </h2>
          {order && (
            <button type="button" onClick={onClear} aria-label="Clear selected order" className="-mr-1 rounded p-1 text-[#9aa3ab] hover:text-white">
              <X size={18} aria-hidden />
            </button>
          )}
        </div>

        {!order ? (
          <p className="mt-1 text-[14px] text-[#9aa3ab]">Pick an order on the board, or check a pass.</p>
        ) : (
          <div className="mt-3 space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-[10px] bg-[#1d2125] py-2">
                <p className="text-[12px] text-[#9aa3ab]">PIN</p>
                <p className="font-display text-[26px] font-black leading-tight tabular text-[#ffd100]">{order.pinCode || '—'}</p>
              </div>
              <div className="rounded-[10px] bg-[#1d2125] py-2">
                <p className="text-[12px] text-[#9aa3ab]">Locker</p>
                <p className="font-display text-[26px] font-black leading-tight tabular">
                  {order.station.lockerNumber ? order.station.lockerNumber.replace('#', '') : '—'}
                </p>
              </div>
              <div className="rounded-[10px] bg-[#1d2125] py-2">
                <p className="text-[12px] text-[#9aa3ab]">Status</p>
                <p className="mt-1 text-[16px] font-semibold">{STATUS_LABEL[String(order.status)] ?? String(order.status)}</p>
              </div>
            </div>
            {(!order.pinCode || !order.station.lockerNumber) && (
              <p className="text-[13px] text-[#ffd27a]">
                Read from the pass while offline: the PIN and locker are not in the pass and show once the terminal syncs.
              </p>
            )}

            <ul className="divide-y divide-[#2c3238] text-[15px]">
              {order.items.map((item, i) => (
                <li key={`${item.itemId}-${i}`} className="flex justify-between gap-3 py-2">
                  <span>
                    <span className="font-semibold">{item.quantity}×</span> {CATALOG_BY_ID.get(item.itemId)?.name ?? item.name}
                    {item.options && item.options.length > 0 && (
                      <span className="mt-0.5 block text-[13px] font-semibold text-[#ffd100]">{item.options.join(', ')}</span>
                    )}
                    {CATALOG_BY_ID.get(item.itemId)?.isAlcoholic && (
                      <span className="mt-0.5 block text-[13px] text-[#ffb020]">Check photo ID before opening</span>
                    )}
                  </span>
                  <span className="tabular text-[#9aa3ab]">{money.format(item.unitPrice * item.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-baseline justify-between border-t border-[#2c3238] pt-2">
              <span className="text-[14px] text-[#9aa3ab]">Total paid</span>
              <span className="font-display text-[20px] font-bold tabular">{money.format(order.total)}</span>
            </div>
            {order.isGroupOrder && order.seatNote && <p className="text-[13px] text-[#9aa3ab]">Group order for {order.seatNote}</p>}
            <p className="text-[12px] text-[#6f7880]">Ref {order.orderId}</p>

            {action ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onAdvance(action.status)}
                className="h-12 w-full rounded-[10px] bg-[#ffd100] text-[16px] font-semibold text-[#1d2125] hover:bg-[#f0c200] disabled:opacity-50"
              >
                {busy ? 'Saving…' : action.label}
              </button>
            ) : (
              <p className="rounded-[10px] bg-[#3ccf7f]/10 px-3 py-2 text-[14px] text-[#7ee2a8]">Collected. Nothing left to do.</p>
            )}
            {airplaneMode && (
              <p className="text-[12px] text-[#ffd27a]">Airplane Mode: changes are saved on this terminal and sent when it reconnects.</p>
            )}
          </div>
        )}
      </section>
    </aside>
  );
}
