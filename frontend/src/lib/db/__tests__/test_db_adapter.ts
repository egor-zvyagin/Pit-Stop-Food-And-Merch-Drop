import { db } from '../client';

async function runTest() {
  console.log('Testing Database Adapter (In-Memory / DynamoDB Fallback)...');

  // 1. Get Items
  const items = await db.getItems();
  console.log(`✓ Fetched ${items.length} items from database.`);
  if (items.length === 0) throw new Error('No items returned');

  // 2. Create Order
  const newOrder = await db.createOrder({
    orderId: 'GP-9999',
    pinCode: '9999',
    customerId: 'TICKET-GP-3820-X',
    ticketCode: 'GP-3820-X',
    isGroupOrder: false,
    items: [{ itemId: 'apex-burger', name: 'APEX BURGER', quantity: 2, unitPrice: 16.5 }],
    subtotal: 33.0,
    discountAmount: 6.6,
    discountRate: '20% OFF (EatClub Dynamic)',
    total: 26.4,
    loyaltyPointsEarned: 53,
    pickupStationId: 'M2',
    pickupStationName: 'Pit Stop M2 (Turn 9 East)',
    counterNumber: '#04',
    walkTimeMins: 2,
    qrPayload: 'AGPC1.TEST.PAYLOAD.SIG',
    signatureBase64: 'TEST_SIG',
    status: 'RECEIVED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  console.log(`✓ Created order: ${newOrder.orderId}`);

  // 3. Lookup Order by ID
  const fetched = await db.getOrderById('GP-9999');
  if (!fetched || fetched.total !== 26.4) throw new Error('Order lookup failed');
  console.log('✓ Retrieved order by ID:', fetched.orderId);

  // 4. Lookup Order by PIN
  const byPin = await db.getOrderByPin('9999');
  if (!byPin) throw new Error('Order lookup by PIN failed');
  console.log('✓ Retrieved order by PIN:', byPin.orderId);

  // 5. Update Status
  const updated = await db.updateOrderStatus('GP-9999', 'READY_FOR_PICKUP');
  if (!updated || updated.status !== 'READY_FOR_PICKUP') throw new Error('Status update failed');
  console.log('✓ Updated order status to:', updated.status);

  console.log('All DB adapter tests passed successfully!');
}

runTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
