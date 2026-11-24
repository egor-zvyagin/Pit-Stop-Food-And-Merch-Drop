'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CloudUpload, Lock, Plane, Wifi, WifiOff } from 'lucide-react';
import { LogoMark } from '@/components/brand/Logo';
import { PIT_STOPS } from '@/data/pitStopConstantData';
import { hasVerificationPublicKey, verifyQrPayload } from '@/lib/crypto/passVerifier';
import { ensureVerificationPublicKey } from '@/lib/crypto/verifierKeyStore';
import { OfflineNonceRegistry } from '@/lib/crypto/nonceRegistry';
import {
  enqueueSyncAction,
  flushSyncQueue,
  getPendingSyncActions,
  listenToOnlineStatus,
} from '@/lib/offline/syncQueue';
import type { LockerBayStatus, OrderRecord } from '@/lib/types';
import { useLiveData } from '@/context/LiveDataContext';
import OrderBoard from '@/components/vendor/OrderBoard';
import OrderPanel, { PassCheck } from '@/components/vendor/OrderPanel';
import RaceControlPanel from '@/components/vendor/RaceControlPanel';
import LockerBayGrid from '@/components/vendor/LockerBayGrid';
import { NextStatus, OrderSummary } from '@/components/vendor/types';

type Notice = { message: string; type: 'success' | 'warning' | 'info' };

function toSummary(o: OrderRecord): OrderSummary {
  return {
    orderId: o.orderId,
    pinCode: o.pinCode,
    status: o.status,
    station: {
      id: o.pickupStationId,
      name: o.pickupStationName,
      lockerNumber: o.counterNumber,
      walkTimeMins: o.walkTimeMins,
    },
    items: o.items || [],
    total: o.total,
    qrPayload: o.qrPayload,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    isGroupOrder: o.isGroupOrder,
    seatNote: o.seatNote,
  };
}

/** Accepts either an OrderRecord or an already-summarised order from the status API. */
function normalise(data: OrderRecord | OrderSummary): OrderSummary {
  return 'station' in data ? (data as OrderSummary) : toSummary(data as OrderRecord);
}

