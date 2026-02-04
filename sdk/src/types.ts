import { Signer, Provider } from 'ethers';

/**
 * Configuration for StylusTxClient
 */
export interface StylusTxConfig {
  /** Paymaster contract address */
  paymasterAddress: string;
  /** JSON-RPC provider or provider URL */
  provider: Provider | string;
  /** Optional signer for user wallet */
  signer?: Signer;
  /** Chain ID (default: 421614 for Arbitrum Sepolia) */
  chainId?: number;
}

/**
 * Meta-transaction parameters
 */
export interface MetaTransaction {
  /** Address that will execute the action */
  from: string;
  /** Target contract address */
  to: string;
  /** ETH value to send (usually 0 for gasless txs) */
  value: bigint;
  /** Encoded function call data */
  data: string;
  /** User's current nonce */
  nonce: bigint;
  /** Unix timestamp after which tx is invalid */
  deadline: bigint;
}

/**
 * Signed meta-transaction ready for submission
 */
export interface SignedMetaTransaction extends MetaTransaction {
  /** ECDSA signature v component */
  v: number;
  /** ECDSA signature r component */
  r: string;
  /** ECDSA signature s component */
  s: string;
}

/**
 * Result of executing a meta-transaction
 */
export interface MetaTxResult {
  /** Whether execution succeeded */
  success: boolean;
  /** Transaction hash */
  txHash: string;
  /** Return data from target contract */
  returnData?: string;
  /** Error message if failed */
  error?: string;
}
