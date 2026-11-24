/**
 * Staff PIN shared by the Playwright web server and the specs. It only ever
 * exists on the throwaway local test server. Set VENDOR_ACCESS_PIN to run the
 * suite against a server you started yourself.
 */
export const E2E_VENDOR_PIN = process.env.VENDOR_ACCESS_PIN || '7314';
