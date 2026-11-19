import { db, InsufficientStockError } from '../client';

async function runTest() {
  console.log('Testing Pit Stop v3 Database Adapter...');

  // 1. Get Items & Stock
  const items = await db.getItems();
  console.log(`✓ Fetched ${items.length} items from database.`);
  if (items.length === 0) throw new Error('No items returned');

  // 2. Circuit State Engine
  const defaultCircuit = await db.getCircuitState();
  console.log(`✓ Default Circuit Flag: ${defaultCircuit.flag} (${defaultCircuit.message})`);
  if (defaultCircuit.flag !== 'GREEN_FLAG') throw new Error('Expected GREEN_FLAG');

  const safetyCarState = await db.setCircuitState('SAFETY_CAR', 'test-runner');
  console.log(`✓ Updated Circuit Flag: ${safetyCarState.flag} (Discount: ${safetyCarState.offPeakDiscountPct}%)`);
  if (safetyCarState.flag !== 'SAFETY_CAR' || safetyCarState.offPeakDiscountPct !== 0) {
    throw new Error('Circuit flag update failed');
  }

  // Restore GREEN_FLAG
  await db.setCircuitState('GREEN_FLAG', 'test-runner');

  // 3. Smart Locker Allocation
  const allocatedBay1 = await db.allocateLockerBay('M2');
  console.log(`✓ Allocated Locker Bay 1: ${allocatedBay1}`);
  if (!allocatedBay1.startsWith('#0')) throw new Error(`Invalid locker format: ${allocatedBay1}`);

  const lockerStatus = await db.getLockerBayStatus('M2');
  console.log(`✓ Fetched ${lockerStatus.length} locker bays for station M2.`);
  if (lockerStatus.length !== 8) throw new Error('Expected 8 locker bays');

  // 4. Atomic Order Creation & Insufficient Stock Check
  // Restock flash drop item to exactly 2
  await db.restockInventory('flash_drop', 'gp-cap-2026', 2);
  const capItem = await db.getItemById('gp-cap-2026');
  if (!capItem || capItem.stock !== 2) throw new Error('Restock failed');
  console.log(`✓ Restocked gp-cap-2026 to stock: ${capItem.stock}`);

  // Create order purchasing 2 caps (succeeds)
  const order1 = await db.createOrderAtomic(
    {
      orderId: 'GP-2026-ATOMIC1',
      pinCode: '1111',
      customerId: 'TICKET-GP-3820-X',
      ticketCode: 'GP-3820-X',
      isGroupOrder: false,
      items: [{ itemId: 'gp-cap-2026', name: '2026 OFFICIAL GP CAP', quantity: 2, unitPrice: 65.0 }],
      subtotal: 130.0,
      discountAmount: 0,
      discountRate: '0%',
      total: 133.25,
      loyaltyPointsEarned: 266,
      pickupStationId: 'M2',
      pickupStationName: 'Pit Stop M2',
      counterNumber: allocatedBay1,
      walkTimeMins: 2,
      qrPayload: 'AGPC1.TEST1',
      signatureBase64: 'SIG1',
      status: 'RECEIVED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    { 'gp-cap-2026': 2 }
  );
  console.log(`✓ Order 1 created atomically: ${order1.orderId}`);

  // Now stock should be 0. Trying to buy 1 more should throw InsufficientStockError
  let caughtError: InsufficientStockError | null = null;
  try {
    await db.createOrderAtomic(
      {
        orderId: 'GP-2026-ATOMIC2',
        pinCode: '2222',
        customerId: 'TICKET-GP-3820-X',
        ticketCode: 'GP-3820-X',
        isGroupOrder: false,
        items: [{ itemId: 'gp-cap-2026', name: '2026 OFFICIAL GP CAP', quantity: 1, unitPrice: 65.0 }],
        subtotal: 65.0,
        discountAmount: 0,
        discountRate: '0%',
        total: 66.63,
        loyaltyPointsEarned: 133,
        pickupStationId: 'M2',
        pickupStationName: 'Pit Stop M2',
        counterNumber: '#02',
        walkTimeMins: 2,
        qrPayload: 'AGPC1.TEST2',
        signatureBase64: 'SIG2',
        status: 'RECEIVED',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { 'gp-cap-2026': 1 }
    );
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      caughtError = err;
    }
  }

  if (!caughtError) {
    throw new Error('Expected InsufficientStockError but none was thrown!');
  }
  console.log(`✓ Correctly caught InsufficientStockError with availableStock:`, caughtError.availableStock);
  if (caughtError.availableStock['gp-cap-2026'] !== 0) {
    throw new Error(`Expected availableStock for gp-cap-2026 to be 0, got: ${caughtError.availableStock['gp-cap-2026']}`);
  }

  // 5. Fan Order History Query (GSI1)
  const fanOrders = await db.getOrdersByTicket('GP-3820-X');
  console.log(`✓ Fetched ${fanOrders.length} fan orders for ticket GP-3820-X.`);
  if (fanOrders.length === 0) throw new Error('Expected fan orders for GP-3820-X');

  // Restock items back to default for clean state
  await db.restockInventory('restock_all', undefined, 50);
  await db.restockInventory('flash_drop', 'gp-cap-2026', 4);
  await db.restockInventory('flash_drop', 'ferrari-tee', 6);
  console.log('✓ Restocked inventory back to canonical demo state.');

  console.log('\nAll Pit Stop v3 DB adapter tests passed with 100% precision!');
}

runTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
