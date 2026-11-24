import { safeEqual, validateVendorAuth } from './vendorAuth';

/**
 * Who is asking about an order.
 * - vendor: sent the staff PIN (X-Vendor-Pin)
 * - owner:  sent this order's own collection PIN (X-Order-Pin)
 * - public: anyone else, for example someone holding a shared tracker link
 *
 * An order ID is not a secret (it is in every shared tracker link), so the ID
 * alone must never unlock the collection PIN or the signed QR pass.
 */
export type OrderAccess = 'vendor' | 'owner' | 'public';

/** Fields of an order record that prove ownership and so must stay private. */
export const ORDER_SECRET_FIELDS = ['pinCode', 'qrPayload', 'signatureBase64'] as const;

export function isVendorRequest(request: Request): boolean {
  return validateVendorAuth(request).authenticated;
}

export function orderPinFromRequest(request: Request, bodyPin?: string | null): string {
  return (request.headers.get('x-order-pin') || bodyPin || '').trim();
}

export function resolveOrderAccess(
  request: Request,
  order: { pinCode?: string },
  bodyPin?: string | null
): OrderAccess {
  if (isVendorRequest(request)) {
    return 'vendor';
  }
  const suppliedPin = orderPinFromRequest(request, bodyPin);
  if (suppliedPin && order.pinCode && safeEqual(suppliedPin, String(order.pinCode))) {
    return 'owner';
  }
  return 'public';
}

/** Copy of an order record without the fields that prove ownership. */
export function withoutOrderSecrets<T extends object>(order: T): Omit<T, (typeof ORDER_SECRET_FIELDS)[number]> {
  const copy = { ...order } as Record<string, unknown>;
  for (const field of ORDER_SECRET_FIELDS) {
    delete copy[field];
  }
  return copy as Omit<T, (typeof ORDER_SECRET_FIELDS)[number]>;
}
