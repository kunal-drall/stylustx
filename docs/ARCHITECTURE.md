# StylusTx Architecture

Technical architecture of the StylusTx gasless transaction system.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              User's Browser                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐     ┌─────────────────┐     ┌─────────────────────────┐   │
│  │   Wallet    │────►│  Demo App       │────►│  StylusTx SDK           │   │
│  │  (MetaMask) │ EIP │  (React)        │     │  (TypeScript)           │   │
│  └─────────────┘ 712 └─────────────────┘     └───────────┬─────────────┘   │
│                 Sign                                      │                  │
└───────────────────────────────────────────────────────────┼──────────────────┘
                                                            │
                                                            │ HTTPS/REST
                                                            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Relayer Service                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐     ┌─────────────────┐     ┌───────────────────────┐ │
│  │  Express API    │────►│  Validation     │────►│  Transaction          │ │
│  │  (REST)         │     │  Middleware     │     │  Submitter            │ │
│  └─────────────────┘     └─────────────────┘     └───────────┬───────────┘ │
│                                                               │             │
│  ┌─────────────────┐                                          │             │
│  │  Relayer Wallet │◄─────────────────────────────────────────┘             │
│  │  (Pays Gas)     │                                                        │
│  └─────────────────┘                                                        │
└───────────────────────────────────────────────────────────────┼─────────────┘
                                                                │
                                                                │ JSON-RPC
                                                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Arbitrum Network                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Stylus Paymaster Contract                         │   │
│  │                         (Rust/WASM)                                  │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  1. Verify EIP-712 signature (ecrecover)                            │   │
│  │  2. Check nonce                                                      │   │
│  │  3. Validate deadline                                                │   │
│  │  4. Check policy (token gate, limits)                               │   │
│  │  5. Forward call to target                                          │   │
│  └─────────────────────────────────────┬───────────────────────────────┘   │
│                                        │                                    │
│                                        │ delegatecall                       │
│                                        ▼                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Target Contract                                 │   │
│  │                    (Any Solidity/Stylus)                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Stylus Paymaster Contract

The core on-chain component, written in Rust and compiled to WASM.

**Location**: `contracts/paymaster/src/lib.rs`

**Key Features**:
- ECDSA signature verification via ecrecover precompile
- EIP-712 typed data hash verification
- Nonce-based replay protection
- Configurable gas sponsorship policies
- Admin controls (pause, ownership)
- Batch transaction support

**Storage Layout**:
```rust
struct PaymasterStorage {
    owner: StorageAddress,
    nonces: StorageMap<Address, U256>,
    allowed_target: StorageAddress,
    initialized: StorageBool,
    paused: StorageBool,

    // Policy
    required_token: StorageAddress,
    required_token_balance: StorageU256,
    is_required_token_erc721: StorageBool,
    daily_tx_limit: StorageU256,
    daily_tx_count: StorageMap<Address, U256>,
    daily_tx_timestamp: StorageMap<Address, U256>,
    max_gas_per_tx: StorageU256,

    // Reentrancy guard
    executing: StorageBool,
}
```

**Gas Efficiency**:
- Stylus contracts run ~10x cheaper than EVM
- WASM execution is more efficient for cryptographic operations
- Contract size: 12.0 KB

### 2. TypeScript SDK

Client library for integrating gasless transactions.

**Location**: `sdk/src/`

**Modules**:
- `client.ts` - Main StylusTxClient class
- `types.ts` - TypeScript interfaces
- `constants.ts` - Chain configs, ABI, EIP-712
- `utils/hashing.ts` - Hash computation and signatures

**Key Responsibilities**:
- Format meta-transactions
- Compute EIP-712 typed data
- Sign with user's wallet
- Submit to relayer or execute directly
- Query contract state

### 3. Relayer Service

Backend service that submits transactions on behalf of users.

**Location**: `relayer/src/`

**Components**:
- `index.ts` - Express.js REST API
- `services/relayer.ts` - Transaction submission logic
- `middleware/validation.ts` - Request validation
- `utils/logger.ts` - Winston logging

**Features**:
- Rate limiting (100 req/min)
- Request validation
- Transaction status tracking
- Health monitoring
- Policy checking

### 4. Demo Application

React application demonstrating the complete flow.

**Location**: `demo/src/`

**Components**:
- Wallet connection (MetaMask)
- Transaction signing UI
- Status display
- Network switching

## Transaction Flow

### Step 1: User Signs

```
User Wallet                      SDK
    │                             │
    │  signTypedData_v4           │
    │◄────────────────────────────┤
    │                             │
    │  Returns signature          │
    ├────────────────────────────►│
```

The SDK creates EIP-712 typed data:

