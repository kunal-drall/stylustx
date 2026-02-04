/**
 * StylusTx SDK
 * 
 * TypeScript SDK for building gasless transactions on Arbitrum using Stylus.
 * 
 * @example
 * ```typescript
 * import { StylusTxClient, CHAIN_CONFIGS } from '@stylustx/sdk';
 * import { ethers } from 'ethers';
 * 
 * // Initialize client
 * const client = new StylusTxClient({
 *   paymasterAddress: '0x...',
 *   provider: CHAIN_CONFIGS.ARBITRUM_SEPOLIA.rpcUrl,
 *   signer: wallet, // ethers.js Signer
 * });
 * 
 * // Sign a meta-transaction
 * const signedTx = await client.signMetaTransaction(
 *   targetContractAddress,
 *   encodedFunctionData
 * );
 * 
 * // Send to relayer or execute directly
 * const result = await client.executeMetaTransaction(signedTx);
 * ```
 */

export { StylusTxClient } from './client';
export {
  DOMAIN_SEPARATOR,
  PAYMASTER_CONTRACT_ABI,
  CHAIN_CONFIGS,
  DEFAULT_DEADLINE_OFFSET,
} from './constants';
export { computeMessageHash, createDeadline } from './utils/hashing';
export type {
  StylusTxConfig,
  MetaTransaction,
  SignedMetaTransaction,
  MetaTxResult,
} from './types';
