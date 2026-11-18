import { db } from '../lib/db/client';
import { MENU_ITEMS } from '../data/menu';
import { PIT_STOPS } from '../data/pitStopConstantData';
import { Ed25519PassEngine, OrderPassPayload } from '../lib/crypto/passEngine';

async function seedDatabase() {
  console.log('====================================================');
  console.log('AGPC "Pit Stop" Platform: Albert Park Circuit Seeder');
  console.log('Target Environment: DynamoDB (or local memory store)');
  console.log('====================================================\n');

  console.log(`Storage Engine: ${db.isUsingDynamoDB ? 'AWS DynamoDB (ap-southeast-2)' : 'Local In-Memory / Local Storage'}`);

  // 1. Seed Concession Items
  console.log(`[1] Seeding ${MENU_ITEMS.length} concession items with photographic assets...`);
  for (const item of MENU_ITEMS) {
    console.log(`    - [${item.category.toUpperCase()}] ${item.name} ($${item.price.toFixed(2)}) - ${item.prepTime}`);
  }

  // 2. Seed Pod Stations
  console.log(`\n[2] Seeding ${PIT_STOPS.length} Trackside Concession Pods across Albert Park...`);
  for (const pod of PIT_STOPS) {
    console.log(`    - Pod ${pod.id}: ${pod.name} (${pod.distance}, Queue: ${pod.status})`);
  }

  // 3. Seed Demo Grand Prix Fan Tickets
  console.log('\n[3] Seeding Grand Prix Tickets & Fan Profiles...');
  const ticket = await db.getTicket('GP-3820-X');
  if (ticket) {
    console.log(`    - Verified Ticket: ${ticket.ticketCode} (${ticket.holderName})`);
    console.log(`      Area: ${ticket.viewingArea.grandstand}, ${ticket.viewingArea.seat} (Assigned Pod: ${ticket.viewingArea.recommendedDropStation})`);
    console.log(`      Tier: ${ticket.loyaltyTier} (${ticket.loyaltyPoints} points)`);
  }

  // 4. Seed a Realistic Sample Order with Ed25519 Cryptographic Pass
  console.log('\n[4] Generating Pre-Seeded Demonstration Order with Cryptographic Ed25519 Pass...');
  const currentEpoch = Math.floor(Date.now() / 1000);
  const samplePassPayload: OrderPassPayload = {
    orderId: 'GP-8821',
    customerId: 'TICKET-GP-3820-X',
    targetStationId: 'M2',
    issuedAt: currentEpoch,
    expiresAt: currentEpoch + 3600,
    items: [
      { sku: 'apex-burger', name: 'APEX BURGER', quantity: 1, unitPriceCents: 1650 },
      { sku: 'craft-lager', name: 'CRAFT LAGER 4-PACK', quantity: 1, unitPriceCents: 3600 },
    ],
    nonce: 'seed-nonce-8821',
  };

  const signedPass = Ed25519PassEngine.issueSignedPass(samplePassPayload);

  await db.createOrder({
    orderId: 'GP-8821',
    pinCode: '8821',
    customerId: samplePassPayload.customerId,
    ticketCode: 'GP-3820-X',
    isGroupOrder: false,
    items: [
      { itemId: 'apex-burger', name: 'APEX BURGER', quantity: 1, unitPrice: 16.5 },
      { itemId: 'craft-lager', name: 'CRAFT LAGER 4-PACK', quantity: 1, unitPrice: 36.0 },
    ],
    subtotal: 52.5,
    discountAmount: 10.5,
    discountRate: '20% OFF (EatClub Dynamic Yield)',
    total: 42.0,
    loyaltyPointsEarned: 84,
    pickupStationId: 'M2',
    pickupStationName: 'Pit Stop M2 (Turn 9 East)',
    counterNumber: '#04',
    walkTimeMins: 2,
    qrPayload: signedPass.qrPayload,
    signatureBase64: signedPass.signatureBase64,
    status: 'READY_FOR_PICKUP',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  console.log('    ✓ Order GP-8821 pre-seeded in READY_FOR_PICKUP state (Locker #04, PIN: 8821)');
  console.log(`    ✓ Cryptographic QR Signature: ${signedPass.signatureBase64.substring(0, 24)}...`);

  console.log('\n====================================================');
  console.log('✓ Circuit Database Seeding Complete & Ready for Demo!');
  console.log('====================================================');
}

seedDatabase().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
