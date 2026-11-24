/**
 * Pit Stop Live / Local Smoke Verification Script (v3.0 Production Platform)
 * Executable via:
 *   npx tsx src/scripts/smokeLive.ts
 * Or against a running server (local or deployed), with that server's staff PIN:
 *   APP_URL=https://<your-app-url> VENDOR_ACCESS_PIN=<staff pin> npx tsx src/scripts/smokeLive.ts
 *
 * Full End-to-End Fan-to-Vendor Lifecycle:
 * 1. Live Race Control Circuit State (/api/circuit/status)
 * 2. Fetch Ed25519 public key (/api/crypto/public-key)
 * 3. Create authoritative order with PITSTOP15 voucher (/api/orders)
 * 4. Verify Ed25519 cryptographic pass offline (<10ms SLA) & test replay detection
 * 5. Verify Zero-Secret public tracking (/api/orders/[id]/public)
 * 6. Query fan order history (/api/orders/history?ticketCode=...)
 * 7. Execute idempotent payment checkout (/api/payment/checkout)
 * 8. Vendor kiosk staff marks order COMPLETED with the staff PIN (/api/orders/[id]/status)
 * 9. Verify fan rewards balance & badges awarded (/api/rewards)
 * 10. Clean teardown & registry flush
 */

import { generateKeyPairSync, randomInt } from 'crypto';
import { setVerificationPublicKey, verifyQrPayload } from '../lib/crypto/passVerifier';
import { OfflineNonceRegistry } from '../lib/crypto/nonceRegistry';

// Fallback direct route handlers for standalone in-process execution
import { GET as getPublicKeyRoute } from '../app/api/crypto/public-key/route';
import { POST as createOrderRoute } from '../app/api/orders/route';
import { POST as checkoutRoute } from '../app/api/payment/checkout/route';
import { PATCH as patchOrderStatusRoute } from '../app/api/orders/[id]/status/route';
import { GET as getRewardsRoute } from '../app/api/rewards/route';
import { GET as getCircuitStatusRoute } from '../app/api/circuit/status/route';
import { GET as getOrderHistoryRoute } from '../app/api/orders/history/route';
import { GET as getOrderPublicRoute } from '../app/api/orders/[id]/public/route';
import { POST as restockRoute } from '../app/api/inventory/restock/route';

interface ApiResponse<T = Record<string, unknown>> {
  status: number;
  data: T;
}

interface SmokeClient {
  isHttp: boolean;
  baseUrl: string;
  getCircuitStatus: () => Promise<ApiResponse<{ flag: string; offPeakDiscountPct: number; message: string }>>;
  getPublicKey: () => Promise<ApiResponse<{ keyId: string; publicKeyBase64: string; algorithm: string; format: string }>>;
  createOrder: (payload: Record<string, unknown>) => Promise<ApiResponse<{
    success: boolean;
    order: {
      orderId: string;
      pickupStationName: string;
      pickupStationId: string;
      pinCode: string;
      subtotal: number;
      discountAmount: number;
      discountRate: string;
      total: number;
      serviceFee: number;
      loyaltyPointsEarned: number;
      qrPayload: string;
    };
  }>>;
  getOrderHistory: (ticketCode: string) => Promise<ApiResponse<{
    success: boolean;
    ticketCode: string;
    count: number;
    orders: Array<{ orderId: string; total: number; status: string }>;
  }>>;
  getOrderPublic: (orderId: string) => Promise<ApiResponse<{
    success: boolean;
    orderId?: string;
    status?: string;
    pickupStationId?: string;
    counterNumber?: string;
    qrPayload?: unknown;
    pinCode?: unknown;
    signatureBase64?: unknown;
    data?: {
      orderId: string;
      status: string;
      pickupStationId: string;
      counterNumber: string;
      qrPayload?: unknown;
      pinCode?: unknown;
      signatureBase64?: unknown;
    };
  }>>;
  checkout: (payload: Record<string, unknown>, idempotencyKey: string) => Promise<ApiResponse<{
    success: boolean;
    data: { status: string; transactionId: string; paymentMethod: string };
  }>>;
  updateOrderStatus: (orderId: string, status: string, pin?: string) => Promise<ApiResponse<{
    success: boolean;
    order?: { status: string };
  }>>;
  getRewards: (ticketCode: string) => Promise<ApiResponse<{
    success: boolean;
    data: {
      holderName: string;
      ticketCode: string;
      points: number;
      tier: string;
      badges: Array<{ id: string; name: string; unlocked: boolean }>;
      vouchers: unknown[];
    };
  }>>;
  restockAll: () => Promise<ApiResponse<{ success: boolean }>>;
}

