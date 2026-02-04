import { keccak256, concat, toUtf8Bytes, getBytes, zeroPadValue, toBeHex } from 'ethers';
import { DOMAIN_SEPARATOR } from '../constants';
import { MetaTransaction } from '../types';

/**
 * Compute the message hash for a meta-transaction
 * 
 * CRITICAL: This MUST match the compute_hash() function in the Stylus contract exactly!
 * 
 * Format: keccak256(domain || from || to || value || keccak256(data) || nonce || deadline)
 * Where:
 * - domain: "StylusTx" as UTF-8 bytes
 * - from: 20 bytes (address)
 * - to: 20 bytes (address)
 * - value: 32 bytes (uint256, big-endian)
 * - keccak256(data): 32 bytes
 * - nonce: 32 bytes (uint256, big-endian)
 * - deadline: 32 bytes (uint256, big-endian)
 */
export function computeMessageHash(tx: MetaTransaction): string {
  // Hash the transaction data
  const dataHash = keccak256(tx.data);

  // Convert domain separator to bytes
  const domainBytes = toUtf8Bytes(DOMAIN_SEPARATOR);

  // Convert addresses to bytes (strip 0x prefix)
  const fromBytes = getBytes(tx.from);
  const toBytes = getBytes(tx.to);

  // Convert uint256 values to 32-byte big-endian format
  const valueBytes = zeroPadValue(toBeHex(tx.value), 32);
  const dataHashBytes = getBytes(dataHash);
  const nonceBytes = zeroPadValue(toBeHex(tx.nonce), 32);
  const deadlineBytes = zeroPadValue(toBeHex(tx.deadline), 32);

  // Concatenate all components
  const message = concat([
    domainBytes,
    fromBytes,
    toBytes,
    valueBytes,
    dataHashBytes,
    nonceBytes,
    deadlineBytes,
  ]);

  // Return final hash
  return keccak256(message);
}

/**
 * Helper to create a deadline timestamp (current time + offset in seconds)
 */
export function createDeadline(offsetSeconds: number = 300): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + offsetSeconds);
}
