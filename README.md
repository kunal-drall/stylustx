# StylusTx

> Gas abstraction layer for Arbitrum using Stylus smart contracts

StylusTx enables gasless transactions on Arbitrum. Users sign messages off-chain (free, no blockchain interaction) and a relayer submits transactions on their behalf, paying all gas fees.

## 🎯 Features

- **Gasless Transactions**: Users never pay gas fees
- **Signature Verification**: Secure ECDSA verification using ecrecover precompile
- **Replay Protection**: Nonce-based protection against replay attacks
- **Admin Controls**: Pausable, ownership management, target allowlist
- **TypeScript SDK**: Easy integration for developers
- **Demo Application**: React app showcasing the complete flow

## 🏗️ Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   User      │ ──► │  SDK        │ ──► │  Paymaster   │ ──► │  Target     │
│   Wallet    │     │  (TypeScript│     │  (Stylus)    │     │  Contract   │
└─────────────┘     └─────────────┘     └──────────────┘     └─────────────┘
    Signs              Formats             Verifies &           Executes
    Message            Request             Relays               Action
```

## 📦 Project Structure

```
stylustx/
├── contracts/paymaster/     # Stylus smart contract (Rust)
│   ├── src/lib.rs          # Main contract implementation
│   ├── Cargo.toml          # Rust dependencies
│   └── rust-toolchain.toml # Rust 1.79.0 for WASM compatibility
├── sdk/                     # TypeScript SDK
│   ├── src/client.ts       # StylusTxClient class
│   ├── src/types.ts        # Type definitions
│   └── src/utils/          # Hash computation utilities
├── demo/                    # React demo application
│   ├── src/App.tsx         # Main application
│   └── src/components/     # UI components
├── scripts/                 # Deployment scripts
│   ├── deploy-paymaster.sh # Deploy contract
│   └── initialize-paymaster.sh # Initialize contract
└── docs/                    # Documentation
```

## 🚀 Quick Start

### Prerequisites

- [Rust](https://rustup.rs/) (1.79.0)
- [cargo-stylus](https://github.com/OffchainLabs/cargo-stylus) (v0.5.6)
- [Node.js](https://nodejs.org/) (v18+)
- [Foundry](https://book.getfoundry.sh/) (for contract interaction)

### 1. Clone and Setup

```bash
git clone https://github.com/xxix-labs/stylustx.git
cd stylustx

# Copy environment template
cp .env.example .env
# Edit .env with your values
```

### 2. Build the Contract

```bash
cd contracts/paymaster
cargo build --release --target wasm32-unknown-unknown

# Verify Stylus compatibility
cargo stylus check --endpoint https://sepolia-rollup.arbitrum.io/rpc
```

### 3. Deploy to Arbitrum Sepolia

```bash
# Fund your wallet first:
# https://faucet.quicknode.com/arbitrum/sepolia

# Deploy the contract
./scripts/deploy-paymaster.sh

# Initialize with target contract
./scripts/initialize-paymaster.sh
```

### 4. Run the Demo

```bash
cd demo
npm install
npm run dev
```

## 📝 Contract API

### Core Functions

| Function | Description |
|----------|-------------|
| `initialize(target)` | Initialize contract with allowed target |
| `execute(from, to, value, data, nonce, deadline, v, r, s)` | Execute meta-transaction |
| `get_nonce(user)` | Get user's current nonce |
| `get_allowed_target()` | Get allowed target address |

### Admin Functions

| Function | Description |
|----------|-------------|
| `set_allowed_target(new_target)` | Update allowed target (owner only) |
| `pause()` / `unpause()` | Emergency pause (owner only) |
| `transfer_ownership(new_owner)` | Transfer ownership (owner only) |

## 🔧 SDK Usage

```typescript
import { StylusTxClient } from '@stylustx/sdk';
import { ethers } from 'ethers';

// Initialize client
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

const client = new StylusTxClient({
  paymasterAddress: '0x...',
  targetAddress: '0x...',
  signer,
  relayerPrivateKey: '0x...',  // For prototype only
  rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
});

// Send gasless transaction
const callData = contract.interface.encodeFunctionData('myFunction', [arg1, arg2]);
const result = await client.sendGasless(callData);
console.log('Transaction hash:', result.txHash);
```

## ⚙️ Configuration

### Environment Variables

```bash
# Deployment
DEPLOYER_PRIVATE_KEY=0x...     # Wallet for deployment
RPC_URL=https://sepolia-rollup.arbitrum.io/rpc

# Contract addresses (after deployment)
PAYMASTER_ADDRESS=0x...        # Deployed paymaster
TARGET_CONTRACT_ADDRESS=0x...  # Allowed target

# Relayer (prototype only - TESTNET KEYS ONLY!)
RELAYER_PRIVATE_KEY=0x...      # Wallet that pays gas
```

## 🔐 Security

### Implemented
- ECDSA signature verification via ecrecover
- Nonce tracking prevents replay attacks
- Deadline expiry for transaction validity
- Target allowlist restricts callable contracts
- Pausable for emergency stops

### Production Requirements
- Professional security audit
- Backend relayer service (not browser-based)
- Rate limiting and gas caps
- Secure key management (HSM)
- Monitoring and alerts

## 📊 Technical Specifications

| Metric | Value |
|--------|-------|
| Contract Size | 12.0 KB |
| WASM Size | 39.2 KB |
| Data Fee | ~0.000073 ETH |
| Stylus SDK | v0.6.0 |
| Rust Version | 1.79.0 |

## 🗺️ Roadmap

### Prototype (Current)
- [x] Stylus paymaster contract
- [x] TypeScript SDK
- [x] React demo application
- [ ] Deploy to Arbitrum Sepolia
- [ ] Demo live at public URL

### Production (Future)
- [ ] Professional security audit
- [ ] Backend relayer service
- [ ] Rate limiting & abuse prevention
- [ ] Multi-chain support
- [ ] Published npm package

## 📚 Resources

- [Stylus Documentation](https://docs.arbitrum.io/stylus/stylus-gentle-introduction)
- [Arbitrum Sepolia Faucet](https://faucet.quicknode.com/arbitrum/sepolia)
- [Arbiscan Sepolia](https://sepolia.arbiscan.io/)

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

Built with ❤️ by [XXIX Labs](https://github.com/xxix-labs)
