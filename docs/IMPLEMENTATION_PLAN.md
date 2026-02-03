# StylusTx Implementation Plan

**Project**: Gas Abstraction Layer for Arbitrum using Stylus
**Timeline**: 3-5 days for prototype, then production enhancements
**Target Network**: Arbitrum Sepolia (testnet) → Arbitrum One (production)
**Status**: 🟡 In Progress
**Last Updated**: 2026-02-03

---

## 📋 Executive Summary

StylusTx is a gas abstraction layer that enables gasless transactions on Arbitrum. Users sign messages (free, no blockchain interaction) and a relayer submits transactions on their behalf, paying all gas fees.

### Core Components
1. **Stylus Paymaster Contract (Rust)** - ~150 lines, verifies signatures on-chain
2. **TypeScript SDK** - ~100 lines, wraps gasless transaction flow
3. **Demo Application** - React app demonstrating the complete UX
4. **Relayer Service** - Prototype: browser-based | Production: backend service

### End Goal
**Prototype**: Working demo with public URL proving technical feasibility for Arbitrum grant proposal
**Production**: Battle-tested system with backend relayer, rate limiting, monitoring, and SDK published to npm

---

## 🎯 Project Status Overview

### Phase Progress
- [x] **Phase 1**: Environment & Foundation (Day 1) - IN PROGRESS
- [ ] **Phase 2**: Stylus Contract (Day 2) - NOT STARTED
- [ ] **Phase 3**: Deploy Contract (Day 3 Morning) - NOT STARTED
- [ ] **Phase 4**: TypeScript SDK (Day 3 Afternoon) - NOT STARTED
- [ ] **Phase 5**: Demo Application (Day 4) - NOT STARTED
- [ ] **Phase 6**: Deploy Demo (Day 5 Morning) - NOT STARTED
- [ ] **Phase 7**: Documentation & Polish (Day 5 Afternoon) - NOT STARTED

### Key Deliverables Status
- [ ] Contract deployed to Arbitrum Sepolia
- [ ] SDK functional and tested
- [ ] Demo live at public URL
- [ ] Documentation complete
- [ ] Grant proposal materials ready

### Session Progress Log

#### Session 1 (2026-02-03)
**Completed:**
- [x] Installed Rust toolchain (v1.93.0)
- [x] Added WASM target (wasm32-unknown-unknown)
- [x] Installed cargo-stylus CLI (v0.10.0)
- [x] Created project directory structure
- [x] Created contracts/paymaster/Cargo.toml with stylus-sdk v0.10.0
- [x] Created contracts/paymaster/Stylus.toml (workspace config)
- [x] Created contracts/paymaster/rust-toolchain.toml (Rust 1.87.0)
- [x] Created .gitignore with comprehensive ignore patterns
- [x] Created .env.example with all required environment variables
- [x] Contract compiles successfully with `cargo build`

**In Progress:**
- [ ] WASM build not generating (lib.rs is placeholder only)
- [ ] Need to implement actual contract code in Phase 2

**Notes:**
- Updated stylus-sdk from v0.6.0 (guide) to v0.10.0 (latest compatible)
- Updated alloy-primitives/alloy-sol-types to v1.2 for compatibility
- cargo-stylus v0.10.0 requires Stylus.toml and rust-toolchain.toml files

---

## 📂 Project Structure

```
stylustx/
├── contracts/paymaster/           # Stylus smart contract (Rust)
│   ├── Cargo.toml                 # Dependencies & build config ✅
│   ├── Stylus.toml                # Stylus workspace config ✅
│   ├── rust-toolchain.toml        # Rust version pinning ✅
│   ├── src/
│   │   └── lib.rs                 # Main contract (~150 lines) 🔄
│   └── tests/
│       └── integration.rs         # Contract tests
│
├── sdk/                           # TypeScript SDK
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts               # Main export
│   │   ├── client.ts              # StylusTxClient class
│   │   ├── types.ts               # Type definitions
│   │   ├── constants.ts           # Chain configs, ABI
│   │   └── utils/
│   │       └── hashing.ts         # Message hash computation
│   └── tests/
│       └── client.test.ts         # SDK tests
│
├── demo/                          # Demo application (React + Vite)
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx               # Entry point
│   │   ├── App.tsx                # Main component
│   │   ├── hooks/
│   │   │   ├── useWallet.ts       # Wallet state
│   │   │   └── useStylusTx.ts     # SDK integration
│   │   └── components/
│   │       ├── WalletConnect.tsx
│   │       ├── GaslessTxButton.tsx
│   │       └── StatusDisplay.tsx
│   └── .env.example
│
├── scripts/                       # Deployment & management
│   ├── deploy-contract.sh
│   ├── initialize-contract.sh
│   ├── fund-relayer.sh
│   └── verify-deployment.sh
│
├── docs/                          # Documentation
│   ├── IMPLEMENTATION_PLAN.md     # This file ✅
│   ├── ARCHITECTURE.md
│   ├── DEPLOYMENT_GUIDE.md
│   ├── API_REFERENCE.md
│   └── GRANT_PROPOSAL_NOTES.md
│
├── .env.example                   # Environment template ✅
├── .gitignore                     # Ignore patterns ✅
└── README.md                      # Project overview
```