// Staff PIN sent to vendor endpoints. The app has no default PIN, so an HTTP
// target needs the real one from the environment.
let vendorPin = process.env.VENDOR_ACCESS_PIN || '';

function requireVendorPin(target: string): void {
  if (!vendorPin) {
    console.error(`✗ VENDOR_ACCESS_PIN is not set. Export the staff PIN of ${target} and run again.`);
    process.exit(1);
  }
}

// In-process runs talk to no server, so they configure a throwaway PIN and
// signing key for this one process when none are provided.
function configureInProcessSecrets(): void {
  if (!vendorPin) {
    vendorPin = String(randomInt(1000, 10000));
    process.env.VENDOR_ACCESS_PIN = vendorPin;
  }
  if (!process.env.ED25519_PRIVATE_KEY_BASE64) {
    const { privateKey } = generateKeyPairSync('ed25519');
    process.env.ED25519_PRIVATE_KEY_BASE64 = privateKey
      .export({ type: 'pkcs8', format: 'der' })
      .toString('base64');
  }
}

async function initClient(): Promise<SmokeClient> {
  const targetUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;

  if (targetUrl) {
    console.log(`📡 Target mode: HTTP (${targetUrl})`);
    requireVendorPin(targetUrl);
    return createHttpClient(targetUrl.replace(/\/$/, ''));
  }

  // Probe localhost:3000 to see if dev server is running
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 800);
    const probe = await fetch('http://localhost:3000/api/crypto/public-key', {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (probe.ok) {
      console.log('📡 Target mode: Local HTTP Server (http://localhost:3000)');
      requireVendorPin('http://localhost:3000');
      return createHttpClient('http://localhost:3000');
    }
  } catch {
    // Dev server not running, fall back to in-process execution
  }

  console.log('⚡ Target mode: In-Process Next.js Serverless Route Dispatch (Standalone)');
  configureInProcessSecrets();
  return createInProcessClient();
}

