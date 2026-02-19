import PAYMASTER_ABI from '../../contracts/paymaster/abi.json';

/**
 * EIP-712 Domain configuration
 */
export const EIP712_DOMAIN = {
  name: 'StylusTx',
  version: '1',
};

/**
 * Legacy domain separator (for backwards compatibility)
 */
export const DOMAIN_SEPARATOR = 'StylusTx';

/**
 * Paymaster contract ABI
 */
export const PAYMASTER_CONTRACT_ABI = PAYMASTER_ABI;

/**
 * Chain configurations
 */
export const CHAIN_CONFIGS = {
  ARBITRUM_SEPOLIA: {
    chainId: 421614,
    name: 'Arbitrum Sepolia',
    rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
    explorer: 'https://sepolia.arbiscan.io',
  },
  ARBITRUM_ONE: {
    chainId: 42161,
    name: 'Arbitrum One',
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    explorer: 'https://arbiscan.io',
  },
};

/**
 * Default deadline offset (5 minutes)
 */
export const DEFAULT_DEADLINE_OFFSET = 5 * 60; // seconds

/**
 * EIP-712 Type definitions for MetaTransaction
 */
export const EIP712_TYPES = {
  MetaTransaction: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'data', type: 'bytes' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};
