import { db } from '../lib/db/client';
import { CATALOG_ITEMS } from '../data/catalog';
import { StationRecord, TicketProfile } from '../lib/types';
import { Ed25519PassEngine, OrderPassPayload } from '../lib/crypto/passEngine';

async function seedDatabase() {
  console.log('====================================================');
  console.log('AGPC "Pit Stop" Platform: Albert Park Circuit Seeder');
  console.log('Target Environment: DynamoDB (or local memory store)');
  console.log('====================================================\n');

  console.log(
    `Storage Engine: ${
      db.isUsingDynamoDB
        ? 'AWS DynamoDB (ap-southeast-2)'
        : 'Local In-Memory / Local Storage'
    }`
  );

  // 1. Seed Concession Items (Canonical 9 items)
  console.log(`\n[1] Seeding ${CATALOG_ITEMS.length} canonical concession items with photographic assets...`);
  for (const item of CATALOG_ITEMS) {
    await db.saveItem(item);
    console.log(
      `    - [${item.category.toUpperCase()}] ${item.name} ($${item.price.toFixed(
        2
      )}) - ${item.prepTime} [Stock: ${item.availableUnits}]`
    );
  }

  // 2. Seed 4 Pod Stations
  const stations: StationRecord[] = [
    {
      id: 'M1',
      name: 'PIT STOP M1',
      location: 'Main Lawn Village, Gate 1',
      distance: 'Grandstand A · 1 min walk',
      walkTimeMins: 1,
      queueTimeMins: 3,
      status: 'LOW QUEUE',
      capacityPercent: 40,
      coordinates: { lat: -37.847, lng: 144.969 },
    },
    {
      id: 'M2',
      name: 'PIT STOP M2',
      location: 'Behind Clark Grandstand, Gate 3',
      distance: 'Grandstand A · 2 min walk',
      walkTimeMins: 2,
      queueTimeMins: 2,
      status: 'FASTEST',
      capacityPercent: 25,
      coordinates: { lat: -37.841, lng: 144.966 },
    },
    {
      id: 'M3',
      name: 'PIT STOP M3',
      location: 'Behind Brabham Stand, Gate 2',
      distance: 'Grandstand A · 5 min walk',
      walkTimeMins: 5,
      queueTimeMins: 12,
      status: 'HEAVY TRAFFIC',
      capacityPercent: 85,
      coordinates: { lat: -37.847, lng: 144.975 },
    },
    {
      id: 'M4',
      name: 'PIT STOP M4',
      location: 'Turn 16 Hairpin Concourse, Gate 8',
      distance: 'Grandstand A · 20 min walk',
      walkTimeMins: 20,
      queueTimeMins: 15,
      status: 'HEAVY TRAFFIC',
      capacityPercent: 80,
      coordinates: { lat: -37.856, lng: 144.979 },
    },
  ];

  console.log(`\n[2] Seeding ${stations.length} Trackside Concession Pods across Albert Park...`);
  for (const pod of stations) {
    await db.saveStation(pod);
    console.log(`    - Pod ${pod.id}: ${pod.name} (${pod.distance}, Queue: ${pod.status})`);
  }

  // 3. Seed Demo Grand Prix Fan Tickets (GP-3820-X & GP-9014-P)
  console.log('\n[3] Seeding Grand Prix Tickets & Fan Profiles...');
  const tickets: TicketProfile[] = [
    {
      ticketCode: 'GP-3820-X',
      verified: true,
      holderName: 'Egor Zvyagin',
      ticketType: '4-Day Grandstand Pass',
      viewingArea: {
        grandstand: 'Clark Grandstand',
        turn: 'Turn 9',
        seat: 'Row H, Seat 14',
        nearestGate: 'Gate 3 (Canterbury Rd)',
        recommendedDropStation: 'M2',
      },
      loyaltyTier: 'VIP Fan',
      loyaltyPoints: 1850,
    },
    {
      ticketCode: 'GP-9014-P',
      verified: true,
      holderName: 'Grand Prix Fan',
      ticketType: '3-Day General Admission',
      viewingArea: {
        grandstand: 'Brabham Grandstand',
        turn: 'Turn 1 & 2',
        seat: 'Unreserved Lawn',
        nearestGate: 'Gate 1',
        recommendedDropStation: 'M3',
      },
      loyaltyTier: 'Race Fan',
      loyaltyPoints: 650,
    },
  ];

  for (const ticket of tickets) {
    await db.saveTicket(ticket);
    console.log(
      `    - Verified Ticket: ${ticket.ticketCode} (${ticket.holderName}) - Tier: ${ticket.loyaltyTier} (${ticket.loyaltyPoints} pts)`
    );
  }

  // 4. Seed a Realistic Sample Order with Ed25519 Cryptographic Pass
  console.log('\n[4] Generating Pre-Seeded Demonstration Order with Cryptographic Ed25519 Pass...');
  const currentEpoch = Math.floor(Date.now() / 1000);
  const sampleOrderId = 'GP-2026-X9K2P4';
  const samplePin = '8821';

  const samplePassPayload: OrderPassPayload = {
    orderId: sampleOrderId,
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
  const ttl = currentEpoch + 7 * 86400; // 7 days in epoch seconds

  await db.createOrder({
    orderId: sampleOrderId,
    pinCode: samplePin,
    customerId: samplePassPayload.customerId,
    ticketCode: 'GP-3820-X',
    isGroupOrder: false,
    items: [
      { itemId: 'apex-burger', name: 'APEX BURGER', quantity: 1, unitPrice: 16.5 },
      { itemId: 'craft-lager', name: 'CRAFT LAGER 4-PACK', quantity: 1, unitPrice: 36.0 },
    ],
    subtotal: 52.5,
    discountAmount: 5.25,
    discountRate: '10% OFF (Green Flag Dynamic Yield)',
    serviceFee: 1.18,
    total: 48.43,
    loyaltyPointsEarned: 97,
    pickupStationId: 'M2',
    pickupStationName: 'Pit Stop M2 (Turn 9 East)',
    counterNumber: '#04',
    walkTimeMins: 2,
    qrPayload: signedPass.qrPayload,
    signatureBase64: signedPass.signatureBase64,
    status: 'READY_FOR_PICKUP',
    paymentStatus: 'PAID',
    ttl,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  console.log(`    ✓ Order ${sampleOrderId} pre-seeded in READY_FOR_PICKUP state (Locker #04, PIN: ${samplePin})`);
  console.log(`    ✓ Cryptographic QR Signature: ${signedPass.signatureBase64.substring(0, 24)}...`);
  console.log(`    ✓ DynamoDB TTL set to 7 days: ${ttl}`);

  console.log('\n====================================================');
  console.log('✓ Circuit Database Seeding Complete & Ready for Demo!');
  console.log('====================================================');
}

seedDatabase().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
