'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Icon } from '@iconify/react';
import { PIT_STOPS } from '@/data/pitStopConstantData';
import { verifyQrPayload } from '@/lib/crypto/passVerifier';
import { OfflineNonceRegistry } from '@/lib/crypto/nonceRegistry';
import { OrderRecord } from '@/lib/db/client';

interface OrderSummary {
  orderId: string;
  pinCode: string;
  status: string;
  station: {
    id: string;
    name: string;
    lockerNumber: string;
    walkTimeMins: number;
  };
  items: Array<{
    itemId: string;
    name: string;
    quantity: number;
    unitPrice: number;
  }>;
  total: number;
  qrPayload?: string;
  updatedAt?: string;
}

type BadgeState = 'NONE' | 'VALID' | 'INVALID' | 'REPLAY_DETECTED' | 'NUMERIC_FALLBACK';

export default function VendorTerminalPage() {
  // Staff PIN Gate State (Persisted in sessionStorage)
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [vendorPin, setVendorPin] = useState('2026');

  // Terminal & Station State
  const [selectedStation, setSelectedStation] = useState('M2');
  const [passInput, setPassInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeOrder, setActiveOrder] = useState<OrderSummary | null>(null);

  // Verification Badge & Feedback
  const [badgeState, setBadgeState] = useState<BadgeState>('NONE');
  const [verificationFeedback, setVerificationFeedback] = useState<{
    valid: boolean;
    latencyMs: number;
    message: string;
    reason?: string;
  } | null>(null);

  // Live Orders
  const [recentOrders, setRecentOrders] = useState<OrderSummary[]>([]);

  // Camera QR Scanner State
  const [scannerActive, setScannerActive] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const html5QrCodeRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);

  // Hydrate PIN gate from sessionStorage
  useEffect(() => {
    try {
      const unlocked = sessionStorage.getItem('pitstop_vendor_unlocked');
      const savedPin = sessionStorage.getItem('pitstop_vendor_pin') || '2026';
      setVendorPin(savedPin);
      if (unlocked === 'true') {
        setIsUnlocked(true);
      }
    } catch {
      // Ignore
    }
  }, []);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    const entered = pinInput.trim();
    if (entered === '2026' || entered === vendorPin) {
      setIsUnlocked(true);
      setPinError('');
      try {
        sessionStorage.setItem('pitstop_vendor_unlocked', 'true');
        sessionStorage.setItem('pitstop_vendor_pin', entered);
      } catch {
        // Ignore
      }
    } else {
      setPinError('Invalid Staff PIN. Demo PIN is 2026.');
    }
  };

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

  // Fetch recent orders
  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/orders');
      const data = await res.json();
      if (data.success && data.orders) {
        setRecentOrders(
          data.orders.map((o: OrderRecord) => ({
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
            updatedAt: o.updatedAt,
          }))
        );
      }
    } catch (err) {
      console.warn('Failed to fetch orders:', err);
    }
  }, []);

  useEffect(() => {
    if (isUnlocked) {
      fetchOrders();
      const interval = setInterval(fetchOrders, 4000);
      return () => clearInterval(interval);
    }
  }, [isUnlocked, fetchOrders]);

  // Clean up camera scanner on unmount
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  const stopScanner = () => {
    if (html5QrCodeRef.current) {
      try {
        html5QrCodeRef.current.stop().catch(() => {});
        html5QrCodeRef.current.clear();
      } catch {
        // Ignore
      }
      html5QrCodeRef.current = null;
    }
    setScannerActive(false);
  };

  const startScanner = async () => {
    setScannerError('');
    setScannerActive(true);

    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      // Small timeout to allow container DOM element to mount
      setTimeout(async () => {
        try {
          const qrElement = document.getElementById('qr-reader-container');
          if (!qrElement) return;

          const scanner = new Html5Qrcode('qr-reader-container');
          html5QrCodeRef.current = scanner;

          await scanner.start(
            { facingMode: 'environment' },
            {
              fps: 10,
              qrbox: { width: 220, height: 220 },
            },
            (decodedText: string) => {
              // Successfully scanned QR
              stopScanner();
              setPassInput(decodedText);
              verifyPayload(decodedText);
            },
            () => {
              // Normal frame scanner tick
            }
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Camera access denied or unavailable';
          setScannerError(msg);
          setScannerActive(false);
        }
      }, 100);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Scanner library load failed';
      setScannerError(msg);
      setScannerActive(false);
    }
  };

  const verifyPayload = async (rawInput: string) => {
    const trimmed = rawInput.trim();
    if (!trimmed) return;

    setLoading(true);
    setVerificationFeedback(null);
    setBadgeState('NONE');
    const start = performance.now();

    try {
      // 1. Cryptographic Ed25519 QR pass payload
      if (trimmed.startsWith('AGPC1.')) {
        const qrResult = verifyQrPayload(trimmed, selectedStation);
        const end = performance.now();
        const latency = end - start;

        if (qrResult.isValid && qrResult.payload) {
          // Check for replay attacks via OfflineNonceRegistry
          const nonceCheck = OfflineNonceRegistry.registerNonce(
            qrResult.payload.nonce,
            qrResult.payload.expiresAt,
            qrResult.payload.orderId
          );

          if (!nonceCheck.valid) {
            setBadgeState('REPLAY_DETECTED');
            setVerificationFeedback({
              valid: false,
              latencyMs: latency,
              reason: 'REPLAY_DETECTED',
              message: `REPLAY DETECTED: Nonce '${qrResult.payload.nonce}' has already been redeemed!`,
            });
            setLoading(false);
            return;
          }

          // Fresh cryptographic pass: attempt server sync with offline fallback
          setBadgeState('VALID');
          let synced = false;

          try {
            const res = await fetch(`/api/orders/${encodeURIComponent(qrResult.payload.orderId)}/status`);
            const data = await res.json();
            if (data.success && data.data) {
              setActiveOrder(data.data);
              synced = true;
            }
          } catch {
            // Offline fallback
          }

          if (!synced) {
            setActiveOrder({
              orderId: qrResult.payload.orderId,
              pinCode: qrResult.payload.orderId.replace('GP-', '').slice(-4),
              status: 'READY_FOR_PICKUP',
              station: {
                id: qrResult.payload.targetStationId,
                name: `Pit Stop ${qrResult.payload.targetStationId}`,
                lockerNumber: '#04',
                walkTimeMins: 2,
              },
              items: qrResult.payload.items.map((i) => ({
                itemId: i.sku,
                name: i.name,
                quantity: i.quantity,
                unitPrice: i.unitPriceCents / 100,
              })),
              total: qrResult.payload.items.reduce(
                (sum, i) => sum + (i.unitPriceCents * i.quantity) / 100,
                0
              ),
            });
          }

          setVerificationFeedback({
            valid: true,
            latencyMs: latency,
            message: `Ed25519 Valid (${latency.toFixed(2)} ms · Offline Nonce Registered)`,
          });
          setLoading(false);
          return;
        } else {
          setBadgeState('INVALID');
          setVerificationFeedback({
            valid: false,
            latencyMs: latency,
            reason: qrResult.reason,
            message: `Ed25519 Invalid: ${qrResult.reason || 'Cryptographic signature mismatch'}`,
          });
          setLoading(false);
          return;
        }
      }

      // 2. 4-Digit Numeric Fallback or Order Reference
      const lookupCode = trimmed.startsWith('GP-') ? trimmed : `GP-${trimmed}`;
      const res = await fetch(`/api/orders/${encodeURIComponent(lookupCode)}/status`);
      const data = await res.json();
      const end = performance.now();
      const latency = end - start;

      if (data.success && data.data) {
        setActiveOrder(data.data);
        setBadgeState('NUMERIC_FALLBACK');
        setVerificationFeedback({
          valid: true,
          latencyMs: latency,
          message: `Order Located via Numeric Lookup (${latency.toFixed(2)} ms)`,
        });
      } else {
        setBadgeState('INVALID');
        setVerificationFeedback({
          valid: false,
          latencyMs: latency,
          reason: 'NOT_FOUND',
          message: `Order '${trimmed}' not found in active station queue`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Verification exception';
      setBadgeState('INVALID');
      setVerificationFeedback({
        valid: false,
        latencyMs: 0,
        message: msg,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPass = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    verifyPayload(passInput);
  };

  // Quick Action Buttons with X-Vendor-Pin Header
  const handleStatusAdvance = async (newStatus: 'PREPARING' | 'READY_FOR_PICKUP' | 'COMPLETED') => {
    if (!activeOrder) return;
    setActionLoading(true);

    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(activeOrder.orderId)}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Vendor-Pin': vendorPin || '2026',
        },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();

      if (data.success) {
        setActiveOrder((prev) => (prev ? { ...prev, status: newStatus } : null));
        fetchOrders();
      } else {
        alert(data.error || 'Failed to update order status');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Status update failed';
      alert(`Error updating order: ${msg}`);
    } finally {
      setActionLoading(false);
    }
  };

  // PIN Gate Screen
  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-[#0B0E14] text-white flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-[#121620] p-8 shadow-2xl text-center space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-600/20 text-red-500 border border-red-500/30">
            <Icon icon="mdi:shield-lock-outline" width={36} height={36} />
          </div>

          <div>
            <h1 className="font-display font-black text-2xl uppercase tracking-wider text-white">
              Staff Kiosk Terminal
            </h1>
            <p className="text-sm text-neutral-400 mt-1">
              Albert Park Trackside Concession Logistics
            </p>
          </div>

          <div className="rounded-xl bg-neutral-900/80 border border-neutral-800 p-3 text-xs text-neutral-300">
            <span className="font-bold text-amber-400">DEMO ACCESS:</span> Default staff PIN is{' '}
            <span className="font-mono font-bold text-white bg-neutral-800 px-2 py-0.5 rounded border border-neutral-700">
              2026
            </span>
          </div>

          <form onSubmit={handleUnlock} className="space-y-4">
            <div>
              <input
                type="password"
                maxLength={6}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="Enter 4-digit PIN"
                className="w-full text-center text-2xl font-mono tracking-[0.5em] rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-white placeholder:tracking-normal placeholder:text-neutral-600 focus:border-red-500 focus:outline-none"
                autoFocus
              />
              {pinError && <p className="text-xs text-red-400 font-semibold mt-2">{pinError}</p>}
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-red-600 py-3 font-display font-bold uppercase tracking-wider text-white hover:bg-red-700 transition-colors shadow-lg shadow-red-600/30"
            >
              Unlock Terminal
            </button>
          </form>

          <div className="pt-2">
            <Link href="/" className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors">
              ← Return to Consumer Fan Store
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Full-Screen Vendor Terminal Kiosk UI
  return (
    <div className="min-h-screen bg-[#0B0E14] text-white flex flex-col">
      {/* Top Staff Navigation Header */}
      <header className="border-b border-neutral-800 bg-[#121620] px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600 text-white font-display font-black text-xl">
            PS
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-black text-lg uppercase tracking-wider text-white">
                Pit Stop Staff Terminal
              </h1>
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
                ACTIVE KIOSK
              </span>
            </div>
            <p className="text-xs text-neutral-400">
              Station {selectedStation} • Offline Asymmetric Ed25519 Verifier
            </p>
          </div>
        </div>

        {/* Station Selector & Lock */}
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-xl border border-neutral-700 bg-neutral-900 p-1">
            {PIT_STOPS.map((stop) => (
              <button
                key={stop.id}
                onClick={() => setSelectedStation(stop.id)}
                className={`rounded-lg px-3 py-1.5 font-display text-xs font-bold transition-all ${
                  selectedStation === stop.id
                    ? 'bg-red-600 text-white shadow'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                {stop.id}
              </button>
            ))}
          </div>

          <button
            onClick={handleLock}
            className="flex items-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-bold text-neutral-300 hover:bg-neutral-700 transition-colors"
          >
            <Icon icon="mdi:lock-outline" width={16} height={16} />
            <span>Lock</span>
          </button>

          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs font-bold text-neutral-400 hover:text-white transition-colors"
          >
            <Icon icon="mdi:home-outline" width={16} height={16} />
            <span>App</span>
          </Link>
        </div>
      </header>

      {/* Main Terminal Grid */}
      <main className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-7xl mx-auto w-full">
        {/* Left Column: Scanner & Verification (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Scan & Input Card */}
          <div className="rounded-2xl border border-neutral-800 bg-[#121620] p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <Icon icon="mdi:qrcode-scan" width={22} height={22} className="text-red-500" />
                <h2 className="font-display font-black text-lg uppercase tracking-wider text-white">
                  Pass Verification Engine
                </h2>
              </div>
              <span className="font-mono text-xs text-neutral-400">Target: Pod {selectedStation}</span>
            </div>

            {/* Camera Scanner Controls */}
            <div>
              {!scannerActive ? (
                <button
                  type="button"
                  onClick={startScanner}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 py-3 font-display font-bold text-sm uppercase tracking-wider text-white transition-colors"
                >
                  <Icon icon="mdi:camera" width={20} height={20} className="text-red-400" />
                  <span>Start Camera QR Scanner</span>
                </button>
              ) : (
                <div className="space-y-3">
                  <div
                    id="qr-reader-container"
                    className="w-full overflow-hidden rounded-xl border-2 border-red-500/50 bg-black min-h-[260px] flex items-center justify-center"
                  />
                  <button
                    type="button"
                    onClick={stopScanner}
                    className="w-full rounded-xl bg-neutral-800 border border-neutral-700 py-2 text-xs font-bold uppercase tracking-wider text-neutral-300 hover:text-white"
                  >
                    Close Camera Scanner
                  </button>
                </div>
              )}
              {scannerError && (
                <p className="text-xs text-amber-400 mt-2">{scannerError} (Use manual input below)</p>
              )}
            </div>

            {/* Manual QR / Numeric Input Form */}
            <form onSubmit={handleVerifyPass} className="space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400">
                Scan Pass Payload (AGPC1.*) or 4-Digit Pickup PIN
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={passInput}
                  onChange={(e) => setPassInput(e.target.value)}
                  placeholder="Paste QR string or enter 4-digit PIN..."
                  className="flex-1 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2.5 font-mono text-sm text-white placeholder:text-neutral-600 focus:border-red-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={loading || !passInput.trim()}
                  className="rounded-xl bg-red-600 px-5 py-2.5 font-display font-bold text-sm uppercase tracking-wider text-white hover:bg-red-700 disabled:opacity-50 transition-colors shrink-0"
                >
                  {loading ? 'Verifying...' : 'Verify'}
                </button>
              </div>
            </form>

            {/* Quick Demo Test Payloads */}
            <div className="pt-2 border-t border-neutral-800">
              <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-2">
                Quick Verification Test Payloads
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const sample = 'AGPC1.AGPC-2027-KEY-01.DEMO.GP-8821';
                    setPassInput(sample);
                    verifyPayload(sample);
                  }}
                  className="rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-300 hover:border-neutral-500"
                >
                  Sample QR (GP-8821)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPassInput('8821');
                    verifyPayload('8821');
                  }}
                  className="rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-300 hover:border-neutral-500"
                >
                  PIN 8821
                </button>
                <button
                  type="button"
                  onClick={() => {
                    OfflineNonceRegistry.clear();
                    alert('Offline nonce registry cleared');
                  }}
                  className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-2.5 py-1 text-xs text-neutral-500 hover:text-neutral-300"
                >
                  Clear Nonce Cache
                </button>
              </div>
            </div>

            {/* Verification Status Badge */}
            {badgeState !== 'NONE' && (
              <div
                className={`rounded-xl border p-4 space-y-1 transition-all ${
                  badgeState === 'VALID'
                    ? 'border-emerald-500/50 bg-emerald-950/30'
                    : badgeState === 'REPLAY_DETECTED'
                    ? 'border-amber-500/50 bg-amber-950/40'
                    : badgeState === 'NUMERIC_FALLBACK'
                    ? 'border-blue-500/50 bg-blue-950/30'
                    : 'border-red-500/50 bg-red-950/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  {badgeState === 'VALID' && (
                    <>
                      <Icon icon="mdi:shield-check" width={22} height={22} className="text-emerald-400" />
                      <span className="font-display font-black text-sm uppercase tracking-wider text-emerald-400">
                        Ed25519 Valid
                      </span>
                    </>
                  )}
                  {badgeState === 'REPLAY_DETECTED' && (
                    <>
                      <Icon icon="mdi:shield-alert" width={22} height={22} className="text-amber-400" />
                      <span className="font-display font-black text-sm uppercase tracking-wider text-amber-400">
                        Replay Detected
                      </span>
                    </>
                  )}
                  {badgeState === 'INVALID' && (
                    <>
                      <Icon icon="mdi:shield-remove" width={22} height={22} className="text-red-400" />
                      <span className="font-display font-black text-sm uppercase tracking-wider text-red-400">
                        Ed25519 Invalid
                      </span>
                    </>
                  )}
                  {badgeState === 'NUMERIC_FALLBACK' && (
                    <>
                      <Icon icon="mdi:numeric" width={22} height={22} className="text-blue-400" />
                      <span className="font-display font-black text-sm uppercase tracking-wider text-blue-400">
                        Numeric Fallback
                      </span>
                    </>
                  )}
                  {verificationFeedback?.latencyMs !== undefined && (
                    <span className="ml-auto font-mono text-[11px] text-neutral-400">
                      {verificationFeedback.latencyMs.toFixed(2)} ms
                    </span>
                  )}
                </div>

                {verificationFeedback?.message && (
                  <p className="text-xs text-neutral-300 font-medium">{verificationFeedback.message}</p>
                )}
              </div>
            )}
          </div>

          {/* Active Order Details Card */}
          {activeOrder && (
            <div className="rounded-2xl border border-neutral-800 bg-[#121620] p-6 shadow-xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-3">
                <div>
                  <span className="font-mono text-xs font-bold text-red-400">{activeOrder.orderId}</span>
                  <h3 className="font-display font-black text-xl uppercase tracking-wider text-white">
                    Pickup PIN: {activeOrder.pinCode}
                  </h3>
                </div>

                <div className="text-right">
                  <span
                    className={`inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                      activeOrder.status === 'COMPLETED'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : activeOrder.status === 'READY_FOR_PICKUP'
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}
                  >
                    {activeOrder.status}
                  </span>
                  <div className="text-xs text-neutral-400 mt-1 font-mono">
                    Locker: {activeOrder.station.lockerNumber}
                  </div>
                </div>
              </div>

              {/* Order Items List */}
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-neutral-400">Order Items</div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3 divide-y divide-neutral-800">
                  {activeOrder.items.map((item, idx) => (
                    <div key={idx} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between text-sm">
                      <div className="font-medium text-white">
                        <span className="font-bold text-red-400 mr-2">{item.quantity}×</span>
                        {item.name}
                      </div>
                      <div className="font-mono font-bold text-neutral-300">
                        ${(item.unitPrice * item.quantity).toFixed(2)}
                      </div>
                    </div>
                  ))}
                  <div className="pt-2 flex items-center justify-between font-bold text-sm">
                    <span className="text-neutral-400 uppercase">Total Value</span>
                    <span className="font-mono text-amber-400">${activeOrder.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Quick Action Buttons */}
              <div className="pt-2 border-t border-neutral-800 space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                  Quick Lifecycle Actions (X-Vendor-Pin: {vendorPin})
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={actionLoading || activeOrder.status === 'PREPARING'}
                    onClick={() => handleStatusAdvance('PREPARING')}
                    className="rounded-xl border border-amber-500/40 bg-amber-950/30 hover:bg-amber-900/50 py-2.5 font-display font-bold text-xs uppercase tracking-wider text-amber-300 disabled:opacity-40 transition-colors"
                  >
                    Start Preparing
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading || activeOrder.status === 'READY_FOR_PICKUP'}
                    onClick={() => handleStatusAdvance('READY_FOR_PICKUP')}
                    className="rounded-xl border border-blue-500/40 bg-blue-950/30 hover:bg-blue-900/50 py-2.5 font-display font-bold text-xs uppercase tracking-wider text-blue-300 disabled:opacity-40 transition-colors"
                  >
                    Mark Ready
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading || activeOrder.status === 'COMPLETED'}
                    onClick={() => handleStatusAdvance('COMPLETED')}
                    className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 hover:bg-emerald-900/50 py-2.5 font-display font-bold text-xs uppercase tracking-wider text-emerald-300 disabled:opacity-40 transition-colors"
                  >
                    Complete Collection
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Active Station Orders Queue (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-2xl border border-neutral-800 bg-[#121620] p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <Icon icon="mdi:tray-full" width={20} height={20} className="text-neutral-400" />
                <h3 className="font-display font-black text-base uppercase tracking-wider text-white">
                  Live Station Queue ({recentOrders.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={fetchOrders}
                className="text-neutral-400 hover:text-white p-1"
                aria-label="Refresh orders"
              >
                <Icon icon="mdi:refresh" width={18} height={18} />
              </button>
            </div>

            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {recentOrders.length === 0 ? (
                <div className="text-center py-8 text-neutral-500 text-sm">
                  No orders currently active at Station {selectedStation}
                </div>
              ) : (
                recentOrders.map((ord) => (
                  <div
                    key={ord.orderId}
                    onClick={() => {
                      setActiveOrder(ord);
                      setPassInput(ord.orderId);
                      setBadgeState('NUMERIC_FALLBACK');
                      setVerificationFeedback({
                        valid: true,
                        latencyMs: 0,
                        message: `Loaded from active queue`,
                      });
                    }}
                    className={`cursor-pointer rounded-xl border p-3 transition-all ${
                      activeOrder?.orderId === ord.orderId
                        ? 'border-red-500 bg-red-950/20'
                        : 'border-neutral-800 bg-neutral-900/60 hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-red-400">{ord.orderId}</span>
                      <span
                        className={`text-[10px] font-bold uppercase rounded px-1.5 py-0.5 ${
                          ord.status === 'COMPLETED'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : ord.status === 'READY_FOR_PICKUP'
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}
                      >
                        {ord.status}
                      </span>
                    </div>

                    <div className="mt-1 flex items-center justify-between text-xs text-neutral-400">
                      <div>
                        PIN: <span className="font-mono font-bold text-white">{ord.pinCode}</span> •{' '}
                        {ord.station.lockerNumber}
                      </div>
                      <div className="font-mono font-bold text-white">${ord.total.toFixed(2)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