export default function VendorTerminalPage() {
  // Staff PIN gate (kept for this browser tab only)
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [vendorPin, setVendorPin] = useState('');

  const [selectedStation, setSelectedStation] = useState('M2');
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [selected, setSelected] = useState<OrderSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, setLockerBays] = useState<LockerBayStatus[]>([]);

  const [passInput, setPassInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [check, setCheck] = useState<PassCheck>({ kind: 'none' });
  const [scannerActive, setScannerActive] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);

  const [airplaneMode, setAirplaneMode] = useState(false);
  const [pendingSync, setPendingSync] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const { flagCopy, online } = useLiveData();

  const showNotice = useCallback((message: string, type: Notice['type'] = 'info') => {
    setNotice({ message, type });
    setTimeout(() => setNotice((n) => (n?.message === message ? null : n)), 4500);
  }, []);

  // Load the pass verification key: from the server when online, otherwise
  // from this terminal's cached copy.
  useEffect(() => {
    void ensureVerificationPublicKey();
  }, []);

  useEffect(() => {
    try {
      const unlocked = sessionStorage.getItem('pitstop_vendor_unlocked');
      const savedPin = sessionStorage.getItem('pitstop_vendor_pin') || '';
      // Reads browser storage after hydration: reading it during render would
      // make the server and client HTML differ.
      setVendorPin(savedPin);
      if (unlocked === 'true' && savedPin) setIsUnlocked(true);
    } catch {
      // Storage blocked: staff unlock again.
    }
  }, []);

  // Pending offline actions
  useEffect(() => {
    const refresh = () => setPendingSync(getPendingSyncActions().length);
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, []);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    const entered = pinInput.trim();
    if (!entered) {
      setPinError('Enter the staff PIN.');
      return;
    }
    // Check the PIN with the server before unlocking, so a wrong PIN is
    // caught here rather than as failed requests later.
    try {
      const res = await fetch('/api/orders', { headers: { 'X-Vendor-Pin': entered } });
      if (res.status === 401) {
        const body = await res.json().catch(() => null);
        setPinError(
          typeof body?.error === 'string' && body.error.includes('not configured')
            ? 'Staff access is not set up on this server. Ask an administrator to set VENDOR_ACCESS_PIN.'
            : 'That PIN is not right. Check with your shift lead.'
        );
        return;
      }
    } catch {
      // Offline: unlock so passes can still be checked on this device. Any
      // queued updates are sent, and checked, once the connection returns.
    }
    setVendorPin(entered);
    setIsUnlocked(true);
    setPinError('');
    try {
      sessionStorage.setItem('pitstop_vendor_unlocked', 'true');
      sessionStorage.setItem('pitstop_vendor_pin', entered);
    } catch {
      // Ignore
    }
  };

  const stopScanner = useCallback(() => {
    if (scannerRef.current) {
      try {
        scannerRef.current.stop().catch(() => undefined);
        scannerRef.current.clear();
      } catch {
        // Already stopped.
      }
      scannerRef.current = null;
    }
    setScannerActive(false);
  }, []);

  const handleLock = () => {
    setIsUnlocked(false);
    setPinInput('');
    try {
      sessionStorage.removeItem('pitstop_vendor_unlocked');
    } catch {
      // Ignore
    }
    stopScanner();
  };

  const fetchOrders = useCallback(async () => {
    if (airplaneMode || !vendorPin) return;
    try {
      const res = await fetch('/api/orders', { headers: { 'X-Vendor-Pin': vendorPin }, cache: 'no-store' });
      if (res.status === 401) {
        setIsUnlocked(false);
        setPinError('The staff PIN has changed. Unlock the terminal again.');
        return;
      }
      const data = await res.json();
      if (data.success && Array.isArray(data.orders)) {
        const list = (data.orders as OrderRecord[]).map(toSummary);
        setOrders(list);
        setSelected((cur) => (cur ? list.find((o) => o.orderId === cur.orderId) ?? cur : cur));
      }
    } catch {
      // No signal: keep the last list.
    }
  }, [airplaneMode, vendorPin]);

  useEffect(() => {
    if (!isUnlocked || airplaneMode) return;
    // fetchOrders only sets state after its network request returns.
    void fetchOrders();
    const id = setInterval(fetchOrders, 4000);
    return () => clearInterval(id);
  }, [isUnlocked, airplaneMode, fetchOrders]);

  const flush = useCallback(async () => {
    if (!vendorPin || airplaneMode) return;
    setSyncing(true);
    try {
      const { resolved, failed } = await flushSyncQueue(vendorPin);
      setPendingSync(getPendingSyncActions().length);
      if (resolved > 0) showNotice(`Sent ${resolved} saved update${resolved === 1 ? '' : 's'} to the server.`, 'success');
      if (failed > 0) showNotice(`${failed} saved update${failed === 1 ? '' : 's'} could not be sent. They will be retried.`, 'warning');
      if (resolved > 0) void fetchOrders();
    } finally {
      setSyncing(false);
    }
  }, [vendorPin, airplaneMode, fetchOrders, showNotice]);

  useEffect(() => listenToOnlineStatus(() => void flush()), [flush]);
  useEffect(() => () => stopScanner(), [stopScanner]);

  const verifyPayload = async (rawInput: string) => {
    const trimmed = rawInput.trim();
    if (!trimmed) return;
    setVerifying(true);
    setCheck({ kind: 'none' });
    const start = performance.now();

    try {
      // 1. Signed QR pass, checked on this device.
      if (trimmed.startsWith('AGPC1.')) {
        if (!hasVerificationPublicKey()) await ensureVerificationPublicKey();
        const result = verifyQrPayload(trimmed, selectedStation);
        const latency = performance.now() - start;

        if (!result.isValid || !result.payload) {
          setCheck({ kind: 'invalid', message: result.reason || 'The signature does not match. Do not open the locker.' });
          return;
        }

        const nonceCheck = OfflineNonceRegistry.registerNonce(result.payload.nonce, result.payload.expiresAt, result.payload.orderId);
        if (!nonceCheck.valid) {
          setCheck({ kind: 'replay', message: 'This pass has already been scanned on this terminal. Check the fan has not collected already.' });
          return;
        }

        let found: OrderSummary | null = null;
        if (!airplaneMode) {
          try {
            const res = await fetch(`/api/orders/${encodeURIComponent(result.payload.orderId)}/status`, {
              headers: { 'X-Vendor-Pin': vendorPin },
            });
            const data = await res.json();
            if (data.success && data.data) found = normalise(data.data);
          } catch {
            // Offline: fall through to what this terminal knows.
          }
        }
        if (!found) found = orders.find((o) => o.orderId === result.payload?.orderId) ?? null;
        if (!found) {
          // Build the order from the signed pass alone. The PIN and locker are
          // not in the pass, so they stay blank rather than being guessed.
          found = {
            orderId: result.payload.orderId,
            pinCode: '',
            status: 'READY_FOR_PICKUP',
            station: { id: result.payload.targetStationId, name: `Pit Stop ${result.payload.targetStationId}`, lockerNumber: '', walkTimeMins: 0 },
            items: result.payload.items.map((i) => ({ itemId: i.sku, name: i.name, quantity: i.quantity, unitPrice: i.unitPriceCents / 100 })),
            total: result.payload.items.reduce((sum, i) => sum + (i.unitPriceCents * i.quantity) / 100, 0),
          };
        }
        setSelected({ ...found, nonce: result.payload.nonce });
        setCheck({ kind: 'valid', latencyMs: latency, message: `Signed by Pit Stop, checked on this device in ${latency.toFixed(1)} ms.` });
        return;
      }

      // 2. Pickup PIN or order reference.
      const lookup = trimmed.toUpperCase().startsWith('GP-') ? trimmed.toUpperCase() : trimmed;
      const local = orders.find((o) => o.orderId === lookup || o.pinCode === trimmed);

      if (!airplaneMode) {
        try {
          const res = await fetch(`/api/orders/${encodeURIComponent(lookup)}/status`, { headers: { 'X-Vendor-Pin': vendorPin } });
          const data = await res.json();
          if (data.success && data.data) {
            setSelected(normalise(data.data));
            setCheck({ kind: 'found', message: `Found by ${/^\d{4}$/.test(trimmed) ? 'PIN' : 'reference'}.` });
            return;
          }
        } catch {
          // Offline: try this terminal's list below.
        }
      }

      if (local) {
        setSelected(local);
        setCheck({ kind: 'found', message: 'Found in the orders this terminal already has.' });
      } else {
        setCheck({ kind: 'invalid', message: `No order matches "${trimmed}" at pod ${selectedStation}.` });
      }
    } catch (err) {
      setCheck({ kind: 'invalid', message: err instanceof Error ? err.message : 'The check failed.' });
    } finally {
      setVerifying(false);
    }
  };

  const startScanner = async () => {
    setScannerError('');
    setScannerActive(true);
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      setTimeout(async () => {
        try {
          if (!document.getElementById('qr-reader-container')) return;
          const scanner = new Html5Qrcode('qr-reader-container');
          scannerRef.current = scanner;
          await scanner.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 220, height: 220 } },
            (decoded: string) => {
              stopScanner();
              setPassInput(decoded);
              void verifyPayload(decoded);
            },
            () => undefined
          );
        } catch (err) {
          setScannerError(err instanceof Error ? err.message : 'camera access was refused');
          setScannerActive(false);
        }
      }, 100);
    } catch (err) {
      setScannerError(err instanceof Error ? err.message : 'the scanner could not load');
      setScannerActive(false);
    }
  };

  const advance = async (order: OrderSummary, status: NextStatus) => {
    setBusyId(order.orderId);
    const applyLocal = () => {
      setOrders((list) => list.map((o) => (o.orderId === order.orderId ? { ...o, status } : o)));
      setSelected((cur) => (cur && cur.orderId === order.orderId ? { ...cur, status } : cur));
    };
    const queue = () => {
      if (order.nonce) OfflineNonceRegistry.registerNonce(order.nonce, Math.floor(Date.now() / 1000) + 3600, order.orderId);
      enqueueSyncAction({ orderId: order.orderId, status, nonce: order.nonce });
      setPendingSync(getPendingSyncActions().length);
      applyLocal();
      showNotice('Saved on this terminal. It will be sent when the connection is back.', 'warning');
    };

    try {
      if (airplaneMode) {
        queue();
        return;
      }
      const res = await fetch(`/api/orders/${encodeURIComponent(order.orderId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Vendor-Pin': vendorPin },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.success) {
        applyLocal();
        void fetchOrders();
      } else if (res.status === 401) {
        setIsUnlocked(false);
        setPinError('The staff PIN has changed. Unlock the terminal again.');
      } else {
        showNotice(data.error || 'The order was not updated.', 'warning');
      }
    } catch {
      queue();
    } finally {
      setBusyId(null);
    }
  };

  const toggleAirplane = (on: boolean) => {
    setAirplaneMode(on);
    if (on) {
      showNotice('Airplane Mode is on. Updates are saved here until you turn it off.', 'warning');
    } else {
      showNotice('Reconnecting…', 'info');
    }
  };

  // Leaving Airplane Mode sends whatever was saved while it was on. This runs
  // after the state change, so flush sees Airplane Mode as off.
  const wasAirplane = useRef(false);
  useEffect(() => {
    if (wasAirplane.current && !airplaneMode) void flush();
    wasAirplane.current = airplaneMode;
  }, [airplaneMode, flush]);

  const selectFromLocker = (orderId: string) => {
    const found = orders.find((o) => o.orderId === orderId);
    if (found) {
      setSelected(found);
      setCheck({ kind: 'found', message: `Opened from locker ${found.station.lockerNumber.replace('#', '')}.` });
    }
  };

  const podOrders = orders.filter((o) => !o.station?.id || o.station.id === selectedStation);
  const connected = online && !airplaneMode;

  if (!isUnlocked) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#15181b] p-6 text-white">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex items-center gap-3">
            <LogoMark size={44} />
            <div>
              <h1 className="font-display text-[28px] font-extrabold leading-none">Staff terminal</h1>
              <p className="mt-1 text-[14px] text-neutral-400">Pit Stop lockers, Albert Park</p>
            </div>
          </div>
          <form onSubmit={handleUnlock} className="space-y-3">
            <label htmlFor="staff-pin" className="block text-[14px] font-medium text-neutral-300">
              Staff PIN
            </label>
            <input
              id="staff-pin"
              type="password"
              autoComplete="current-password"
              maxLength={64}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="Enter the staff PIN"
              aria-invalid={Boolean(pinError)}
              aria-describedby={pinError ? 'pin-error' : 'pin-help'}
              className="w-full rounded-[10px] border border-[#353b42] bg-[#1d2125] px-4 py-3 text-[20px] tracking-[0.3em] text-white placeholder:text-[15px] placeholder:tracking-normal placeholder:text-neutral-500 focus:border-[#ffd100] focus:outline-none"
              autoFocus
            />
            {pinError ? (
              <p id="pin-error" className="text-[14px] font-medium text-[#ff8a80]">
                {pinError}
              </p>
            ) : (
              <p id="pin-help" className="text-[13px] text-neutral-500">
                Your shift lead has the PIN. It is never shown on this screen.
              </p>
            )}
            <button type="submit" className="h-12 w-full rounded-[10px] bg-[#ffd100] text-[16px] font-semibold text-[#1d2125] transition-colors hover:bg-[#f0c200]">
              Unlock terminal
            </button>
          </form>
          <Link href="/" className="inline-block text-[14px] text-neutral-400 underline underline-offset-2 hover:text-white">
            Back to the fan app
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#15181b] text-white">
      {notice && (
        <div
          role="status"
          className={`fixed right-4 top-4 z-50 max-w-sm rounded-[10px] border px-4 py-3 text-[14px] shadow-2xl ${
            notice.type === 'success'
              ? 'border-[#3ccf7f]/50 bg-[#12261b] text-[#a7efc4]'
              : notice.type === 'warning'
              ? 'border-[#ffb020]/50 bg-[#2a2110] text-[#ffd27a]'
              : 'border-[#454c54] bg-[#1d2125] text-white'
          }`}
        >
          {notice.message}
        </div>
      )}

      <header className="sticky top-0 z-40 border-b border-[#2c3238] bg-[#15181b]/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-3">
          <div className="flex items-center gap-3">
            <LogoMark size={36} />
            <div className="leading-tight">
              <h1 className="font-display text-[22px] font-extrabold">Staff terminal</h1>
              <p className="text-[12px] text-[#9aa3ab]">{flagCopy.name}</p>
            </div>
          </div>

          <nav aria-label="Pod" className="flex rounded-[10px] bg-[#1d2125] p-1">
            {PIT_STOPS.map((stop) => (
              <button
                key={stop.id}
                type="button"
                onClick={() => setSelectedStation(stop.id)}
                aria-pressed={selectedStation === stop.id}
                className={`rounded-[8px] px-3 py-1.5 text-[14px] font-semibold ${
                  selectedStation === stop.id ? 'bg-[#ffd100] text-[#1d2125]' : 'text-[#9aa3ab] hover:text-white'
                }`}
              >
                {stop.id} <span className="font-normal">{stop.label}</span>
              </button>
            ))}
          </nav>

          <div className="ml-auto flex flex-wrap items-center gap-3 text-[14px]">
            <span className={`inline-flex items-center gap-1.5 ${connected ? 'text-[#7ee2a8]' : 'text-[#ffd27a]'}`}>
              {connected ? <Wifi size={16} aria-hidden /> : <WifiOff size={16} aria-hidden />}
              {connected ? 'Online' : 'Offline'}
            </span>
            <button
              type="button"
              onClick={() => void flush()}
              disabled={syncing || airplaneMode || pendingSync === 0}
              className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#353b42] px-2.5 py-1.5 disabled:opacity-60"
              title="Send updates saved while offline"
            >
              <CloudUpload size={16} aria-hidden />
              Pending Cloud Sync ({pendingSync})
            </button>
            <label className="inline-flex items-center gap-2">
              <Plane size={16} aria-hidden />
              Airplane Mode
              <button
                type="button"
                role="switch"
                aria-checked={airplaneMode}
                aria-label="Airplane Mode"
                onClick={() => toggleAirplane(!airplaneMode)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${airplaneMode ? 'bg-[#ffb020]' : 'bg-[#454c54]'}`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${airplaneMode ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </label>
            <button type="button" onClick={handleLock} className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#353b42] px-2.5 py-1.5 hover:bg-[#2c3238]">
              <Lock size={16} aria-hidden /> Lock
            </button>
          </div>
        </div>
      </header>

      <main className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-5">
          <OrderBoard
            orders={podOrders}
            selectedId={selected?.orderId}
            busyId={busyId}
            onSelect={(o) => setSelected(o)}
            onAdvance={(o, s) => void advance(o, s)}
          />
          <LockerBayGrid
            stationId={selectedStation}
            vendorPin={vendorPin}
            activeOrderId={selected?.orderId}
            onSelectOrder={selectFromLocker}
            recentOrders={orders}
            onBaysUpdated={setLockerBays}
          />
          <RaceControlPanel vendorPin={vendorPin} onNotice={showNotice} />
        </div>

        <div className="xl:sticky xl:top-[88px] xl:self-start">
          <OrderPanel
            passInput={passInput}
            onPassInput={setPassInput}
            onVerify={() => void verifyPayload(passInput)}
            verifying={verifying}
            check={check}
            scannerActive={scannerActive}
            scannerError={scannerError}
            onStartScanner={() => void startScanner()}
            onStopScanner={stopScanner}
            onSample={(v) => {
              setPassInput(v);
              void verifyPayload(v);
            }}
            order={selected}
            onClear={() => {
              setSelected(null);
              setCheck({ kind: 'none' });
            }}
            busy={busyId === selected?.orderId}
            airplaneMode={airplaneMode}
            onAdvance={(s) => selected && void advance(selected, s)}
          />
        </div>
      </main>
    </div>
  );
}
