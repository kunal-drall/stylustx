# StylusTx SDK

TypeScript SDK for building gasless transactions on Arbitrum using Stylus smart contracts.

## Features

- **Gasless Transactions**: Users sign messages, relayers pay gas
- **EIP-712 Typed Data**: Better wallet UX with structured signing
- **Batch Transactions**: Execute multiple transactions atomically
- **Relayer Integration**: Built-in support for relayer services
- **Policy Checking**: Query gas sponsorship policies
- **Full TypeScript Support**: Complete type definitions

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

// Prepare transaction data
const targetContract = new ethers.Contract(targetAddress, abi, provider);
const data = targetContract.interface.encodeFunctionData('someFunction', [args]);

// Sign meta-transaction (free for user!)
const signedTx = await client.signMetaTransaction(targetAddress, data);

// Execute via relayer (relayer pays gas)
const result = await client.executeMetaTransaction(signedTx, relayerSigner);
console.log('Transaction hash:', result.txHash);
```

## Core Concepts

### Gasless Transaction Flow

1. **User signs** a message off-chain (free, no gas)
2. **Relayer submits** the signed message to the paymaster (relayer pays gas)
3. **Paymaster verifies** the signature using ecrecover
4. **Target contract** receives the call as if from the user

### EIP-712 Typed Data Signing

The SDK uses EIP-712 for structured data signing, providing users with clear, readable signing prompts in their wallets instead of opaque hex strings.

## API Reference

### Client Initialization

```typescript
const client = new StylusTxClient({
  paymasterAddress: string,   // Deployed paymaster contract
  provider: Provider | string, // Ethers provider or RPC URL
  signer?: Signer,             // User's wallet (optional)
  chainId?: number,            // Default: 421614 (Arbitrum Sepolia)
});
```

### Signing Transactions

#### signMetaTransaction

Signs a single meta-transaction using EIP-712 typed data.

```typescript
const signedTx = await client.signMetaTransaction(
  to: string,              // Target contract address
  data: string,            // Encoded function call
  value?: bigint,          // ETH value (default: 0n)
  deadlineOffset?: number  // Seconds until expiry (default: 300)
);
```

#### signBatchMetaTransactions

Signs multiple transactions for batch execution.

```typescript
const transactions = [
  { to: '0x...', data: '0x...', value: 0n },
  { to: '0x...', data: '0x...' },
];

const signedBatch = await client.signBatchMetaTransactions(
  transactions,
  deadlineOffset // optional, default: 300 seconds
);
```

### Executing Transactions

#### executeMetaTransaction

Executes a signed transaction on-chain.

```typescript
const result = await client.executeMetaTransaction(signedTx, relayerSigner?);
// Returns: { success: boolean, txHash: string, error?: string }
```

#### executeBatchMetaTransactions

Executes multiple signed transactions atomically.

```typescript
const result = await client.executeBatchMetaTransactions(signedBatch, relayerSigner?);
```

### Relayer Integration

Send transactions to a relayer service instead of executing directly.

#### sendToRelayer

```typescript
const result = await client.sendToRelayer(signedTx, 'https://relayer.example.com');
```

#### sendBatchToRelayer

```typescript
const result = await client.sendBatchToRelayer(signedBatch, 'https://relayer.example.com');
```

### Query Functions

#### getNonce

```typescript
const nonce = await client.getNonce(userAddress);
```

#### getAllowedTarget

```typescript
const target = await client.getAllowedTarget();
```

#### isInitialized / isPaused

```typescript
const initialized = await client.isInitialized();
const paused = await client.isPaused();
```

#### getPolicyStatus

Check gas sponsorship policy for a user.

```typescript
const policy = await client.getPolicyStatus(userAddress, gasLimit?);
// Returns PolicyStatus object with:
// - tokenGateEnabled: boolean
// - requiredToken?: string
// - requiredBalance?: bigint
// - isERC721?: boolean
// - dailyTxLimit: bigint
// - userDailyTxCount: bigint
// - maxGasPerTx: bigint
// - canExecute: boolean
```

#### verifyMetaTransaction

Pre-validate a transaction before execution.

```typescript
const isValid = await client.verifyMetaTransaction(signedTx);
```

### Utility Functions

#### getDomain

Get EIP-712 domain for this paymaster.

```typescript
const domain = client.getDomain();
// Returns: { name, version, chainId, verifyingContract }
```

#### getPaymasterAddress / getChainId / getContract

```typescript
const address = client.getPaymasterAddress();
const chainId = client.getChainId();
const contract = client.getContract();
```

## Batch Transactions

Execute multiple operations in a single transaction:

```typescript
import { StylusTxClient } from '@stylustx/sdk';
import { ethers } from 'ethers';

const client = new StylusTxClient({ ... });

// Prepare multiple calls
const transactions = [
  {
    to: tokenContract.address,
    data: tokenContract.interface.encodeFunctionData('approve', [spender, amount]),
  },
  {
    to: dexContract.address,
    data: dexContract.interface.encodeFunctionData('swap', [tokenIn, tokenOut, amount]),
  },
];

// Sign all transactions
const signedBatch = await client.signBatchMetaTransactions(transactions);

// Execute atomically
const result = await client.executeBatchMetaTransactions(signedBatch, relayerSigner);
```

## Relayer Service Integration

For production deployments, send transactions to a backend relayer:

```typescript
// Sign transaction client-side
const signedTx = await client.signMetaTransaction(to, data);

// Send to relayer service
const result = await client.sendToRelayer(signedTx, 'https://your-relayer.com');

if (result.success) {
  console.log('Submitted! TX:', result.txHash);
} else {
  console.error('Failed:', result.error);
}
```

## Policy Checking

Check if a user meets gas sponsorship requirements:

```typescript
const policy = await client.getPolicyStatus(userAddress);

if (!policy.canExecute) {
  if (policy.tokenGateEnabled) {
    console.log(`Hold ${policy.requiredBalance} of ${policy.requiredToken}`);
  }
  if (policy.userDailyTxCount >= policy.dailyTxLimit) {
    console.log('Daily limit reached');
  }
}
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
  if (error.message.includes('No signer')) {
    console.error('Call setSigner() first');
  } else {
    console.error('Transaction error:', error);
  }
}
```

## TypeScript Types

```typescript
import type {
  StylusTxConfig,
  MetaTransaction,
  SignedMetaTransaction,
  MetaTxResult,
  PolicyStatus,
  EIP712Domain,
} from '@stylustx/sdk';
```

## Security

- **Nonce Management**: Sequential nonces prevent replay attacks
- **Deadlines**: Transactions expire to prevent stale execution
- **EIP-712 Signing**: Clear signing prompts prevent phishing
- **Signature Malleability**: S-value normalization per EIP-2
- **Policy Enforcement**: Token gates and rate limits

## License

MIT
