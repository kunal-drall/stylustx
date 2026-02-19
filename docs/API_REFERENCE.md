# StylusTx API Reference

Complete API documentation for the StylusTx gasless transaction system.

## Table of Contents

- [Contract API](#contract-api)
- [SDK API](#sdk-api)
- [Relayer API](#relayer-api)
- [Type Definitions](#type-definitions)

---

## Contract API

The Stylus Paymaster contract deployed on Arbitrum.

### Core Functions

#### `initialize(target: Address)`

Initialize the contract with the allowed target. Can only be called once.

**Parameters:**
- `target`: Address of the contract that can receive forwarded calls

**Access:** Anyone (but only callable once)

#### `execute(from, to, value, data, nonce, deadline, v, r, s)`

Execute a meta-transaction on behalf of a user.

**Parameters:**
- `from`: User address (signer of the meta-transaction)
- `to`: Target contract address
- `value`: ETH value to forward (currently unused)
- `data`: Encoded function call data
- `nonce`: User's current nonce
- `deadline`: Unix timestamp when transaction expires
- `v`: Signature recovery id (27 or 28)
- `r`: Signature r component (32 bytes)
- `s`: Signature s component (32 bytes)

**Returns:** `bytes` - Return data from the target call

**Errors:**
- Contract not initialized
- Contract paused
- Invalid target
- Transaction expired
- Invalid nonce
- Invalid signature
- User doesn't meet policy requirements
- Reentrancy detected

#### `execute_batch(...arrays)`

Execute multiple meta-transactions atomically.

**Parameters:** Arrays of all execute parameters for each transaction.

### View Functions

#### `get_nonce(user: Address) -> u256`

Get the current nonce for a user.

#### `get_allowed_target() -> Address`

Get the allowed target contract address.

#### `is_initialized() -> bool`

Check if contract has been initialized.

#### `is_paused() -> bool`

Check if contract is paused.

### Policy Functions

#### `get_required_token() -> Address`

Get the token required for gas sponsorship (zero if no token gate).

#### `get_required_token_balance() -> u256`

Get the minimum token balance required.

#### `is_required_token_erc721() -> bool`

Check if required token is ERC-721 (true) or ERC-20 (false).

#### `get_daily_tx_limit() -> u256`

Get the maximum transactions per user per day.

#### `get_user_daily_tx_count(user: Address) -> u256`

Get user's transaction count for current day.

#### `get_max_gas_per_tx() -> u256`

Get maximum gas allowed per transaction.

#### `can_user_execute(user: Address, gas_limit: u256) -> bool`

Check if user meets all policy requirements.

### Admin Functions

#### `set_allowed_target(new_target: Address)`

Update the allowed target contract. **Owner only.**

#### `set_required_token(token: Address, balance: u256, is_erc721: bool)`

Set token gate requirements. **Owner only.**

#### `set_daily_tx_limit(limit: u256)`

Set max transactions per user per day. **Owner only.**

#### `set_max_gas_per_tx(max_gas: u256)`

Set maximum gas per transaction. **Owner only.**

#### `pause() / unpause()`

Emergency pause/unpause the contract. **Owner only.**

#### `transfer_ownership(new_owner: Address)`

Transfer contract ownership. **Owner only.**

---

## SDK API

### StylusTxClient

Main client class for gasless transactions.

#### Constructor

```typescript
new StylusTxClient(config: StylusTxConfig)
```

**Config Options:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `paymasterAddress` | `string` | Yes | Deployed paymaster address |
| `provider` | `Provider \| string` | Yes | Ethers provider or RPC URL |
| `signer` | `Signer` | No | User's wallet signer |
| `chainId` | `number` | No | Chain ID (default: 421614) |

#### Methods

##### `setSigner(signer: Signer): void`

Set or update the user's signer.

##### `signMetaTransaction(to, data, value?, deadlineOffset?): Promise<SignedMetaTransaction>`

Sign a meta-transaction using EIP-712.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `to` | `string` | - | Target contract |
| `data` | `string` | - | Encoded call data |
| `value` | `bigint` | `0n` | ETH value |
| `deadlineOffset` | `number` | `300` | Seconds until expiry |

##### `signMetaTransactionLegacy(...)`: `Promise<SignedMetaTransaction>`

Sign using raw message hash (legacy method, use `signMetaTransaction` instead).

##### `signBatchMetaTransactions(transactions, deadlineOffset?): Promise<SignedMetaTransaction[]>`

Sign multiple transactions for batch execution.

```typescript
const transactions = [
  { to: string, data: string, value?: bigint },
  // ...
];
```

##### `executeMetaTransaction(signedTx, relayerSigner?): Promise<MetaTxResult>`

Execute a signed meta-transaction on-chain.

##### `executeBatchMetaTransactions(signedTxs, relayerSigner?): Promise<MetaTxResult>`

Execute batch of signed transactions atomically.

##### `sendToRelayer(signedTx, relayerUrl): Promise<MetaTxResult>`

Send signed transaction to a relayer service.

##### `sendBatchToRelayer(signedTxs, relayerUrl): Promise<MetaTxResult>`

Send batch to relayer service.

##### `verifyMetaTransaction(signedTx): Promise<boolean>`

Validate a signed transaction before execution.

##### `getNonce(userAddress): Promise<bigint>`

Get user's current nonce.

##### `getAllowedTarget(): Promise<string>`

Get allowed target address.

##### `isInitialized(): Promise<boolean>`

Check if paymaster is initialized.

##### `isPaused(): Promise<boolean>`

Check if paymaster is paused.

##### `getPolicyStatus(userAddress, gasLimit?): Promise<PolicyStatus>`

Get gas sponsorship policy status for a user.

##### `getDomain(): EIP712Domain`

Get EIP-712 domain for signing.

##### `getPaymasterAddress(): string`

Get the paymaster contract address.

##### `getChainId(): number`

Get the configured chain ID.

##### `getContract(): Contract`

Get the underlying ethers Contract instance.

### Utility Functions

#### `computeMessageHash(tx, chainId, paymasterAddress): string`

Compute the EIP-712 typed data hash for a meta-transaction.

#### `createTypedData(tx, chainId, paymasterAddress): TypedData`

Create EIP-712 typed data structure for signing.

#### `createDeadline(offsetSeconds): bigint`

Create a deadline timestamp from an offset.

#### `splitSignature(signature): { r, s, v }`

Split a signature into components with EIP-2 normalization.

---

## Relayer API

Backend relayer service REST API.

### Endpoints

#### `GET /health`

Health check endpoint.

**Response:**
```json
{ "status": "ok" }
```

#### `GET /info`

Get relayer information.

**Response:**
```json
{
  "success": true,
  "address": "0x...",
  "balance": "0.5",
  "paymaster": "0x...",
  "initialized": true,
  "paused": false
}
```

#### `GET /nonce/:address`

Get user's current nonce.

**Response:**
```json
{
  "success": true,
  "nonce": "5"
}
```

#### `POST /relay`

Submit a signed meta-transaction.

**Request Body:**
```json
{
  "from": "0x...",
  "to": "0x...",
  "value": "0",
  "data": "0x...",
  "nonce": "5",
  "deadline": "1234567890",
  "v": 28,
  "r": "0x...",
  "s": "0x..."
}
```

**Response:**
```json
{
  "success": true,
  "txHash": "0x..."
}
```

#### `POST /relay/batch`

Submit multiple signed meta-transactions.

**Request Body:**
```json
{
  "transactions": [
    { "from": "0x...", "to": "0x...", ... },
    { "from": "0x...", "to": "0x...", ... }
  ]
}
```

#### `GET /status/:txHash`

Get transaction status.

**Response:**
```json
{
  "success": true,
  "status": "confirmed",
  "txHash": "0x...",
  "blockNumber": 12345
}
```

#### `GET /policy/:address`

Get gas sponsorship policy status for a user.

**Response:**
```json
{
  "success": true,
  "policy": {
    "tokenGateEnabled": true,
    "requiredToken": "0x...",
    "requiredBalance": "100",
    "dailyTxLimit": "50",
    "userDailyTxCount": "3",
    "maxGasPerTx": "500000",
    "canExecute": true
  }
}
```

---

## Type Definitions

### StylusTxConfig

```typescript
interface StylusTxConfig {
  paymasterAddress: string;
  provider: Provider | string;
  signer?: Signer;
  chainId?: number;
}
```

### MetaTransaction

```typescript
interface MetaTransaction {
  from: string;
  to: string;
  value: bigint;
  data: string;
  nonce: bigint;
  deadline: bigint;
}
```

### SignedMetaTransaction

```typescript
interface SignedMetaTransaction extends MetaTransaction {
  v: number;
  r: string;
  s: string;
}
```

### MetaTxResult

```typescript
interface MetaTxResult {
  success: boolean;
  txHash: string;
  returnData?: string;
  error?: string;
}
```

### PolicyStatus

```typescript
interface PolicyStatus {
  tokenGateEnabled: boolean;
  requiredToken?: string;
  requiredBalance?: bigint;
  isERC721?: boolean;
  dailyTxLimit: bigint;
  userDailyTxCount: bigint;
  maxGasPerTx: bigint;
  canExecute: boolean;
}
```

### EIP712Domain

```typescript
interface EIP712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}
```

### ChainConfig

```typescript
interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  blockExplorer: string;
}
```

---

## Error Codes

| Error | Description |
|-------|-------------|
| `Contract not initialized` | Call `initialize()` first |
| `Contract paused` | Admin has paused the contract |
| `Invalid target` | Target not in allowlist |
| `Transaction expired` | Deadline has passed |
| `Invalid nonce` | Nonce doesn't match expected |
| `Invalid signature` | Signature verification failed |
| `Token balance required` | User doesn't hold required tokens |
| `Daily limit reached` | User exceeded daily transaction limit |
| `Gas too high` | Requested gas exceeds maximum |
| `Reentrancy detected` | Contract is already executing |

---

## Constants

### Chain Configurations

```typescript
const CHAIN_CONFIGS = {
  ARBITRUM_ONE: {
    chainId: 42161,
    name: 'Arbitrum One',
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    blockExplorer: 'https://arbiscan.io',
  },
  ARBITRUM_SEPOLIA: {
    chainId: 421614,
    name: 'Arbitrum Sepolia',
    rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
    blockExplorer: 'https://sepolia.arbiscan.io',
  },
};
```

### EIP-712 Domain

```typescript
const EIP712_DOMAIN = {
  name: 'StylusTx',
  version: '1',
};
```

### Default Values

```typescript
const DEFAULT_DEADLINE_OFFSET = 300; // 5 minutes
```
