import { keccak256, concat, toUtf8Bytes, getBytes, zeroPadValue, toBeHex, TypedDataEncoder } from 'ethers';
import { EIP712_DOMAIN, EIP712_TYPES } from '../constants';
import { MetaTransaction, EIP712Domain } from '../types';

/**
 * Compute the domain separator for EIP-712
 *
 * Format: keccak256(name || version || chainId || verifyingContract)
 * MUST match compute_domain_separator() in the Stylus contract
 */
export function computeDomainSeparator(chainId: number, verifyingContract: string): string {
  const nameBytes = toUtf8Bytes(EIP712_DOMAIN.name);
  const versionBytes = toUtf8Bytes(EIP712_DOMAIN.version);
  const chainIdBytes = zeroPadValue(toBeHex(chainId), 8); // 8 bytes for u64
  const contractBytes = getBytes(verifyingContract);

  const domain = concat([
    nameBytes,
    versionBytes,
    chainIdBytes,
    contractBytes,
  ]);

  return keccak256(domain);
}

/**
 * Compute the message hash for a meta-transaction (EIP-712 compatible)
 *
 * CRITICAL: This MUST match the compute_hash() function in the Stylus contract exactly!
 *
 * Format: keccak256(domainSeparator || from || to || value || keccak256(data) || nonce || deadline)
 */
export function computeMessageHash(
  tx: MetaTransaction,
  chainId: number,
  verifyingContract: string
): string {
  const domainSeparator = computeDomainSeparator(chainId, verifyingContract);
  const dataHash = keccak256(tx.data);

  const domainBytes = getBytes(domainSeparator);
  const fromBytes = getBytes(tx.from);
  const toBytes = getBytes(tx.to);
  const valueBytes = zeroPadValue(toBeHex(tx.value), 32);
  const dataHashBytes = getBytes(dataHash);
  const nonceBytes = zeroPadValue(toBeHex(tx.nonce), 32);
  const deadlineBytes = zeroPadValue(toBeHex(tx.deadline), 32);

  const message = concat([
    domainBytes,
    fromBytes,
    toBytes,
    valueBytes,
    dataHashBytes,
    nonceBytes,
    deadlineBytes,
  ]);

  return keccak256(message);
}

/**
 * Create EIP-712 typed data for signing
 *
 * This provides better UX in wallets - users see structured data
 * instead of a raw hash
 */
export function createTypedData(
  tx: MetaTransaction,
  chainId: number,
  verifyingContract: string
): {
  domain: EIP712Domain;
  types: typeof EIP712_TYPES;
  message: Record<string, unknown>;
} {
  return {
    domain: {
      name: EIP712_DOMAIN.name,
      version: EIP712_DOMAIN.version,
      chainId,
      verifyingContract,
    },
    types: EIP712_TYPES,
    message: {
      from: tx.from,
      to: tx.to,
      value: tx.value.toString(),
      data: tx.data,
      nonce: tx.nonce.toString(),
      deadline: tx.deadline.toString(),
    },
  };
}

/**
 * Compute EIP-712 typed data hash (for verification)
 */
export function computeTypedDataHash(
  tx: MetaTransaction,
  chainId: number,
  verifyingContract: string
): string {
  const typedData = createTypedData(tx, chainId, verifyingContract);
  return TypedDataEncoder.hash(
    typedData.domain,
    typedData.types,
    typedData.message
  );
}

/**
 * Helper to create a deadline timestamp (current time + offset in seconds)
 */
export function createDeadline(offsetSeconds: number = 300): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + offsetSeconds);
}

/**
 * Normalize signature s value to lower half of curve order (EIP-2)
 * This prevents signature malleability
 */
export function normalizeSignatureS(s: string): string {
  const sBigInt = BigInt(s);
  const secp256k1N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
  const secp256k1NDiv2 = secp256k1N / BigInt(2);

  if (sBigInt > secp256k1NDiv2) {
    // s is in upper half, flip it to lower half
    const normalizedS = secp256k1N - sBigInt;
    return '0x' + normalizedS.toString(16).padStart(64, '0');
  }

  return s;
}

/**
 * Split signature into r, s, v components
 */
export function splitSignature(signature: string): { r: string; s: string; v: number } {
  const sig = signature.startsWith('0x') ? signature.slice(2) : signature;

  if (sig.length !== 130) {
    throw new Error(`Invalid signature length: ${sig.length}`);
  }

  const r = '0x' + sig.slice(0, 64);
  let s = '0x' + sig.slice(64, 128);
  let v = parseInt(sig.slice(128, 130), 16);

  // Normalize v to 27/28
  if (v < 27) {
    v += 27;
  }

  // Normalize s to lower half
  s = normalizeSignatureS(s);

  return { r, s, v };
}
