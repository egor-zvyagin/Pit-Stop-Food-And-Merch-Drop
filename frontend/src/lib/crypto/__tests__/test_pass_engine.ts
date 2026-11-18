import { Ed25519PassEngine, OrderPassPayload } from '../passEngine';

async function runTest() {
  console.log('Testing Ed25519 Pass Engine...');

  const samplePayload: OrderPassPayload = {
    orderId: 'GP-4819',
    customerId: 'TICKET-GP-3820-X',
    targetStationId: 'M2',
    issuedAt: Math.floor(Date.now() / 1000),
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    items: [
      { sku: 'apex-burger', name: 'APEX BURGER', quantity: 1, unitPriceCents: 1650 },
      { sku: 'craft-lager', name: 'CRAFT LAGER 4-PACK', quantity: 1, unitPriceCents: 3600 },
    ],
    nonce: 'a1b2c3d4e5f6',
  };

  // 1. Sign Pass
  const signed = Ed25519PassEngine.issueSignedPass(samplePayload);
  console.log('✓ Pass signed successfully. QR Payload length:', signed.qrPayload.length);

  // 2. Verify Pass Offline
  const res = Ed25519PassEngine.verifyPassOffline(signed, 'M2');
  if (!res.isValid) {
    throw new Error(`Failed to verify valid pass: ${res.reason}`);
  }
  console.log(`✓ Valid pass verified in ${res.latencyMs.toFixed(3)} ms`);

  // 3. Verify via QR string
  const qrRes = Ed25519PassEngine.verifyQrPayload(signed.qrPayload, 'M2');
  if (!qrRes.isValid) {
    throw new Error(`Failed to verify QR string: ${qrRes.reason}`);
  }
  console.log(`✓ QR string decoded and verified in ${qrRes.latencyMs.toFixed(3)} ms`);

  // 4. Test Tamper Resistance
  const tampered = { ...signed, payloadJson: signed.payloadJson.replace('1650', '0') };
  const tamperRes = Ed25519PassEngine.verifyPassOffline(tampered, 'M2');
  if (tamperRes.isValid) {
    throw new Error('Security failure: Tampered payload was accepted!');
  }
  console.log('✓ Tamper detection passed (forgery rejected).');

  console.log('All Ed25519 Pass Engine tests passed successfully!');
}

runTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
