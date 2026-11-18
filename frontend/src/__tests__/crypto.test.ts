import { Ed25519PassEngine, OrderPassPayload } from '../lib/crypto/passEngine';

async function testCrypto() {
  console.log('Testing Ed25519 Cryptographic Verification Suite...');

  const nowEpoch = Math.floor(Date.now() / 1000);
  const payload: OrderPassPayload = {
    orderId: 'GP-7729',
    customerId: 'TICKET-GP-3820-X',
    targetStationId: 'M1',
    issuedAt: nowEpoch,
    expiresAt: nowEpoch + 7200,
    items: [
      { sku: 'pitlane-pizza', name: 'PIT LANE MARGHERITA', quantity: 1, unitPriceCents: 1800 },
      { sku: 'still-water', name: 'MOUNT FRANKLIN WATER', quantity: 2, unitPriceCents: 450 },
    ],
    nonce: 'crypto-test-nonce-001',
  };

  // Test 1: Keypair generation / retrieval
  const keys = Ed25519PassEngine.getKeypair();
  if (!keys.privateKey || !keys.publicKey) throw new Error('Keypair generation failed');
  console.log('✓ Pass 1: Keypair initialized successfully');

  // Test 2: Signing
  const signed = Ed25519PassEngine.issueSignedPass(payload);
  if (!signed.signatureBase64 || !signed.qrPayload) throw new Error('Signing failed');
  console.log('✓ Pass 2: Cryptographic signature generated');

  // Test 3: Offline verification
  const verifyResult = Ed25519PassEngine.verifyPassOffline(signed, 'M1');
  if (!verifyResult.isValid) throw new Error(`Verification failed: ${verifyResult.reason}`);
  if (verifyResult.latencyMs > 10) throw new Error(`SLA breach: latency was ${verifyResult.latencyMs} ms`);
  console.log(`✓ Pass 3: Offline verification passed in ${verifyResult.latencyMs.toFixed(3)} ms (Target < 10 ms SLA)`);

  // Test 4: QR Decoding
  const qrResult = Ed25519PassEngine.verifyQrPayload(signed.qrPayload, 'M1');
  if (!qrResult.isValid) throw new Error(`QR Verification failed: ${qrResult.reason}`);
  console.log('✓ Pass 4: QR decoding and signature verification passed');

  // Test 5: Rejection of forged signature
  const forged = { ...signed, signatureBase64: Buffer.alloc(64).toString('base64') };
  const forgedResult = Ed25519PassEngine.verifyPassOffline(forged, 'M1');
  if (forgedResult.isValid) throw new Error('Security flaw: Forged signature was accepted');
  console.log('✓ Pass 5: Forged signature successfully rejected');

  // Test 6: Rejection of tampered payload
  const tamperedPayload = signed.payloadJson.replace('"quantity":1', '"quantity":99');
  const tamperedPass = { ...signed, payloadJson: tamperedPayload };
  const tamperedResult = Ed25519PassEngine.verifyPassOffline(tamperedPass, 'M1');
  if (tamperedResult.isValid) throw new Error('Security flaw: Tampered payload was accepted');
  console.log('✓ Pass 6: Tampered payload successfully rejected');

  // Test 7: Rejection of expired pass
  const expiredPayload: OrderPassPayload = {
    ...payload,
    issuedAt: nowEpoch - 7200,
    expiresAt: nowEpoch - 10,
    nonce: 'expired-nonce-002',
  };
  const expiredSigned = Ed25519PassEngine.issueSignedPass(expiredPayload);
  const expiredResult = Ed25519PassEngine.verifyPassOffline(expiredSigned, 'M1', nowEpoch);
  if (expiredResult.isValid) throw new Error('Security flaw: Expired pass was accepted');
  console.log('✓ Pass 7: Expired pass successfully rejected');

  // Test 8: Rejection of station mismatch
  const wrongStationResult = Ed25519PassEngine.verifyPassOffline(signed, 'M4');
  if (wrongStationResult.isValid) throw new Error('Security flaw: Station mismatch was accepted');
  console.log('✓ Pass 8: Station boundary mismatch successfully rejected');

  // Test 9: 1,000-iteration High-Throughput SLA Benchmark (< 10ms SLA)
  const iterations = 1000;
  let totalLatency = 0;
  let maxLatency = 0;
  for (let i = 0; i < iterations; i++) {
    const benchResult = Ed25519PassEngine.verifyPassOffline(signed, 'M1');
    totalLatency += benchResult.latencyMs;
    if (benchResult.latencyMs > maxLatency) maxLatency = benchResult.latencyMs;
  }
  const avgLatency = totalLatency / iterations;
  if (avgLatency >= 10.0) throw new Error(`SLA failure: Average latency ${avgLatency} ms exceeds 10 ms SLA`);
  if (maxLatency >= 10.0) throw new Error(`SLA failure: Peak latency ${maxLatency} ms exceeds 10 ms SLA`);
  console.log(`✓ Pass 9: 1,000 offline verification SLA benchmark completed (Avg: ${avgLatency.toFixed(4)} ms, Peak: ${maxLatency.toFixed(4)} ms, SLA Target: < 10.0 ms)`);

  console.log('--- ALL CRYPTO SUITE TESTS PASSED ---\n');
}

testCrypto().catch((err) => {
  console.error(err);
  process.exit(1);
});
