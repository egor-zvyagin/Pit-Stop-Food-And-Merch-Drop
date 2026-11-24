/**
 * Generates a fresh Ed25519 keypair for pass signing and prints it as
 * environment variable lines.
 *
 *   npm run keygen
 *
 * Paste the output into .env.local for local use, or into your hosting
 * provider's environment variables. The private key is shown once, here, and
 * is stored nowhere: never commit it.
 */
import { generateKeyPairSync } from 'crypto';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const privateB64 = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
const publicB64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

console.log(`ED25519_PRIVATE_KEY_BASE64=${privateB64}`);
console.log(`ED25519_PUBLIC_KEY_BASE64=${publicB64}`);