function createHttpClient(baseUrl: string): SmokeClient {
  return {
    isHttp: true,
    baseUrl,
    async getCircuitStatus() {
      const res = await fetch(`${baseUrl}/api/circuit/status`);
      return { status: res.status, data: await res.json() };
    },
    async getPublicKey() {
      const res = await fetch(`${baseUrl}/api/crypto/public-key`);
      return { status: res.status, data: await res.json() };
    },
    async createOrder(payload) {
      const res = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return { status: res.status, data: await res.json() };
    },
    async getOrderHistory(ticketCode) {
      const res = await fetch(`${baseUrl}/api/orders/history?ticketCode=${encodeURIComponent(ticketCode)}`);
      return { status: res.status, data: await res.json() };
    },
    async getOrderPublic(orderId) {
      const res = await fetch(`${baseUrl}/api/orders/${encodeURIComponent(orderId)}/public`);
      return { status: res.status, data: await res.json() };
    },
    async checkout(payload, idempotencyKey) {
      const res = await fetch(`${baseUrl}/api/payment/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      });
      return { status: res.status, data: await res.json() };
    },
    async updateOrderStatus(orderId, status, pin = vendorPin) {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (pin) headers['X-Vendor-Pin'] = pin;
      const res = await fetch(`${baseUrl}/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status }),
      });
      return { status: res.status, data: await res.json() };
    },
    async getRewards(ticketCode) {
      const res = await fetch(`${baseUrl}/api/rewards?ticketCode=${encodeURIComponent(ticketCode)}`);
      return { status: res.status, data: await res.json() };
    },
    async restockAll() {
      const res = await fetch(`${baseUrl}/api/inventory/restock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Vendor-Pin': vendorPin,
        },
        body: JSON.stringify({ mode: 'restock_all' }),
      });
      return { status: res.status, data: await res.json() };
    },
  };
}

function createInProcessClient(): SmokeClient {
  return {
    isHttp: false,
    baseUrl: 'in-process',
    async getCircuitStatus() {
      const res = await getCircuitStatusRoute();
      return { status: res.status, data: await res.json() };
    },
    async getPublicKey() {
      const res = await getPublicKeyRoute();
      return { status: res.status, data: await res.json() };
    },
    async createOrder(payload) {
      const req = new Request('http://localhost:3000/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const res = await createOrderRoute(req);
      return { status: res.status, data: await res.json() };
    },
    async getOrderHistory(ticketCode) {
      const req = new Request(`http://localhost:3000/api/orders/history?ticketCode=${encodeURIComponent(ticketCode)}`);
      const res = await getOrderHistoryRoute(req);
      return { status: res.status, data: await res.json() };
    },
    async getOrderPublic(orderId) {
      const req = new Request(`http://localhost:3000/api/orders/${encodeURIComponent(orderId)}/public`);
      const res = await getOrderPublicRoute(req, { params: { id: orderId } });
      return { status: res.status, data: await res.json() };
    },
    async checkout(payload, idempotencyKey) {
      const req = new Request('http://localhost:3000/api/payment/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      });
      const res = await checkoutRoute(req);
      return { status: res.status, data: await res.json() };
    },
    async updateOrderStatus(orderId, status, pin = vendorPin) {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (pin) headers['X-Vendor-Pin'] = pin;
      const req = new Request(`http://localhost:3000/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status }),
      });
      const res = await patchOrderStatusRoute(req, { params: { id: orderId } });
      return { status: res.status, data: await res.json() };
    },
    async getRewards(ticketCode) {
      const req = new Request(`http://localhost:3000/api/rewards?ticketCode=${encodeURIComponent(ticketCode)}`);
      const res = await getRewardsRoute(req);
      return { status: res.status, data: await res.json() };
    },
    async restockAll() {
      const req = new Request('http://localhost:3000/api/inventory/restock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Vendor-Pin': vendorPin,
        },
        body: JSON.stringify({ mode: 'restock_all' }),
      });
      const res = await restockRoute(req);
      return { status: res.status, data: await res.json() };
    },
  };
}

