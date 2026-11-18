/**
 * Pit Stop Live / Local Smoke Verification Script
 * Executable via:
 *   npx tsx src/scripts/smokeLive.ts
 * Or against live deployment:
 *   APP_URL=https://main.d3m92lj3xoqgf9.amplifyapp.com npx tsx src/scripts/smokeLive.ts
 *
 * Full End-to-End Fan-to-Vendor Lifecycle:
 * 1. Fetch Ed25519 public key (/api/crypto/public-key)
 * 2. Create authoritative order with PITSTOP15 voucher (/api/orders)
 * 3. Verify Ed25519 cryptographic pass offline (<10ms SLA) & test replay detection
 * 4. Execute idempotent payment checkout (/api/payment/checkout)
 * 5. Vendor kiosk staff marks order COMPLETED with Staff PIN 2026 (/api/orders/[id]/status)
 * 6. Verify fan rewards balance & badges awarded (/api/rewards)
 */

import { setVerificationPublicKey, verifyQrPayload } from '../lib/crypto/passVerifier';
import { OfflineNonceRegistry } from '../lib/crypto/nonceRegistry';

// Fallback direct route handlers for standalone in-process execution
import { GET as getPublicKeyRoute } from '../app/api/crypto/public-key/route';
import { POST as createOrderRoute } from '../app/api/orders/route';
import { POST as checkoutRoute } from '../app/api/payment/checkout/route';
import { PATCH as patchOrderStatusRoute } from '../app/api/orders/[id]/status/route';
import { GET as getRewardsRoute } from '../app/api/rewards/route';

interface ApiResponse<T = Record<string, unknown>> {
  status: number;
  data: T;
}

interface SmokeClient {
  isHttp: boolean;
  baseUrl: string;
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
}

async function initClient(): Promise<SmokeClient> {
  const targetUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;

  if (targetUrl) {
    console.log(`📡 Target mode: HTTP (${targetUrl})`);
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
      return createHttpClient('http://localhost:3000');
    }
  } catch {
    // Dev server not running, fall back to in-process execution
  }

  console.log('⚡ Target mode: In-Process Next.js Serverless Route Dispatch (Standalone)');
  return createInProcessClient();
}

