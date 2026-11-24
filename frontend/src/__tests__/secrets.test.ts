import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'crypto';
import { TEST_VENDOR_PIN } from './testEnv';

/**
 * Secrets must fail closed: with no PIN or signing key configured the app
 * refuses to work rather than fall back to a value shipped in the source.
 */

const KEY_CACHE = globalThis as unknown as { __pitstopEd25519Keypair?: unknown };

function requestWithPin(pin?: string): Request {
  return new Request('http://localhost/api/orders', {
    headers: pin === undefined ? {} : { 'X-Vendor-Pin': pin },
  });
}

function freshKeypairBase64() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    priv: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
    pub: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  };
}

beforeEach(() => {
  vi.resetModules();
  delete KEY_CACHE.__pitstopEd25519Keypair;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  delete KEY_CACHE.__pitstopEd25519Keypair;
});

describe('vendor PIN', () => {
  it('accepts the configured PIN', async () => {
    const { validateVendorAuth } = await import('@/lib/auth/vendorAuth');
    expect(validateVendorAuth(requestWithPin(TEST_VENDOR_PIN)).authenticated).toBe(true);
  });

  it('rejects a wrong or missing PIN', async () => {
    const { validateVendorAuth } = await import('@/lib/auth/vendorAuth');
    expect(validateVendorAuth(requestWithPin('0000')).authenticated).toBe(false);
    expect(validateVendorAuth(requestWithPin(`${TEST_VENDOR_PIN}1`)).authenticated).toBe(false);
    expect(validateVendorAuth(requestWithPin()).authenticated).toBe(false);
  });

  it.each(['', '   '])('refuses every PIN when VENDOR_ACCESS_PIN is %j', async (configured) => {
    vi.stubEnv('VENDOR_ACCESS_PIN', configured);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { validateVendorAuth } = await import('@/lib/auth/vendorAuth');

    // Includes the PIN that older versions fell back to, and an empty header.
    for (const attempt of ['2026', TEST_VENDOR_PIN, '', undefined]) {
      const result = validateVendorAuth(requestWithPin(attempt));
      expect(result.authenticated).toBe(false);
      expect(result.misconfigured).toBe(true);
    }
  });
});

describe('pass signing key', () => {
  it('refuses to sign in production without a configured key', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ED25519_PRIVATE_KEY_BASE64', '');
    const { getKeypair } = await import('@/lib/crypto/passSigner');
    expect(() => getKeypair()).toThrow(/ED25519_PRIVATE_KEY_BASE64 is not set/);
  });

  it('generates a different throwaway key per process outside production', async () => {
    vi.stubEnv('ED25519_PRIVATE_KEY_BASE64', '');
    vi.stubEnv('ED25519_PUBLIC_KEY_BASE64', '');

    const first = (await import('@/lib/crypto/passSigner')).getPublicKeyBase64();
    vi.resetModules();
    delete KEY_CACHE.__pitstopEd25519Keypair;
    const second = (await import('@/lib/crypto/passSigner')).getPublicKeyBase64();

    expect(first).not.toEqual(second);
  });

  it('rejects a malformed private key instead of substituting another', async () => {
    vi.stubEnv('ED25519_PRIVATE_KEY_BASE64', Buffer.from('too-short').toString('base64'));
    const { getKeypair } = await import('@/lib/crypto/passSigner');
    expect(() => getKeypair()).toThrow(/unexpected length/);
  });

  it('rejects a public key that does not match the private key', async () => {
    vi.stubEnv('ED25519_PRIVATE_KEY_BASE64', freshKeypairBase64().priv);
    vi.stubEnv('ED25519_PUBLIC_KEY_BASE64', freshKeypairBase64().pub);
    const { getKeypair } = await import('@/lib/crypto/passSigner');
    expect(() => getKeypair()).toThrow(/does not match/);
  });
});

describe('pass verification key', () => {
  const samplePass = { payloadJson: '{}', signatureBase64: Buffer.alloc(64).toString('base64') };

  it('treats every pass as invalid when no key is loaded', async () => {
    vi.stubEnv('ED25519_PUBLIC_KEY_BASE64', '');
    vi.stubEnv('NEXT_PUBLIC_ED25519_PUBLIC_KEY', '');
    const verifier = await import('@/lib/crypto/passVerifier');

    expect(verifier.hasVerificationPublicKey()).toBe(false);
    const result = verifier.verifyPassOffline(samplePass);
    expect(result.isValid).toBe(false);
    expect(result.reason).toMatch(/Verification key not loaded/);
  });

  it('loads the key from the server, then from the cached copy when offline', async () => {
    vi.stubEnv('ED25519_PUBLIC_KEY_BASE64', '');
    vi.stubEnv('NEXT_PUBLIC_ED25519_PUBLIC_KEY', '');
    const { pub } = freshKeypairBase64();
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    });

    const online = (async () =>
      new Response(JSON.stringify({ publicKeyBase64: pub }), { status: 200 })) as unknown as typeof fetch;
    const offline = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const first = await import('@/lib/crypto/verifierKeyStore');
    expect(await first.ensureVerificationPublicKey(online)).toBe('network');
    expect(store.get(first.VERIFICATION_KEY_STORAGE_KEY)).toBe(pub);

    // A reloaded kiosk with no connection still gets the key from its cache.
    vi.resetModules();
    const reloaded = await import('@/lib/crypto/verifierKeyStore');
    expect(await reloaded.ensureVerificationPublicKey(offline)).toBe('cache');
    expect((await import('@/lib/crypto/passVerifier')).hasVerificationPublicKey()).toBe(true);

    vi.unstubAllGlobals();
  });

  it('reports a missing key when offline with nothing cached', async () => {
    vi.stubEnv('ED25519_PUBLIC_KEY_BASE64', '');
    vi.stubEnv('NEXT_PUBLIC_ED25519_PUBLIC_KEY', '');
    const offline = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const { ensureVerificationPublicKey } = await import('@/lib/crypto/verifierKeyStore');
    expect(await ensureVerificationPublicKey(offline)).toBe('missing');
  });
});
