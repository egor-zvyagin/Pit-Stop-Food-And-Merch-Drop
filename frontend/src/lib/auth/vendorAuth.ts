/**
 * Vendor Terminal Authentication Middleware / Helper
 * Validates 'X-Vendor-Pin' against VENDOR_ACCESS_PIN (default: '2026').
 */

export interface VendorAuthResult {
  authenticated: boolean;
  error?: string;
}

export function validateVendorAuth(request: Request | { headers: Headers }): VendorAuthResult {
  const headers = 'headers' in request ? request.headers : (request as Request).headers;
  const pinHeader = headers.get('x-vendor-pin') || headers.get('X-Vendor-Pin');
  const expectedPin = process.env.VENDOR_ACCESS_PIN || '2026';

  if (!pinHeader) {
    return {
      authenticated: false,
      error: 'Missing X-Vendor-Pin header',
    };
  }

  if (pinHeader.trim() !== expectedPin.trim()) {
    return {
      authenticated: false,
      error: 'Invalid vendor access PIN',
    };
  }

  return {
    authenticated: true,
  };
}
