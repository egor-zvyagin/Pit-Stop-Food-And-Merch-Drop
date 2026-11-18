/**
 * Pit Stop Cryptographic Pass Engine (Export Facade)
 * Unifies server-only pass signing and isomorphic browser-safe pass verification.
 * Maintained for backwards compatibility.
 */

import {
  getKeypair,
  canonicalize,
  issueSignedPass,
  signPass,
  getPublicKeyBase64,
  getRawPublicKeyBase64,
  OrderItem,
  OrderPassPayload,
  SignedDigitalPass,
} from './passSigner';

import {
  verifyPassOffline,
  verifyPass,
  verifyQrPayload,
  setVerificationPublicKey,
  getActivePublicKey,
  VerificationResult,
  Ed25519PassVerifier,
} from './passVerifier';

import { OfflineNonceRegistry } from './nonceRegistry';

export type { OrderItem, OrderPassPayload, SignedDigitalPass, VerificationResult };

export class Ed25519PassEngine {
  /**
   * Retrieves or initializes the Ed25519 keypair.
   */
  public static getKeypair = getKeypair;

  /**
   * Produces canonical deterministic JSON representation.
   */
  public static canonicalize = canonicalize;

  /**
   * Signs an order pass with Ed25519 private key.
   */
  public static issueSignedPass = issueSignedPass;

  /**
   * Alias for issueSignedPass.
   */
  public static signPass = signPass;

  /**
   * Verifies pass using Ed25519 public key in sub-10ms with zero network requests.
   */
  public static verifyPassOffline = verifyPassOffline;

  /**
   * Helper to parse and verify a raw QR payload string.
   */
  public static verifyQrPayload = verifyQrPayload;

  /**
   * Public key retrieval helper.
   */
  public static getPublicKeyBase64 = getPublicKeyBase64;
}

export {
  // Signer exports
  getKeypair,
  canonicalize,
  issueSignedPass,
  signPass,
  getPublicKeyBase64,
  getRawPublicKeyBase64,
  // Verifier exports
  verifyPassOffline,
  verifyPass,
  verifyQrPayload,
  setVerificationPublicKey,
  getActivePublicKey,
  Ed25519PassVerifier,
  // Nonce registry exports
  OfflineNonceRegistry,
};
