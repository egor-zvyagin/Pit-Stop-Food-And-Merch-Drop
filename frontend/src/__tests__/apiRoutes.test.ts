import { POST as createOrderRoute, GET as getOrdersRoute } from '../app/api/orders/route';
import { GET as getOrderStatusRoute, PATCH as patchOrderStatusRoute } from '../app/api/orders/[id]/status/route';
import { GET as getInventoryRoute } from '../app/api/inventory/route';
import { GET as getStationsRoute } from '../app/api/stations/capacity/route';
import { POST as verifyTicketRoute } from '../app/api/auth/verify-ticket/route';
import { POST as checkoutPaymentRoute } from '../app/api/payment/checkout/route';

async function runApiTests() {
  console.log('--- RUNNING FULL API ROUTE INTEGRATION TESTS ---');

  // 1. Inventory Route
  const invRes = await getInventoryRoute();
  const invData = await invRes.json();
  if (!invData.success || invData.count === 0) throw new Error('Inventory route test failed');
  console.log(`✓ GET /api/inventory: Success (${invData.count} items returned)`);

  // 2. Stations Capacity Route (All stations)
  const reqStations = new Request('http://localhost:3000/api/stations/capacity');
  const stationsRes = await getStationsRoute(reqStations);
  const stationsData = await stationsRes.json();
  if (!stationsData.success || stationsData.totalStations === 0) throw new Error('Stations route test failed');
  console.log(`✓ GET /api/stations/capacity: Success (${stationsData.totalStations} pods active)`);

  // 2b. Stations Capacity Route with Filter & 404
  const reqStationFilter = new Request('http://localhost:3000/api/stations/capacity?stationId=M2');
  const stationFilterRes = await getStationsRoute(reqStationFilter);
  const stationFilterData = await stationFilterRes.json();
  if (!stationFilterData.success || stationFilterData.station.id !== 'M2') throw new Error('Station filter failed');
  console.log(`✓ GET /api/stations/capacity?stationId=M2: Success (${stationFilterData.station.name})`);

  const reqStation404 = new Request('http://localhost:3000/api/stations/capacity?stationId=INVALID-POD');
  const station404Res = await getStationsRoute(reqStation404);
  if (station404Res.status !== 404) throw new Error('Station 404 error handling failed');
  console.log('✓ GET /api/stations/capacity (invalid ID): Handled with 404');

  // 3. Ticket Verification Route
  const reqTicket = new Request('http://localhost:3000/api/auth/verify-ticket', {
    method: 'POST',
    body: JSON.stringify({ ticketCode: 'GP-3820-X' }),
  });
  const ticketRes = await verifyTicketRoute(reqTicket);
  const ticketData = await ticketRes.json();
  if (!ticketData.success || !ticketData.data.verified) throw new Error('Ticket verification test failed');
  console.log(`✓ POST /api/auth/verify-ticket: Success (Verified ${ticketData.data.holderName})`);

  // 3b. Ticket Verification Error Handling (404 and 400)
  const reqInvalidTicket = new Request('http://localhost:3000/api/auth/verify-ticket', {
    method: 'POST',
    body: JSON.stringify({ ticketCode: 'INVALID-CODE-99' }),
  });
  const invalidTicketRes = await verifyTicketRoute(reqInvalidTicket);
  if (invalidTicketRes.status !== 404) throw new Error('Ticket 404 error handling failed');
  console.log('✓ POST /api/auth/verify-ticket (invalid code): Handled with 404');

  const reqEmptyTicket = new Request('http://localhost:3000/api/auth/verify-ticket', {
    method: 'POST',
    body: JSON.stringify({ ticketCode: '' }),
  });
  const emptyTicketRes = await verifyTicketRoute(reqEmptyTicket);
  if (emptyTicketRes.status !== 400) throw new Error('Ticket 400 error handling failed');
  console.log('✓ POST /api/auth/verify-ticket (empty code): Handled with 400');

  // 4. Create Order Route (with real Ed25519 pass issuance)
  const reqOrder = new Request('http://localhost:3000/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      items: [
        { itemId: 'apex-burger', name: 'APEX BURGER', quantity: 2, unitPrice: 16.5 },
        { itemId: 'craft-lager', name: 'CRAFT LAGER 4-PACK', quantity: 1, unitPrice: 36.0 },
      ],
      stationId: 'M2',
      ticketCode: 'GP-3820-X',
      promoCode: 'PITSTOP15',
    }),
  });
  const orderRes = await createOrderRoute(reqOrder);
  const orderData = await orderRes.json();
  if (!orderData.success || !orderData.order.qrPayload.startsWith('AGPC1.')) {
    throw new Error('Order creation or cryptographic signing test failed');
  }
  const createdOrderId = orderData.order.orderId;
  console.log(`✓ POST /api/orders: Success (Created ${createdOrderId}, total $${orderData.order.total}, Ed25519 QR issued)`);

  // 4b. Create Order Validation (empty items -> 400)
  const reqEmptyOrder = new Request('http://localhost:3000/api/orders', {
    method: 'POST',
    body: JSON.stringify({ items: [] }),
  });
  const emptyOrderRes = await createOrderRoute(reqEmptyOrder);
  if (emptyOrderRes.status !== 400) throw new Error('Empty order 400 error handling failed');
  console.log('✓ POST /api/orders (empty items): Handled with 400');

  // 5. Order Status Route (GET)
  const statusRes = await getOrderStatusRoute(new Request(`http://localhost:3000/api/orders/${createdOrderId}/status`), {
    params: { id: createdOrderId },
  });
  const statusData = await statusRes.json();
  if (!statusData.success || statusData.data.status !== 'RECEIVED') {
    throw new Error('Order status lookup test failed');
  }
  console.log(`✓ GET /api/orders/${createdOrderId}/status: Success (Current status: ${statusData.data.status})`);

  // 5b. Order Status Route 404
  const status404Res = await getOrderStatusRoute(new Request('http://localhost:3000/api/orders/NON-EXISTENT-ID/status'), {
    params: { id: 'NON-EXISTENT-ID' },
  });
  if (status404Res.status !== 404) throw new Error('Order status 404 error handling failed');
  console.log('✓ GET /api/orders/NON-EXISTENT-ID/status: Handled with 404');

  // 6. Order Status Update Route (PATCH)
  const patchReq = new Request(`http://localhost:3000/api/orders/${createdOrderId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'READY_FOR_PICKUP' }),
  });
  const patchRes = await patchOrderStatusRoute(patchReq, { params: { id: createdOrderId } });
  const patchData = await patchRes.json();
  if (!patchData.success || patchData.order.status !== 'READY_FOR_PICKUP') {
    throw new Error('Order status update test failed');
  }
  console.log(`✓ PATCH /api/orders/${createdOrderId}/status: Success (Updated to ${patchData.order.status})`);

  // 6b. Order Status Update 404 and 400
  const patch404Req = new Request('http://localhost:3000/api/orders/NON-EXISTENT-ID/status', {
    method: 'PATCH',
    body: JSON.stringify({ status: 'COLLECTED' }),
  });
  const patch404Res = await patchOrderStatusRoute(patch404Req, { params: { id: 'NON-EXISTENT-ID' } });
  if (patch404Res.status !== 404) throw new Error('Order status update 404 error handling failed');
  console.log('✓ PATCH /api/orders/NON-EXISTENT-ID/status: Handled with 404');

  // 7. Payment Checkout Route
  const payReq = new Request('http://localhost:3000/api/payment/checkout', {
    method: 'POST',
    body: JSON.stringify({
      orderId: createdOrderId,
      paymentMethod: 'apple_pay',
      amount: orderData.order.total,
    }),
  });
  const payRes = await checkoutPaymentRoute(payReq);
  const payData = await payRes.json();
  if (!payData.success || payData.data.status !== 'PAID') {
    throw new Error('Payment checkout test failed');
  }
  console.log(`✓ POST /api/payment/checkout: Success (${payData.data.transactionId} authorized)`);

  // 7b. Payment Checkout Validation (missing fields -> 400)
  const payInvalidReq = new Request('http://localhost:3000/api/payment/checkout', {
    method: 'POST',
    body: JSON.stringify({ orderId: '' }),
  });
  const payInvalidRes = await checkoutPaymentRoute(payInvalidReq);
  if (payInvalidRes.status !== 400) throw new Error('Payment 400 error handling failed');
  console.log('✓ POST /api/payment/checkout (missing amount/orderId): Handled with 400');

  // 8. Get All Orders
  const allOrdersRes = await getOrdersRoute();
  const allOrdersData = await allOrdersRes.json();
  if (!allOrdersData.success || allOrdersData.count === 0) {
    throw new Error('Get all orders test failed');
  }
  console.log(`✓ GET /api/orders: Success (${allOrdersData.count} total orders in database)`);

  console.log('--- ALL API ROUTE INTEGRATION TESTS PASSED CLEANLY ---');
}

runApiTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
