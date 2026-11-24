'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { LogoMark } from '@/components/brand/Logo';
import { Icon } from "@/components/ui/Icon";
import { PIT_STOPS } from '@/data/pitStopConstantData';
import { hasVerificationPublicKey, verifyQrPayload } from '@/lib/crypto/passVerifier';
import { ensureVerificationPublicKey } from '@/lib/crypto/verifierKeyStore';
import { OfflineNonceRegistry } from '@/lib/crypto/nonceRegistry';
import {
  enqueueSyncAction,
  flushSyncQueue,
  listenToOnlineStatus,
} from '@/lib/offline/syncQueue';
import { LockerBayStatus, OrderRecord, OrderStatus } from '@/lib/types';
import KioskTelemetryBar from '@/components/vendor/KioskTelemetryBar';
import RaceControlPanel from '@/components/vendor/RaceControlPanel';
import LockerBayGrid from '@/components/vendor/LockerBayGrid';

interface OrderSummary {
  orderId: string;
  pinCode: string;
  status: OrderStatus | string;
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
    options?: string[];
  }>;
  total: number;
  qrPayload?: string;
  updatedAt?: string;
  nonce?: string;
}

type BadgeState = 'NONE' | 'VALID' | 'INVALID' | 'REPLAY_DETECTED' | 'NUMERIC_FALLBACK';