```typescript
{
  domain: {
    name: 'StylusTx',
    version: '1',
    chainId: 421614,
    verifyingContract: paymasterAddress
  },
  types: {
    MetaTransaction: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' }
    ]
  },
  message: { from, to, value, data, nonce, deadline }
}
```

### Step 2: Relayer Submits

```
SDK                          Relayer                     Arbitrum
 │                              │                            │
 │  POST /relay                 │                            │
 │  {signedTx}                  │                            │
 ├─────────────────────────────►│                            │
 │                              │  paymaster.execute()       │
 │                              ├───────────────────────────►│
 │                              │                            │
 │                              │  txHash                    │
 │                              │◄───────────────────────────┤
 │  {success, txHash}           │                            │
 │◄─────────────────────────────┤                            │
```

### Step 3: Contract Verifies

```rust
// In Paymaster contract
fn execute(...) {
    // 1. Check initialized and not paused
    require!(self.initialized.get());
    require!(!self.paused.get());

    // 2. Validate target
    require!(to == self.allowed_target.get());

    // 3. Check deadline
    require!(block::timestamp() <= deadline);

    // 4. Verify nonce
    let expected = self.nonces.get(from);
    require!(nonce == expected);

    // 5. Increment nonce BEFORE call (prevent reentrancy)
    self.nonces.insert(from, nonce + 1);

    // 6. Verify signature
    let hash = compute_typed_data_hash(...);
    let recovered = ecrecover(hash, v, r, s);
    require!(recovered == from);

    // 7. Check policy
    require!(self.check_policy(from, gas_limit));

    // 8. Execute call
    RawCall::new().call(to, data)
}
```

## Security Architecture

### Signature Verification

Uses EIP-712 typed data with ecrecover precompile:

```
Input:  32-byte hash + v + r + s
Output: 20-byte recovered address
```

The hash includes:
- Domain separator (name, version, chainId, verifyingContract)
- Type hash (MetaTransaction struct)
- Message values (from, to, value, data, nonce, deadline)

### Replay Protection

1. **Nonce**: Sequential per-user, checked and incremented atomically
2. **Deadline**: Transaction expires after specified timestamp
3. **Chain ID**: Included in EIP-712 domain

### Signature Malleability Protection

S-value normalized per EIP-2:
```typescript
const SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
const MAX_S = SECP256K1_N / 2n;

if (sBigInt > MAX_S) {
  s = (SECP256K1_N - sBigInt).toString(16);
}
```

### Reentrancy Protection

Contract uses a mutex pattern:
```rust
require!(!self.executing.get());
self.executing.set(true);
// ... execute call ...
self.executing.set(false);
```

### Gas Sponsorship Policies

Multiple layers of abuse prevention:

1. **Token Gate**: Require holding specific ERC-20/ERC-721
2. **Daily Limit**: Max transactions per user per day
3. **Gas Cap**: Maximum gas per transaction
4. **Pause**: Emergency stop capability

## Data Flow

### Signing Data

```
User Input:
  - Target contract address
  - Function call data

SDK Adds:
  - User address (from signer)
  - Nonce (from contract)
  - Deadline (current time + offset)
  - Value (default 0)

SDK Computes:
  - EIP-712 typed data hash
  - Signature (via wallet)
```

### Execution Data

```
Relayer Receives:
  - Complete SignedMetaTransaction

Relayer Validates:
  - All fields present
  - Address formats valid
  - Signature format valid

Contract Validates:
  - Initialization state
  - Target allowlist
  - Deadline not passed
  - Nonce correct
  - Signature valid
  - Policy requirements met
```

## Deployment Architecture

### Testnet (Arbitrum Sepolia)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Vercel    │     │   Railway/  │     │  Arbitrum   │
│   (Demo)    │────►│   Render    │────►│  Sepolia    │
│             │     │  (Relayer)  │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
```

### Production (Arbitrum One)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   CDN       │     │   Backend   │     │  Arbitrum   │
│  (Demo)     │────►│  Cluster    │────►│   One       │
│             │     │  (Relayer)  │     │             │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                    ┌──────┴──────┐
                    │   HSM/KMS   │
                    │  (Keys)     │
                    └─────────────┘
```

## Performance Characteristics

| Metric | Value |
|--------|-------|
| Contract size | 12.0 KB |
| WASM data fee | ~0.000073 ETH |
| Signature verification | ~50,000 gas |
| Single tx execution | ~100,000 gas |
| Batch tx (per item) | ~80,000 gas |
| SDK bundle size | ~15 KB (minified) |

## Future Enhancements

### Multi-Target Support
Replace single `allowed_target` with mapping for multiple authorized targets.

### Gas Estimation
Pre-compute gas for better UX and cost optimization.

### Cross-Chain
Support for other Stylus-compatible chains.

### Advanced Policies
- Per-function limits
- Time-based restrictions
- Reputation scoring
