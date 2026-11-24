import { generateKeyPairSync } from 'crypto';
import { TEST_VENDOR_PIN } from './testEnv';

// The app refuses vendor requests and pass signing unless these are
// configured, so each test worker gets its own PIN and a throwaway keypair.
process.env.VENDOR_ACCESS_PIN = TEST_VENDOR_PIN;

// Tests always run on the in-memory store and can never reach a real table.
process.env.USE_LOCAL_STORAGE = 'true';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
process.env.ED25519_PRIVATE_KEY_BASE64 = privateKey
  .export({ type: 'pkcs8', format: 'der' })
  .toString('base64');
process.env.ED25519_PUBLIC_KEY_BASE64 = publicKey
  .export({ type: 'spki', format: 'der' })
  .toString('base64');
