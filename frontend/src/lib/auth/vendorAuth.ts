import { timingSafeEqual } from 'crypto';

/**
 * Vendor Terminal Authentication Helper
 * Validates the 'X-Vendor-Pin' header against the VENDOR_ACCESS_PIN
 * environment variable.
 *
 * There is no default PIN. If VENDOR_ACCESS_PIN is not set, every vendor
 * request is refused: an unconfigured server must fail closed, not open.
 */

export interface VendorAuthResult {
  authenticated: boolean;
  error?: string;
  /** True when the server itself has no PIN configured. */
  misconfigured?: boolean;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf-8');
  const right = Buffer.from(b, 'utf-8');
  // timingSafeEqual needs equal lengths; comparing against itself keeps the
  // work constant before returning false.
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

export function validateVendorAuth(request: Request | { headers: Headers }): VendorAuthResult {
  const expectedPin = (process.env.VENDOR_ACCESS_PIN || '').trim();

  if (!expectedPin) {
    console.error('[vendor-auth] VENDOR_ACCESS_PIN is not set; refusing all vendor requests.');
    return {
      authenticated: false,
      misconfigured: true,
      error: 'Vendor access is not configured on this server',
    };
  }

  const pinHeader = request.headers.get('x-vendor-pin');

  if (!pinHeader) {
    return {
      authenticated: false,
      error: 'Missing X-Vendor-Pin header',
    };
  }

  if (!safeEqual(pinHeader.trim(), expectedPin)) {
    return {
      authenticated: false,
      error: 'Invalid vendor access PIN',
    };
  }

  return {
    authenticated: true,
  };
}
