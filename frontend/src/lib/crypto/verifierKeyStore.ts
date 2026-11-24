/**
 * Loads the server's Ed25519 public key into the offline verifier.
 *
 * A kiosk fetches the key from /api/crypto/public-key while it has a
 * connection and keeps a copy in localStorage, so passes can still be
 * verified after the network drops. There is no key baked into the code.
 */

import {
  hasVerificationPublicKey,
  normalizePublicKey,
  setVerificationPublicKey,
} from './passVerifier';

export const VERIFICATION_KEY_STORAGE_KEY = 'pitstop_verification_public_key_v1';
const PUBLIC_KEY_ENDPOINT = '/api/crypto/public-key';

export type VerificationKeySource = 'network' | 'cache' | 'environment' | 'missing';

function getStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Makes sure the verifier has a public key and reports where it came from.
 * The network copy wins when reachable, so a rotated key is picked up the
 * next time the kiosk is online. Never throws.
 */
export async function ensureVerificationPublicKey(
  fetchImpl: typeof fetch = fetch
): Promise<VerificationKeySource> {
  const storage = getStorage();

  try {
    const res = await fetchImpl(PUBLIC_KEY_ENDPOINT, { cache: 'no-store' });
    if (res.ok) {
      const body: { publicKeyBase64?: unknown } = await res.json();
      if (typeof body.publicKeyBase64 === 'string') {
        normalizePublicKey(body.publicKeyBase64); // throws on a malformed key
        setVerificationPublicKey(body.publicKeyBase64);
        try {
          storage?.setItem(VERIFICATION_KEY_STORAGE_KEY, body.publicKeyBase64);
        } catch {
          // Storage full or blocked: the key still works for this session.
        }
        return 'network';
      }
    }
  } catch {
    // Offline or server error: fall through to the cached copy.
  }

  try {
    const cached = storage?.getItem(VERIFICATION_KEY_STORAGE_KEY);
    if (cached) {
      setVerificationPublicKey(cached);
      return 'cache';
    }
  } catch {
    // Corrupt cache entry: treat as absent.
  }

  return hasVerificationPublicKey() ? 'environment' : 'missing';
}