export default function VendorTerminalPage() {
  // Staff PIN Gate State (Persisted in sessionStorage)
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [vendorPin, setVendorPin] = useState('');

  // Terminal & Station State
  const [selectedStation, setSelectedStation] = useState('M2');
  const [passInput, setPassInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeOrder, setActiveOrder] = useState<OrderSummary | null>(null);

  // Airplane Mode Simulation & Offline Sync
  const [airplaneMode, setAirplaneMode] = useState(false);
  const [toastNotification, setToastNotification] = useState<{
    message: string;
    type: 'success' | 'warning' | 'info';
  } | null>(null);

  // Verification Badge & Feedback
  const [badgeState, setBadgeState] = useState<BadgeState>('NONE');
  const [verificationFeedback, setVerificationFeedback] = useState<{
    valid: boolean;
    latencyMs: number;
    message: string;
    reason?: string;
  } | null>(null);

  // Live Orders & Locker Bays
  const [recentOrders, setRecentOrders] = useState<OrderSummary[]>([]);
  const [lockerBays, setLockerBays] = useState<LockerBayStatus[]>([]);

  // Camera QR Scanner State
  const [scannerActive, setScannerActive] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const html5QrCodeRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);

  const showToast = useCallback(
    (message: string, type: 'success' | 'warning' | 'info' = 'info') => {
      setToastNotification({ message, type });
      setTimeout(() => {
        setToastNotification((curr) => (curr?.message === message ? null : curr));
      }, 4000);
    },
    []
  );

  // Load the pass verification key: from the server when online, otherwise
  // from this terminal's cached copy.
  useEffect(() => {
    void ensureVerificationPublicKey();
  }, []);

  // Hydrate PIN gate from sessionStorage
  useEffect(() => {
    try {
      const unlocked = sessionStorage.getItem('pitstop_vendor_unlocked');
      const savedPin = sessionStorage.getItem('pitstop_vendor_pin') || '';
      setVendorPin(savedPin);
      if (unlocked === 'true' && savedPin) {
        setIsUnlocked(true);
      }
    } catch {
      // Ignore
    }
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
    if (airplaneMode) return; // Skip polling when in airplane mode
    try {
      const res = await fetch('/api/orders', {
        headers: {
          'X-Vendor-Pin': vendorPin,
        },
      });
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
  }, [airplaneMode, vendorPin]);

  useEffect(() => {
    if (isUnlocked && !airplaneMode) {
      fetchOrders();
      const interval = setInterval(fetchOrders, 4000);
      return () => clearInterval(interval);
    }
  }, [isUnlocked, airplaneMode, fetchOrders]);

  // Online status event listener & auto-sync
  useEffect(() => {
    const cleanup = listenToOnlineStatus(async () => {
      if (!vendorPin || airplaneMode) return;
      const { resolved, failed } = await flushSyncQueue(vendorPin);
      if (resolved > 0) {
        showToast(`Auto-Synced ${resolved} pending action(s) to cloud`, 'success');
        fetchOrders();
      } else if (failed > 0) {
        showToast(`${failed} queued action(s) failed to sync`, 'warning');
      }
    });
    return cleanup;
  }, [vendorPin, airplaneMode, fetchOrders, showToast]);

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
        // A scan can arrive before the key finished loading on mount.
        if (!hasVerificationPublicKey()) {
          await ensureVerificationPublicKey();
        }
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

          if (!airplaneMode) {
            try {
              const res = await fetch(`/api/orders/${encodeURIComponent(qrResult.payload.orderId)}/status`, {
                headers: { 'X-Vendor-Pin': vendorPin },
              });
              const data = await res.json();
              if (data.success && data.data) {
                setActiveOrder({
                  ...data.data,
                  nonce: qrResult.payload.nonce,
                });
                synced = true;
              }
            } catch {
              // Offline fallback
            }
          }

          if (!synced) {
            // Offline fallback synthetic order
            const existing = recentOrders.find((o) => o.orderId === qrResult.payload?.orderId);
            if (existing) {
              setActiveOrder({
                ...existing,
                nonce: qrResult.payload.nonce,
              });
            } else {
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
                nonce: qrResult.payload.nonce,
              });
            }
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

      // Check local cached orders first
      const localMatch = recentOrders.find(
        (o) => o.orderId === lookupCode || o.pinCode === trimmed || o.orderId === trimmed
      );

      if (airplaneMode && localMatch) {
        const end = performance.now();
        setActiveOrder(localMatch);
        setBadgeState('NUMERIC_FALLBACK');
        setVerificationFeedback({
          valid: true,
          latencyMs: end - start,
          message: `Order Located Offline (${(end - start).toFixed(2)} ms)`,
        });
        setLoading(false);
        return;
      }

      if (!airplaneMode) {
        const res = await fetch(`/api/orders/${encodeURIComponent(lookupCode)}/status`, {
          headers: { 'X-Vendor-Pin': vendorPin },
        });
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
          setLoading(false);
          return;
        }
      }

      if (localMatch) {
        const end = performance.now();
        setActiveOrder(localMatch);
        setBadgeState('NUMERIC_FALLBACK');
        setVerificationFeedback({
          valid: true,
          latencyMs: end - start,
          message: `Order Located via Local Manifest (${(end - start).toFixed(2)} ms)`,
        });
      } else {
        setBadgeState('INVALID');
        setVerificationFeedback({
          valid: false,
          latencyMs: 0,
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

  // Quick Action Buttons with Offline Outbox Queueing
  const handleStatusAdvance = async (newStatus: 'PREPARING' | 'READY_FOR_PICKUP' | 'COMPLETED') => {
    if (!activeOrder) return;
    setActionLoading(true);

    const targetOrderId = activeOrder.orderId;

    // Helper to apply local state update
    const applyLocalUpdate = () => {
      setActiveOrder((prev) => (prev ? { ...prev, status: newStatus } : null));
      setRecentOrders((prev) =>
        prev.map((o) => (o.orderId === targetOrderId ? { ...o, status: newStatus } : o))
      );
    };

    // If Airplane Mode is enabled: directly queue offline and bypass server
    if (airplaneMode) {
      if (activeOrder.nonce) {
        OfflineNonceRegistry.registerNonce(
          activeOrder.nonce,
          Math.floor(Date.now() / 1000) + 3600,
          targetOrderId
        );
      }
      enqueueSyncAction({
        orderId: targetOrderId,
        status: newStatus,
        nonce: activeOrder.nonce,
      });
      applyLocalUpdate();
      showToast('Queued for Cloud Sync (Offline)', 'warning');
      setActionLoading(false);
      return;
    }

    // Otherwise, attempt server sync
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(targetOrderId)}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Vendor-Pin': vendorPin,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();

      if (data.success) {
        applyLocalUpdate();
        fetchOrders();
        showToast(`Order marked ${newStatus.replace('_', ' ')}`, 'success');
      } else {
        if (res.status === 401) {
          setIsUnlocked(false);
          setPinError('Invalid or expired Staff PIN. Please unlock terminal again.');
        } else {
          showToast(data.error || 'Failed to update order status', 'warning');
        }
      }
    } catch {
      // Network error occurred: graceful offline fallback
      if (activeOrder.nonce) {
        OfflineNonceRegistry.registerNonce(
          activeOrder.nonce,
          Math.floor(Date.now() / 1000) + 3600,
          targetOrderId
        );
      }
      enqueueSyncAction({
        orderId: targetOrderId,
        status: newStatus,
        nonce: activeOrder.nonce,
      });
      applyLocalUpdate();
      showToast('Queued for Cloud Sync (Offline)', 'warning');
    } finally {
      setActionLoading(false);
    }
  };

  // Toggle Airplane Mode & trigger auto-sync on reconnect
  const handleAirplaneModeToggle = async (enabled: boolean) => {
    setAirplaneMode(enabled);
    if (!enabled) {
      // Disabling airplane mode -> auto flush sync queue
      showToast('Connecting to trackside cloud network...', 'info');
      try {
        const { resolved, failed } = await flushSyncQueue(vendorPin);
        if (resolved > 0) {
          showToast(`✓ Synced ${resolved} pending action(s) to cloud!`, 'success');
        } else if (failed > 0) {
          showToast(`⚠ ${failed} action(s) failed cloud sync`, 'warning');
        }
        fetchOrders();
      } catch {
        showToast('Offline sync flush failed', 'warning');
      }
    } else {
      showToast('Airplane Mode ON — Local offline mode active', 'warning');
    }
  };

  // Selecting an order from Locker Grid
  const handleSelectLockerOrder = (orderId: string) => {
    const found = recentOrders.find((o) => o.orderId === orderId);
    if (found) {
      setActiveOrder(found);
      setPassInput(orderId);
      setBadgeState('NUMERIC_FALLBACK');
      setVerificationFeedback({
        valid: true,
        latencyMs: 0,
        message: `Loaded from locker bay ${found.station?.lockerNumber || ''}`,
      });
    } else {
      setPassInput(orderId);
      verifyPayload(orderId);
    }
  };

  // Filter recent orders for selected station
  const stationOrders = recentOrders.filter(
    (o) => !o.station?.id || o.station.id === selectedStation
  );

  // PIN Gate Screen
  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-[#15181b] text-white flex flex-col items-center justify-center p-6">
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
              inputMode="text"
              autoComplete="current-password"
              maxLength={64}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="Enter the staff PIN"
              aria-invalid={Boolean(pinError)}
              aria-describedby={pinError ? "pin-error" : "pin-help"}
              className="w-full rounded-[10px] border border-[#353b42] bg-[#1d2125] px-4 py-3 text-[20px] tracking-[0.3em] text-white placeholder:text-[15px] placeholder:tracking-normal placeholder:text-neutral-500 focus:border-[#ffd100] focus:outline-none"
              autoFocus
            />
            {pinError ? (
              <p id="pin-error" className="text-[14px] font-medium text-[#ff8a80]">{pinError}</p>
            ) : (
              <p id="pin-help" className="text-[13px] text-neutral-500">Your shift lead has the PIN. It is never shown on this screen.</p>
            )}
            <button
              type="submit"
              className="h-12 w-full rounded-[10px] bg-[#ffd100] text-[16px] font-semibold text-[#1d2125] hover:bg-[#f0c200] transition-colors"
            >
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

  // Full-Screen Vendor Terminal Kiosk UI
  return (
    <div className="min-h-screen bg-[#0B0E14] text-white flex flex-col">
      {/* Toast Notification Banner */}
      {toastNotification && (
        <div
          className={`fixed top-4 right-4 z-50 rounded-xl px-4 py-3 text-xs font-bold shadow-2xl border flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-200 ${
            toastNotification.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/50 shadow-emerald-900/30'
              : toastNotification.type === 'warning'
              ? 'bg-amber-950/90 text-amber-300 border-amber-500/50 shadow-amber-900/30'
              : 'bg-neutral-900/90 text-neutral-200 border-neutral-700 shadow-black/50'
          }`}
        >
          <Icon
            icon={
              toastNotification.type === 'success'
                ? 'mdi:check-circle'
                : toastNotification.type === 'warning'
                ? 'mdi:alert-circle'
                : 'mdi:information'
            }
            width={18}
            height={18}
          />
          <span>{toastNotification.message}</span>
        </div>
      )}

      {/* Top Staff Navigation Header */}
      <header className="border-b border-neutral-800 bg-[#121620] px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <LogoMark size={40} />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-black text-lg text-white">
                Pit Stop staff terminal
              </h1>
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
                Active
              </span>
              {airplaneMode && (
                <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/30 flex items-center gap-1">
                  <Icon icon="mdi:airplane" width={12} height={12} />
                  Airplane Mode
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-400">
              Pod {selectedStation}, passes checked on this device
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
                    ? 'bg-[#ffd100] text-[#1d2125] shadow'
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
      <main className="flex-1 p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Top Telemetry KPI Bar */}
        <KioskTelemetryBar
          vendorPin={vendorPin}
          activeOrdersCount={stationOrders.filter((o) => o.status !== 'COMPLETED').length}
          lockerBays={lockerBays}
          airplaneMode={airplaneMode}
          onAirplaneModeToggle={handleAirplaneModeToggle}
          onSyncComplete={(resolved) => {
            if (resolved > 0) fetchOrders();
          }}
        />

        {/* 2-Column Responsive Body */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Smart Locker Grid & Pass Verification Engine (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Visual 8-Bay Locker Grid */}
            <LockerBayGrid
              stationId={selectedStation}
              vendorPin={vendorPin}
              activeOrderId={activeOrder?.orderId}
              onSelectOrder={handleSelectLockerOrder}
              recentOrders={recentOrders}
              onBaysUpdated={(bays) => setLockerBays(bays)}
            />

            {/* Scan & Input Card */}
            <div className="rounded-2xl border border-neutral-800 bg-[#121620] p-6 shadow-xl space-y-5">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                <div className="flex items-center gap-2">
                  <Icon icon="mdi:qrcode-scan" width={22} height={22} className="text-red-500" />
                  <h2 className="font-display font-black text-lg text-white">
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
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 py-3 font-display font-bold text-sm text-white transition-colors"
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
                      className="w-full rounded-xl bg-neutral-800 border border-neutral-700 py-2 text-xs font-bold text-neutral-300 hover:text-white"
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
                <label className="block text-xs font-bold text-neutral-400">
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
                    className="rounded-xl bg-[#ffd100] px-5 py-2.5 font-semibold text-sm text-[#1d2125] hover:bg-[#f0c200] disabled:opacity-50 transition-colors shrink-0"
                  >
                    {loading ? 'Verifying...' : 'Verify'}
                  </button>
                </div>
              </form>

              {/* Quick Demo Test Payloads */}
              <div className="pt-2 border-t border-neutral-800">
                <div className="text-[11px] font-bold text-neutral-500 mb-2">
                  Quick Verification Test Payloads
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const sample = 'AGPC1.AGPC-2027-KEY-01.DEMO.GP-2026-X9K2P4';
                      setPassInput(sample);
                      verifyPayload(sample);
                    }}
                    className="rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-300 hover:border-neutral-500"
                  >
                    Sample QR (GP-2026-X9K2P4)
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
                      showToast('Offline nonce registry cleared', 'info');
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
                        <span className="font-display font-black text-sm text-emerald-400">
                          Ed25519 Valid
                        </span>
                      </>
                    )}
                    {badgeState === 'REPLAY_DETECTED' && (
                      <>
                        <Icon icon="mdi:shield-alert" width={22} height={22} className="text-amber-400" />
                        <span className="font-display font-black text-sm text-amber-400">
                          Replay Detected
                        </span>
                      </>
                    )}
                    {badgeState === 'INVALID' && (
                      <>
                        <Icon icon="mdi:shield-remove" width={22} height={22} className="text-red-400" />
                        <span className="font-display font-black text-sm text-red-400">
                          Ed25519 Invalid
                        </span>
                      </>
                    )}
                    {badgeState === 'NUMERIC_FALLBACK' && (
                      <>
                        <Icon icon="mdi:numeric" width={22} height={22} className="text-blue-400" />
                        <span className="font-display font-black text-sm text-blue-400">
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

            {/* Active Order Details & Manifest */}
            {activeOrder && (
              <div className="rounded-2xl border border-neutral-800 bg-[#121620] p-6 shadow-xl space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-3">
                  <div>
                    <span className="font-mono text-xs font-bold text-neutral-400">{activeOrder.orderId}</span>
                    <h3 className="font-display font-black text-xl text-white">
                      Pickup PIN: {activeOrder.pinCode}
                    </h3>
                  </div>

                  <div className="text-right">
                    <span
                      className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${
                        activeOrder.status === 'COMPLETED'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : activeOrder.status === 'READY_FOR_PICKUP'
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {activeOrder.status === 'READY_FOR_PICKUP' ? 'Ready for pickup' : activeOrder.status === 'PREPARING' ? 'Preparing' : activeOrder.status === 'COMPLETED' ? 'Collected' : 'Received'}
                    </span>
                    <div className="text-xs text-neutral-400 mt-1 font-mono">
                      Locker: {activeOrder.station.lockerNumber}
                    </div>
                  </div>
                </div>

                {/* Order Items List */}
                <div className="space-y-2">
                  <div className="text-xs font-bold text-neutral-400">Order Items</div>
                  <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3 divide-y divide-neutral-800">
                    {activeOrder.items.map((item, idx) => (
                      <div key={idx} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between text-sm">
                        <div className="font-medium text-white">
                          <span className="font-bold text-[#ffd100] mr-2">{item.quantity}×</span>
                          {item.name}
                          {item.options && item.options.length > 0 && (
                            <span className="ml-2 rounded bg-[#ffd100]/15 px-1.5 py-0.5 text-xs font-semibold text-[#ffd100]">
                              {item.options.join(', ')}
                            </span>
                          )}
                        </div>
                        <div className="font-mono font-bold text-neutral-300">
                          ${(item.unitPrice * item.quantity).toFixed(2)}
                        </div>
                      </div>
                    ))}
                    <div className="pt-2 flex items-center justify-between font-bold text-sm">
                      <span className="text-neutral-400">Total Value</span>
                      <span className="font-mono text-amber-400">${activeOrder.total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Quick Action Buttons */}
                <div className="pt-2 border-t border-neutral-800 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-neutral-400">
                    <span>Quick Lifecycle Actions</span>
                    {airplaneMode && (
                      <span className="text-amber-400 font-mono text-[10px]">
                        [OUTBOX MODE]
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      disabled={actionLoading || activeOrder.status === 'PREPARING'}
                      onClick={() => handleStatusAdvance('PREPARING')}
                      className="rounded-xl border border-amber-500/40 bg-amber-950/30 hover:bg-amber-900/50 py-2.5 font-display font-bold text-xs text-amber-300 disabled:opacity-40 transition-colors"
                    >
                      Start Preparing
                    </button>
                    <button
                      type="button"
                      disabled={actionLoading || activeOrder.status === 'READY_FOR_PICKUP'}
                      onClick={() => handleStatusAdvance('READY_FOR_PICKUP')}
                      className="rounded-xl border border-blue-500/40 bg-blue-950/30 hover:bg-blue-900/50 py-2.5 font-display font-bold text-xs text-blue-300 disabled:opacity-40 transition-colors"
                    >
                      Mark Ready
                    </button>
                    <button
                      type="button"
                      disabled={actionLoading || activeOrder.status === 'COMPLETED'}
                      onClick={() => handleStatusAdvance('COMPLETED')}
                      className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 hover:bg-emerald-900/50 py-2.5 font-display font-bold text-xs text-emerald-300 disabled:opacity-40 transition-colors shadow-lg shadow-emerald-950/50"
                    >
                      Complete Collection
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Race Control Panel & Station Queue (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Live Race Control & Merch Drops */}
            <RaceControlPanel vendorPin={vendorPin} />

            {/* Active Station Queue */}
            <div className="rounded-2xl border border-neutral-800 bg-[#121620] p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                <div className="flex items-center gap-2">
                  <Icon icon="mdi:tray-full" width={20} height={20} className="text-neutral-400" />
                  <h3 className="font-display font-black text-base text-white">
                    Station {selectedStation} Queue ({stationOrders.length})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={fetchOrders}
                  disabled={airplaneMode}
                  className="text-neutral-400 hover:text-white p-1 disabled:opacity-40 transition-colors"
                  aria-label="Refresh orders"
                >
                  <Icon icon="mdi:refresh" width={18} height={18} />
                </button>
              </div>

              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {stationOrders.length === 0 ? (
                  <div className="text-center py-8 text-neutral-500 text-sm">
                    No orders currently active at Station {selectedStation}
                  </div>
                ) : (
                  stationOrders.map((ord) => (
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
                          ? 'border-red-500 bg-red-950/20 ring-1 ring-red-500/50'
                          : 'border-neutral-800 bg-neutral-900/60 hover:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-red-400">{ord.orderId}</span>
                        <span
                          className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${
                            ord.status === 'COMPLETED'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : ord.status === 'READY_FOR_PICKUP'
                              ? 'bg-blue-500/20 text-blue-400'
                              : 'bg-amber-500/20 text-amber-400'
                          }`}
                        >
                          {ord.status === 'READY_FOR_PICKUP' ? 'READY FOR PICKUP' : ord.status.replace(/_/g, ' ')}
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
        </div>
      </main>
    </div>
  );
}