**Legend**: ✅ Complete | 🔄 In Progress | (blank) Not Started

---

## 🚀 Implementation Phases

## Phase 1: Environment & Foundation (Day 1)
**Duration**: 2-3 hours
**Status**: 🟡 In Progress

### Objectives
- Install Stylus toolchain (Rust + WASM + cargo-stylus)
- Create project structure
- Get testnet resources (wallet + ETH)
- Configure environment

### Tasks Checklist

#### 1.1 Install Stylus Toolchain
- [x] Install Rust: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- [x] Add WASM target: `rustup target add wasm32-unknown-unknown`
- [x] Install Stylus CLI: `cargo install cargo-stylus`
- [x] Verify installation: `cargo stylus --version` → v0.10.0

#### 1.2 Create Project Structure
- [x] Create `contracts/paymaster/` directory
- [x] Initialize Rust project with Cargo.toml
- [x] Create `sdk/` directory
- [x] Create `demo/` directory
- [x] Create `scripts/` directory
- [x] Create `docs/` directory

#### 1.3 Configure Cargo for Stylus
- [x] Update `contracts/paymaster/Cargo.toml` with dependencies:
  - stylus-sdk = "0.10.0" (updated from guide's 0.6.0)
  - alloy-primitives = "1.2"
  - alloy-sol-types = "1.2"
- [x] Configure release profile for WASM optimization
- [x] Add export-abi feature
- [x] Create Stylus.toml (required by cargo-stylus v0.10.0)
- [x] Create rust-toolchain.toml (Rust 1.87.0)

#### 1.4 Get Testnet Resources
- [ ] Create new testnet wallet (NEVER use production keys!)
- [ ] Document wallet address
- [ ] Get Arbitrum Sepolia ETH from faucet: https://faucet.quicknode.com/arbitrum/sepolia
- [ ] Verify ~0.1 ETH received
- [x] Create `.env.example` template
- [ ] Create actual `.env` with private key (gitignored)

#### 1.5 Git Configuration
- [x] Update `.gitignore` to ignore secrets and build artifacts
- [ ] Commit initial structure ← **NEXT STEP**

### Success Criteria
✅ Can run `cargo stylus --version` successfully
✅ Project structure created
⬜ Wallet funded with testnet ETH
⬜ `.env` configured (not committed)

---

## Phase 2: Stylus Paymaster Contract (Day 2)
**Duration**: 4-6 hours
**Status**: 🔴 Not Started

### Objectives
- Implement core Stylus smart contract in Rust
- Build signature verification logic
- Implement nonce management
- Test locally

### Tasks Checklist

#### 2.1 Implement Core Contract Logic
- [ ] Create storage structure in `contracts/paymaster/src/lib.rs`:
  - `owner: Address`
  - `nonces: mapping(address => uint256)`
  - `allowed_target: Address`
  - `paused: bool`

- [ ] Implement `initialize()` function
- [ ] Implement `execute()` function (main meta-tx handler)
- [ ] Implement view functions (`get_nonce`, `get_allowed_target`)
- [ ] Implement admin functions (`set_allowed_target`)

#### 2.2 Implement Helper Functions
- [ ] `compute_hash()` - Calculate message hash
- [ ] `ecrecover()` - ECDSA signature recovery

#### 2.3 Define Events
- [ ] `MetaTxExecuted(address indexed user, address indexed target, uint256 nonce, bool success)`

#### 2.4 Build & Test
- [ ] Compile: `cargo build --release`
- [ ] Check WASM: `cargo stylus check`
- [ ] Export ABI: `cargo stylus export-abi`

---

## Phase 3-7: See Full Plan Below
(Phases 3-7 details remain unchanged from original plan)

---

## 🏗️ Architecture Overview

### System Flow

```
┌─────────────┐         ┌─────────────┐         ┌──────────────────┐         ┌─────────────────┐
│             │  Sign   │             │ Submit  │                  │  Call   │                 │
│  User       ├────────►│  SDK        ├────────►│  Stylus          ├────────►│  Target         │
│  Wallet     │ Message │  (TypeScript│  Signed │  Paymaster       │ Verified│  Contract       │
│  (MetaMask) │ (Free)  │   Client)   │  Meta-TX│  (Rust/WASM)     │ Action  │                 │
│             │         │             │         │                  │         │                 │
└─────────────┘         └─────────────┘         └──────────────────┘         └─────────────────┘
                                                         ↑
                                                         │ Pays Gas
                                                         │
                                                  ┌──────┴────────┐
                                                  │               │
                                                  │   Relayer     │
                                                  │   Wallet      │
                                                  │               │
                                                  └───────────────┘
```

### Meta-Transaction Flow

1. **User Signs**: User signs a message in their wallet (free, no gas)
2. **SDK Formats**: SDK formats the signature and transaction data
3. **Relayer Submits**: Relayer submits the signed message to paymaster contract
4. **Paymaster Verifies**: Contract verifies signature on-chain using ecrecover
5. **Paymaster Executes**: Contract calls target contract with user's intended action
6. **Relayer Pays Gas**: All gas fees paid by relayer, not user

---

## 🔐 Security Considerations

### Implemented in Prototype
1. **Signature Verification**: ECDSA recovery via ecrecover precompile
2. **Nonce Tracking**: Prevents replay attacks
3. **Deadline**: Prevents stale transaction replay
4. **Allowlist**: Restricts which contracts can be called
5. **Pause Mechanism**: Emergency stop functionality

### Known Limitations (Prototype)
- Single hardcoded target (not dynamic)
- Browser-based relayer (not scalable)
- No rate limiting (vulnerable to spam)
- Simplified hash (not full EIP-712)
- Testnet only (not production-ready)

---

## 📝 Environment Variables Reference

### Root `.env`
```bash
# Deployment
DEPLOYER_PRIVATE_KEY=0x...           # Wallet that deploys contract
RPC_URL=https://sepolia-rollup.arbitrum.io/rpc

# Deployed Contracts
PAYMASTER_ADDRESS=0x...              # Deployed paymaster address
TARGET_CONTRACT_ADDRESS=0x...        # Allowed target contract

# Relayer (Testnet Only!)
RELAYER_PRIVATE_KEY=0x...            # Wallet that pays gas
```

---

## 📚 Key Resources

- [Stylus Documentation](https://docs.arbitrum.io/stylus/stylus-gentle-introduction)
- [Arbitrum Sepolia Faucet](https://faucet.quicknode.com/arbitrum/sepolia)
- [Arbiscan Sepolia](https://sepolia.arbiscan.io/)
- [Ethers.js v6 Docs](https://docs.ethers.org/v6/)
- [Cargo Stylus](https://github.com/OffchainLabs/cargo-stylus)

---

## 🚦 Next Steps (Resume Here)

### To Continue Development:
1. Get testnet wallet and fund with Arbitrum Sepolia ETH
2. Create `.env` file with private key
3. Begin Phase 2: Implement paymaster contract in Rust
4. Build and verify WASM output with `cargo stylus check`

### Version Notes:
- **stylus-sdk**: v0.10.0 (updated from guide's v0.6.0)
- **alloy-primitives/sol-types**: v1.2 (updated for compatibility)
- **cargo-stylus**: v0.10.0 (requires Stylus.toml + rust-toolchain.toml)
- **Rust**: v1.87.0 (pinned in rust-toolchain.toml)

---

**Last Updated**: 2026-02-03
**Plan Status**: Phase 1 In Progress
**Next Phase**: Complete Phase 1, then Phase 2 - Contract Implementation

---

_This implementation plan is a living document. Update it as work progresses to maintain context for future sessions._