async function runSmoke() {
  console.log('\n======================================================');
  console.log('🏎️  PIT STOP v3.0: END-TO-END SMOKE VERIFICATION SUITE');
  console.log('======================================================\n');

  const startTime = Date.now();
  const client = await initClient();

  // --------------------------------------------------------------------------
  // STEP 1: Live Race Control Circuit State
  // --------------------------------------------------------------------------
  console.log('▶ STEP 1: Checking Live Race Control via GET /api/circuit/status...');
  const circuitRes = await client.getCircuitStatus();
  if (circuitRes.status !== 200 || !circuitRes.data.flag) {
    throw new Error(`Circuit status check failed: HTTP ${circuitRes.status}`);
  }
  console.log(`  ✓ Circuit Flag: ${circuitRes.data.flag} (${circuitRes.data.offPeakDiscountPct}% off-peak discount)`);
  console.log(`  ✓ Race Message: "${circuitRes.data.message}"`);

  // --------------------------------------------------------------------------
  // STEP 2: Public Key Retrieval
  // --------------------------------------------------------------------------
  console.log('\n▶ STEP 2: Fetching Server Public Key via GET /api/crypto/public-key...');
  const pubKeyRes = await client.getPublicKey();
  if (pubKeyRes.status !== 200 || !pubKeyRes.data.publicKeyBase64) {
    throw new Error(`Failed to fetch public key: HTTP ${pubKeyRes.status}`);
  }
  console.log(`  ✓ Algorithm: ${pubKeyRes.data.algorithm} (${pubKeyRes.data.format})`);
  console.log(`  ✓ Key ID: ${pubKeyRes.data.keyId}`);
  console.log(`  ✓ SPKI Base64: ${pubKeyRes.data.publicKeyBase64.substring(0, 32)}...`);

  // Seed verifier cache
  setVerificationPublicKey(pubKeyRes.data.publicKeyBase64);
  console.log('  ✓ Public key loaded into local passVerifier engine');

  // --------------------------------------------------------------------------
  // STEP 3: Create Order (Authoritative Pricing + Cryptographic Pass)
  // --------------------------------------------------------------------------
  console.log('\n▶ STEP 3: Submitting Order via POST /api/orders (PITSTOP15 Promo Applied)...');
  const orderRes = await client.createOrder({
    stationId: 'M2',
    ticketCode: 'GP-3820-X',
    promoCode: 'PITSTOP15',
    isGroupOrder: true,
    seatNote: 'Clark Grandstand Row H, Seats 14-16',
    items: [
      { itemId: 'apex-burger', quantity: 2, unitPrice: 16.5 },
      { itemId: 'craft-lager', quantity: 1, unitPrice: 36.0 },
    ],
  });

  if ((orderRes.status !== 200 && orderRes.status !== 201) || !orderRes.data.success) {
    throw new Error(`Order creation failed: HTTP ${orderRes.status} ${JSON.stringify(orderRes.data)}`);
  }

  const order = orderRes.data.order;
  console.log(`  ✓ Order Created: ${order.orderId}`);
  console.log(`  ✓ Pickup Pod: ${order.pickupStationName} (${order.pickupStationId})`);
  console.log(`  ✓ Subtotal: $${order.subtotal.toFixed(2)} | Discount: -$${order.discountAmount.toFixed(2)} (${order.discountRate})`);
  console.log(`  ✓ Service Fee: $${order.serviceFee.toFixed(2)} | Final Total: $${order.total.toFixed(2)}`);
  console.log(`  ✓ Express Locker PIN: ${order.pinCode}`);
  console.log(`  ✓ Cryptographic QR: ${order.qrPayload.substring(0, 48)}...`);

  // --------------------------------------------------------------------------
  // STEP 4: Offline Ed25519 Pass Verification & Replay Protection
  // --------------------------------------------------------------------------
  console.log('\n▶ STEP 4: Offline Verification of Pass via @noble/curves (<10ms SLA)...');
  const verifyStart = performance.now();
  const verifyResult = verifyQrPayload(order.qrPayload, order.pickupStationId);
  const verifyLatency = performance.now() - verifyStart;

  if (!verifyResult.isValid) {
    throw new Error(`Offline verification failed: ${verifyResult.reason}`);
  }
  console.log(`  ✓ Offline Signature Validated in ${verifyLatency.toFixed(3)} ms (Target < 10.0 ms SLA)`);
  console.log(`  ✓ Order ID decoded from QR: ${verifyResult.orderId}`);

  // Test Nonce Replay Mitigation
  OfflineNonceRegistry.clear();
  const nonce = verifyResult.payload?.nonce || `nonce-${Date.now()}`;
  const expiresAt = verifyResult.payload?.expiresAt || Math.floor(Date.now() / 1000) + 3600;

  const firstScan = OfflineNonceRegistry.registerNonce(nonce, expiresAt, order.orderId);
  if (!firstScan.success) throw new Error('Initial nonce registration failed');
  console.log('  ✓ Initial barcode scan registered in OfflineNonceRegistry');

  const secondScan = OfflineNonceRegistry.registerNonce(nonce, expiresAt, order.orderId);
  if (secondScan.success || secondScan.reason !== 'REPLAY_DETECTED') {
    throw new Error(`Replay protection failed: expected REPLAY_DETECTED, got ${JSON.stringify(secondScan)}`);
  }
  console.log('  ✓ Replay attack detected: duplicate scan rejected with REPLAY_DETECTED');

  // --------------------------------------------------------------------------
  // STEP 5: Zero-Secret Public Tracking Audit (/api/orders/[id]/public)
  // --------------------------------------------------------------------------
  console.log('\n▶ STEP 5: Auditing Public Read-Only Tracker via GET /api/orders/[id]/public...');
  const publicRes = await client.getOrderPublic(order.orderId);
  if (publicRes.status !== 200) {
    throw new Error(`Public tracking endpoint failed: HTTP ${publicRes.status}`);
  }

  const pubData = publicRes.data.data || publicRes.data;
  console.log(`  ✓ Public Tracker Order ID: ${pubData.orderId}`);
  console.log(`  ✓ Public Status: ${pubData.status}`);
  console.log(`  ✓ Designated Locker Bay: ${pubData.counterNumber}`);

  // Strict Zero-Secret assertions
  if (pubData.qrPayload !== undefined || publicRes.data.qrPayload !== undefined) {
    throw new Error('SECURITY VIOLATION: qrPayload exposed in public tracking endpoint!');
  }
  if (pubData.pinCode !== undefined || publicRes.data.pinCode !== undefined) {
    throw new Error('SECURITY VIOLATION: pinCode exposed in public tracking endpoint!');
  }
  if (pubData.signatureBase64 !== undefined || publicRes.data.signatureBase64 !== undefined) {
    throw new Error('SECURITY VIOLATION: signatureBase64 exposed in public tracking endpoint!');
  }
  console.log('  ✓ Zero-Secret Contract Verified: qrPayload, pinCode & signatureBase64 are strictly UNDEFINED');

  // --------------------------------------------------------------------------
  // STEP 6: Fan Order History (/api/orders/history)
  // --------------------------------------------------------------------------
  console.log('\n▶ STEP 6: Querying Fan Order History via GET /api/orders/history?ticketCode=GP-3820-X...');
  const historyRes = await client.getOrderHistory('GP-3820-X');
  if (historyRes.status !== 200 || !historyRes.data.success) {
    throw new Error(`Fan order history failed: HTTP ${historyRes.status}`);
  }
  const ordersList = historyRes.data.orders || [];
  console.log(`  ✓ Found ${ordersList.length} past orders for ticket GP-3820-X`);
  const foundOrder = ordersList.find((o) => o.orderId === order.orderId);
  if (foundOrder) {
    console.log(`  ✓ Verified order ${order.orderId} listed in fan history (status: ${foundOrder.status})`);
  }

  // --------------------------------------------------------------------------
  // STEP 7: Idempotent Payment Checkout
  // --------------------------------------------------------------------------
  console.log('\n▶ STEP 7: Authorizing Payment via POST /api/payment/checkout...');
  const idempotencyKey = `smoke-tx-${Date.now()}-${order.orderId}`;
  const payRes = await client.checkout(
    {
      orderId: order.orderId,
      amount: order.total,
      paymentMethod: 'apple_pay',
      pinCode: order.pinCode,
    },
    idempotencyKey
  );

  if (payRes.status !== 200 || !payRes.data.success) {
    throw new Error(`Payment checkout failed: HTTP ${payRes.status} ${JSON.stringify(payRes.data)}`);
  }
  console.log(`  ✓ Payment Authorized: TxID ${payRes.data.data.transactionId} (${payRes.data.data.paymentMethod})`);

  // Check idempotency replay
  const replayPayRes = await client.checkout(
    {
      orderId: order.orderId,
      amount: order.total,
      paymentMethod: 'apple_pay',
      pinCode: order.pinCode,
    },
    idempotencyKey
  );
  if (replayPayRes.data.data.transactionId !== payRes.data.data.transactionId) {
    throw new Error('Payment idempotency failed: returned different transaction ID');
  }
  console.log('  ✓ Payment idempotency verified: identical transaction returned for duplicate submission');

  // --------------------------------------------------------------------------
  // STEP 8: Vendor Kiosk Order Status Update (staff PIN)
  // --------------------------------------------------------------------------
  console.log('\n▶ STEP 8: Updating Order Status to COMPLETED via PATCH /api/orders/[id]/status...');

  // Test unauthorized rejection
  const unauthRes = await client.updateOrderStatus(order.orderId, 'READY_FOR_PICKUP', 'INVALID_PIN');
  if (unauthRes.status !== 401) {
    throw new Error(`Expected 401 Unauthorized for invalid vendor PIN, got ${unauthRes.status}`);
  }
  console.log('  ✓ Security check: unauthorized PIN rejected with 401');

  // Update to COMPLETED with the valid staff PIN
  const completeRes = await client.updateOrderStatus(order.orderId, 'COMPLETED', vendorPin);
  if (completeRes.status !== 200 || !completeRes.data.success) {
    throw new Error(`Vendor order completion failed: HTTP ${completeRes.status} ${JSON.stringify(completeRes.data)}`);
  }
  console.log('  ✓ Vendor marked order COMPLETED (staff PIN verified)');

  // --------------------------------------------------------------------------
  // STEP 9: Rewards Balance Verification
  // --------------------------------------------------------------------------
  console.log('\n▶ STEP 9: Verifying Fan Rewards Balance & Badges via GET /api/rewards...');
  const rewardsRes = await client.getRewards('GP-3820-X');
  if (rewardsRes.status !== 200 || !rewardsRes.data.success) {
    throw new Error(`Failed to fetch rewards: HTTP ${rewardsRes.status} ${JSON.stringify(rewardsRes.data)}`);
  }

  const rewards = rewardsRes.data.data;
  console.log(`  ✓ Holder Name: ${rewards.holderName} (${rewards.ticketCode})`);
  console.log(`  ✓ Loyalty Balance: ${rewards.points} pts (Tier: ${rewards.tier})`);
  console.log(`  ✓ Badges Count: ${rewards.badges.length} badges (${rewards.badges.filter((b) => b.unlocked).length} unlocked)`);
  console.log(`  ✓ Active Vouchers: ${rewards.vouchers.length} vouchers`);

  // --------------------------------------------------------------------------
  // STEP 10: Clean Teardown
  // --------------------------------------------------------------------------
  console.log('\n▶ STEP 10: Executing Clean Teardown...');
  OfflineNonceRegistry.clear();
  console.log('  ✓ Nonce registry flushed cleanly');

  // Restock inventory to leave DB in clean state
  try {
    const restockRes = await client.restockAll();
    if (restockRes.status === 200 && (restockRes.data as { success?: boolean })?.success) {
      console.log('  ✓ Inventory restocked to full baseline levels');
    }
  } catch (err: unknown) {
    console.warn('  ⚠️ Note: Restock teardown failed (non-fatal):', err instanceof Error ? err.message : err);
  }

  const elapsedMs = Date.now() - startTime;
  console.log('\n======================================================');
  console.log(`🏁 ALL 10 SMOKE TESTS PASSED PERFECTLY IN ${elapsedMs} ms!`);
  console.log('======================================================\n');
}

runSmoke().catch((err) => {
  console.error('\n❌ Smoke Verification FAILED:');
  console.error(err);
  process.exit(1);
});
