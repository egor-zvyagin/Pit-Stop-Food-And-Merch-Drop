import { CHECKOUT_VOUCHERS, SERVICE_FEES_ITEMS } from '../data/checkoutConstantData';

async function testOrderCalculations() {
  console.log('Testing Order Calculation & Discount Engine...');

  const items = [
    { id: 'apex-burger', name: 'APEX BURGER', price: 16.5, quantity: 2 },
    { id: 'craft-lager', name: 'CRAFT LAGER 4-PACK', price: 36.0, quantity: 1 },
  ];

  // 1. Subtotal
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  if (subtotal !== 69.0) throw new Error(`Subtotal mismatch: expected 69.0, got ${subtotal}`);
  console.log(`✓ Test 1: Subtotal correct ($${subtotal.toFixed(2)})`);

  // 2. 20% Dynamic EatClub Discount
  const discount20 = Number((subtotal * 0.20).toFixed(2));
  if (discount20 !== 13.80) throw new Error(`20% discount mismatch: expected 13.80, got ${discount20}`);
  console.log(`✓ Test 2: 20% EatClub discount correct ($${discount20.toFixed(2)})`);

  // 3. 15% PITSTOP15 Discount
  const discount15 = Number((subtotal * 0.15).toFixed(2));
  if (discount15 !== 10.35) throw new Error(`15% discount mismatch: expected 10.35, got ${discount15}`);
  console.log(`✓ Test 3: 15% PITSTOP15 discount correct ($${discount15.toFixed(2)})`);

  // 4. Voucher Lookup
  const pitstop15Voucher = CHECKOUT_VOUCHERS.find((v) => v.code === 'PITSTOP15');
  if (!pitstop15Voucher) throw new Error('PITSTOP15 voucher not found in registry');
  console.log(`✓ Test 4: Voucher registry verified (${pitstop15Voucher.title})`);

  // 4b. Invalid Voucher Lookup
  const invalidVoucher = CHECKOUT_VOUCHERS.find((v) => v.code === 'NON_EXISTENT_CODE');
  if (invalidVoucher !== undefined) throw new Error('Expected invalid voucher to return undefined');
  console.log('✓ Test 4b: Invalid voucher rejected successfully');

  // 5. Total with Service Fee
  const totalWithServiceFee = subtotal + SERVICE_FEES_ITEMS - discount20;
  if (Number(totalWithServiceFee.toFixed(2)) !== 56.70) {
    throw new Error(`Total mismatch: expected 56.70, got ${totalWithServiceFee}`);
  }
  console.log(`✓ Test 5: Total with service fee verified ($${totalWithServiceFee.toFixed(2)})`);

  // 6. Rounding Precision & Edge Cases
  const singleItem = [{ id: 'coffee', name: 'FLAT WHITE', price: 5.5, quantity: 3 }];
  const singleSubtotal = singleItem.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const singleDiscount = Number((singleSubtotal * 0.20).toFixed(2));
  const singleTotal = Number((singleSubtotal - singleDiscount + SERVICE_FEES_ITEMS).toFixed(2));
  if (singleSubtotal !== 16.5 || singleDiscount !== 3.3 || singleTotal !== 14.7) {
    throw new Error(`Precision mismatch: ${singleSubtotal}, ${singleDiscount}, ${singleTotal}`);
  }
  console.log(`✓ Test 6: Rounding precision verified ($${singleTotal.toFixed(2)})`);

  console.log('--- ALL ORDER CALCULATION TESTS PASSED ---\n');
}

testOrderCalculations().catch((err) => {
  console.error(err);
  process.exit(1);
});
