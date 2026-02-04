import PAYMASTER_ABI from '../../contracts/paymaster/abi.json';

/**
 * Domain separator used in message hashing
 * MUST match DOMAIN_SEPARATOR in the Stylus contract
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
