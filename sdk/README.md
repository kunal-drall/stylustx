# StylusTx SDK

TypeScript SDK for building gasless transactions on Arbitrum using Stylus smart contracts.

## Installation

```bash
npm install @stylustx/sdk ethers
```

## Quick Start

```typescript
import { StylusTxClient, CHAIN_CONFIGS } from '@stylustx/sdk';
import { ethers } from 'ethers';

// Connect user's wallet
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

// Initialize StylusTx client
const client = new StylusTxClient({
  paymasterAddress: '0x...', // Your deployed paymaster address
  provider: CHAIN_CONFIGS.ARBITRUM_SEPOLIA.rpcUrl,
  signer: signer,
});

// Prepare transaction data (example: calling a function on target contract)
const targetContract = new ethers.Contract(targetAddress, abi, provider);
const data = targetContract.interface.encodeFunctionData('someFunction', [args]);

// Sign meta-transaction (free for user!)
const signedTx = await client.signMetaTransaction(
  targetAddress,
  data
);

// Execute via relayer (relayer pays gas)
const result = await client.executeMetaTransaction(signedTx, relayerSigner);
console.log('Transaction hash:', result.txHash);
```

## Core Concepts

### Gasless Transactions

StylusTx enables gasless transactions through meta-transactions:

1. **User signs** a message off-chain (free, no gas)
2. **Relayer submits** the signed message to the paymaster contract (relayer pays gas)
3. **Paymaster verifies** the signature and executes the action
4. **Target contract** receives the call as if it came from the user

### Client API

#### Initialize Client

```typescript
const client = new StylusTxClient({
  paymasterAddress: string,  // Deployed paymaster contract
  provider: Provider | string, // Ethers provider or RPC URL
  signer?: Signer,            // User's wallet (optional, can set later)
  chainId?: number,           // Default: 421614 (Arbitrum Sepolia)
});
```

#### Sign Meta-Transaction

```typescript
const signedTx = await client.signMetaTransaction(
  to: string,              // Target contract address
  data: string,            // Encoded function call data
  value?: bigint,          // ETH value (default: 0)
  deadlineOffset?: number  // Seconds until expiry (default: 300)
);
```

#### Execute Meta-Transaction

```typescript
// As relayer with your own signer
const result = await client.executeMetaTransaction(signedTx, relayerSigner);

// Or if client already has a signer
const result = await client.executeMetaTransaction(signedTx);
```

#### Verify Meta-Transaction

```typescript
// Check if a signed transaction is valid before executing
const isValid = await client.verifyMetaTransaction(signedTx);
```

#### Get User Nonce

```typescript
const nonce = await client.getNonce(userAddress);
```

## Advanced Usage

### Custom Deadline

```typescript
import { createDeadline } from '@stylustx/sdk';

const deadline = createDeadline(600); // 10 minutes from now

const signedTx = await client.signMetaTransaction(
  targetAddress,
  data,
  0n,
  600
);
```

### Manual Message Hash Computation

```typescript
import { computeMessageHash } from '@stylustx/sdk';

const tx = {
  from: '0x...',
  to: '0x...',
  value: 0n,
  data: '0x...',
  nonce: 0n,
  deadline: 1234567890n,
};

const messageHash = computeMessageHash(tx);
```

### Multiple Chain Support

```typescript
import { CHAIN_CONFIGS } from '@stylustx/sdk';

// Arbitrum Sepolia (testnet)
const testnetClient = new StylusTxClient({
  paymasterAddress: '0x...',
  provider: CHAIN_CONFIGS.ARBITRUM_SEPOLIA.rpcUrl,
  chainId: CHAIN_CONFIGS.ARBITRUM_SEPOLIA.chainId,
});

// Arbitrum One (mainnet)
const mainnetClient = new StylusTxClient({
  paymasterAddress: '0x...',
  provider: CHAIN_CONFIGS.ARBITRUM_ONE.rpcUrl,
  chainId: CHAIN_CONFIGS.ARBITRUM_ONE.chainId,
});
```

## Error Handling

```typescript
try {
  const result = await client.executeMetaTransaction(signedTx);
  
  if (result.success) {
    console.log('Success!', result.txHash);
  } else {
    console.error('Failed:', result.error);
  }
} catch (error) {
  console.error('Transaction error:', error);
}
```

## TypeScript Types

The SDK is fully typed. Import types as needed:

```typescript
import type {
  StylusTxConfig,
  MetaTransaction,
  SignedMetaTransaction,
  MetaTxResult,
} from '@stylustx/sdk';
```

## Security Considerations

- **Nonces**: Prevent replay attacks via sequential nonces
- **Deadlines**: Transactions expire after the deadline
- **Target Allowlist**: Only approved contracts can be called
- **Signature Verification**: ECDSA signatures verified on-chain via ecrecover

## License

MIT