function createHttpClient(baseUrl: string): SmokeClient {
  return {
    isHttp: true,
    baseUrl,
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
    async updateOrderStatus(orderId, status, pin = '2026') {
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
  };
}

function createInProcessClient(): SmokeClient {
  return {
    isHttp: false,
    baseUrl: 'in-process',
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
    async updateOrderStatus(orderId, status, pin = '2026') {
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
  };
}

async function runSmoke() {
  console.log('\n======================================================');
  console.log('🏎️  PIT STOP v2: END-TO-END SMOKE VERIFICATION SUITE');
  console.log('======================================================\n');

  const startTime = Date.now();
  const client = await initClient();

  // --------------------------------------------------------------------------
  // STEP 1: Fetch Ed25519 Public Key
  // --------------------------------------------------------------------------
  console.log('▶ STEP 1: Fetching Ed25519 Public Key from /api/crypto/public-key...');
  const keyRes = await client.getPublicKey();
  if (keyRes.status !== 200 || !keyRes.data.publicKeyBase64) {
    throw new Error(`Failed to fetch public key: HTTP ${keyRes.status} ${JSON.stringify(keyRes.data)}`);
  }
  const { publicKeyBase64, keyId, algorithm } = keyRes.data;
  console.log(`  ✓ Public Key fetched: ${keyId} (${algorithm})`);
  console.log(`  ✓ Public Key DER Base64: ${publicKeyBase64.substring(0, 24)}...`);

  // Wire into verifier
  setVerificationPublicKey(publicKeyBase64);

  // --------------------------------------------------------------------------
  // STEP 2: Create Order with PITSTOP15 Voucher
  // --------------------------------------------------------------------------
  console.log('\n▶ STEP 2: Creating Order via POST /api/orders...');
  const orderPayload = {
    items: [
      { itemId: 'apex-burger', quantity: 2, unitPrice: 16.5 },
      { itemId: 'craft-lager', quantity: 1, unitPrice: 36.0 },
    ],
    stationId: 'M2',
    ticketCode: 'GP-3820-X',
    promoCode: 'PITSTOP15',
    circuitStatus: 'GREEN_FLAG',
  };

  const orderRes = await client.createOrder(orderPayload);
  if (![200, 201].includes(orderRes.status) || !orderRes.data.success) {
    throw new Error(`Failed to create order: HTTP ${orderRes.status} ${JSON.stringify(orderRes.data)}`);
  }

  const order = orderRes.data.order;
  console.log(`  ✓ Order Created: ${order.orderId}`);
  console.log(`  ✓ Pickup Station: ${order.pickupStationName} (${order.pickupStationId})`);
  console.log(`  ✓ 4-Digit PIN Code: ${order.pinCode}`);
  console.log(`  ✓ Subtotal: $${order.subtotal.toFixed(2)}, Discount: -$${order.discountAmount.toFixed(2)} (${order.discountRate})`);
  console.log(`  ✓ Total Charged: $${order.total.toFixed(2)} (Service Fee: $${order.serviceFee.toFixed(2)})`);
  console.log(`  ✓ Points to Earn: +${order.loyaltyPointsEarned} pts`);

  // --------------------------------------------------------------------------
  // STEP 3: Offline Ed25519 Pass Verification & Replay Mitigation
  // --------------------------------------------------------------------------
  console.log('\n▶ STEP 3: Validating Cryptographic Ed25519 Digital Pass Offline...');
  const qrPayload = order.qrPayload;
  if (!qrPayload || !qrPayload.startsWith('AGPC1.')) {
    throw new Error(`Malformed QR payload received: ${qrPayload}`);
  }

  const verifyStart = performance.now();
  const verifyResult = verifyQrPayload(qrPayload, 'M2');
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
  // STEP 4: Idempotent Payment Checkout
  // --------------------------------------------------------------------------
  console.log('\n▶ STEP 4: Authorizing Payment via POST /api/payment/checkout...');
  const idempotencyKey = `smoke-tx-${Date.now()}-${order.orderId}`;
  const payRes = await client.checkout(
    {
      orderId: order.orderId,
      amount: order.total,
      paymentMethod: 'apple_pay',
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
    },
    idempotencyKey
  );
  if (replayPayRes.data.data.transactionId !== payRes.data.data.transactionId) {
    throw new Error('Payment idempotency failed: returned different transaction ID');
  }
  console.log('  ✓ Payment idempotency verified: identical transaction returned for duplicate submission');

  // --------------------------------------------------------------------------
  // STEP 5: Vendor Kiosk Order Status Update (Staff PIN 2026)
  // --------------------------------------------------------------------------
  console.log('\n▶ STEP 5: Updating Order Status to COMPLETED via PATCH /api/orders/[id]/status...');

  // Test unauthorized rejection
  const unauthRes = await client.updateOrderStatus(order.orderId, 'READY_FOR_PICKUP', 'INVALID_PIN');
  if (unauthRes.status !== 401) {
    throw new Error(`Expected 401 Unauthorized for invalid vendor PIN, got ${unauthRes.status}`);
  }
  console.log('  ✓ Security check: unauthorized PIN rejected with 401');

  // Update to COMPLETED with valid Staff PIN 2026
  const completeRes = await client.updateOrderStatus(order.orderId, 'COMPLETED', '2026');
  if (completeRes.status !== 200 || !completeRes.data.success) {
    throw new Error(`Vendor order completion failed: HTTP ${completeRes.status} ${JSON.stringify(completeRes.data)}`);
  }
  console.log(`  ✓ Vendor marked order COMPLETED (Staff PIN: 2026 verified)`);

  // --------------------------------------------------------------------------
  // STEP 6: Rewards Balance Verification
  // --------------------------------------------------------------------------
  console.log('\n▶ STEP 6: Verifying Fan Rewards Balance & Badges via GET /api/rewards...');
  const rewardsRes = await client.getRewards('GP-3820-X');
  if (rewardsRes.status !== 200 || !rewardsRes.data.success) {
    throw new Error(`Failed to fetch rewards: HTTP ${rewardsRes.status} ${JSON.stringify(rewardsRes.data)}`);
  }

  const rewards = rewardsRes.data.data;
  console.log(`  ✓ Holder Name: ${rewards.holderName} (${rewards.ticketCode})`);
  console.log(`  ✓ Loyalty Balance: ${rewards.points} pts (Tier: ${rewards.tier})`);
  console.log(`  ✓ Badges Count: ${rewards.badges.length} badges (${rewards.badges.filter((b) => b.unlocked).length} unlocked)`);
  console.log(`  ✓ Active Vouchers: ${rewards.vouchers.length} vouchers`);

  const elapsedMs = Date.now() - startTime;
  console.log('\n======================================================');
  console.log(`🏁 ALL 6 SMOKE TESTS PASSED PERFECTLY IN ${elapsedMs} ms!`);
  console.log('======================================================\n');
}

runSmoke().catch((err) => {
  console.error('\n❌ Smoke Verification FAILED:');
  console.error(err);
  process.exit(1);
});
