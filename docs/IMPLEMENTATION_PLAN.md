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
- [x] **Phase 1**: Environment & Foundation (Day 1) - COMPLETED
- [x] **Phase 2**: Stylus Contract (Day 2) - COMPLETED
- [ ] **Phase 3**: Deploy Contract (Day 3 Morning) - READY TO START
- [x] **Phase 4**: TypeScript SDK (Day 3 Afternoon) - COMPLETED
- [x] **Phase 5**: Demo Application (Day 4) - COMPLETED
- [ ] **Phase 6**: Deploy Demo (Day 5 Morning) - READY TO START
- [ ] **Phase 7**: Documentation & Polish (Day 5 Afternoon) - NOT STARTED

### Key Deliverables Status
- [ ] Contract deployed to Arbitrum Sepolia
- [x] SDK functional (stylustx-sdk package)
- [x] Demo application built (React + Vite)
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
- [x] Made initial commits and created PR to upstream repo

#### Session 2 (2026-02-04)
**Completed:**
- [x] Implemented complete StylusTx paymaster contract (~400 lines)
- [x] Added storage structure with nonce tracking and access control
- [x] Implemented execute() function with signature verification
- [x] Integrated ecrecover precompile for ECDSA verification
- [x] Added view functions (get_nonce, get_allowed_target, etc.)
- [x] Implemented admin functions (pause, set_allowed_target, transfer_ownership)
- [x] Created CallWithValue struct for MutatingCallContext
- [x] Added .cargo/config.toml for WASM build configuration
- [x] Updated to stylus-sdk v0.10.0 API (msg_sender, block_timestamp, log, call)
- [x] Contract compiles successfully to WASM (~10.7 KB optimized)
- [x] Committed and pushed Phase 2 implementation
- [x] Created contract ABI for SDK integration
- [x] Built TypeScript SDK (Phase 4):
  - StylusTxClient class for contract interaction
  - Message hash computation matching contract
  - ECDSA signature handling with ethers.js v6
  - Full TypeScript type definitions
- [x] Built Demo Application (Phase 5):
  - React + Vite application
  - MetaMask wallet connection
  - Gasless transaction signing UI
  - Transaction history display
  - Responsive dark theme design

#### Session 3 (2026-02-04 continued)
**Completed:**
- [x] Fixed WASM reference-types compatibility issue for Stylus deployment
- [x] Downgraded from stylus-sdk v0.10.0 to v0.6.0 (compatible with Stylus runtime)
- [x] Downgraded from Rust 1.87.0 to 1.79.0 (avoids reference-types WASM features)
- [x] Updated alloy-primitives/alloy-sol-types to v0.7.6 for compatibility
- [x] Removed stylus-core dependency (not needed for v0.6.x)
- [x] Changed #[external] to #[public] macro
- [x] Added unsafe blocks for RawCall::call() operations
- [x] Removed event logging (incompatible with older alloy version)
- [x] Contract passes `cargo stylus check` validation
- [x] Contract size: 12.0 KB, WASM data fee: 0.000073 ETH
- [x] Created deployment scripts (deploy-paymaster.sh, initialize-paymaster.sh)
- [x] Installed Foundry toolchain for contract interaction

**Pending:**
- [ ] Fund deployer wallet with Arbitrum Sepolia ETH
- [ ] Deploy contract to Arbitrum Sepolia
- [ ] Initialize contract with target address

**Deployer Wallet:**
- Address: 0x9E0279D2E15BA1441C29b4Bc866b516d9814cA71
- Required funds: ~0.001 ETH on Arbitrum Sepolia
- Faucet: https://faucet.quicknode.com/arbitrum/sepolia

**Notes:**
- Stylus runtime doesn't support WASM reference-types feature
- Newer Rust compilers (1.82+) enable reference-types by default
- Solution: Use Rust 1.79.0 + stylus-sdk 0.6.0 for compatibility
- cargo-stylus v0.5.6 works with stylus-sdk 0.6.0

---

## 📂 Project Structure

```
stylustx/
├── contracts/paymaster/           # Stylus smart contract (Rust)
│   ├── Cargo.toml                 # Dependencies & build config ✅
│   ├── Stylus.toml                # Stylus workspace config ✅
│   ├── rust-toolchain.toml        # Rust version pinning ✅
│   ├── src/
│   │   └── lib.rs                 # Main contract (~400 lines) ✅
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
**Status**: ✅ COMPLETED

### Objectives
- ✅ Implement core Stylus smart contract in Rust
- ✅ Build signature verification logic
- ✅ Implement nonce management
- ✅ Contract compiles to WASM

### Tasks Checklist

#### 2.1 Implement Core Contract Logic
- [x] Create storage structure in `contracts/paymaster/src/lib.rs`:
  - `owner: Address`
  - `nonces: mapping(address => uint256)`
  - `allowed_target: Address`
  - `paused: bool`
  - `initialized: bool`

- [x] Implement `initialize()` function
- [x] Implement `execute()` function (main meta-tx handler)
- [x] Implement view functions (`get_nonce`, `get_allowed_target`, `is_paused`, etc.)
- [x] Implement admin functions (`set_allowed_target`, `pause`, `unpause`, `transfer_ownership`)

#### 2.2 Implement Helper Functions
- [x] `compute_hash()` - Calculate message hash
- [x] `ecrecover_address()` - ECDSA signature recovery using ecrecover precompile

#### 2.3 Define Events
- [x] `MetaTxExecuted(address indexed user, address indexed target, uint256 nonce, bool success)`
- [x] `TargetUpdated(address indexed old_target, address indexed new_target)`
- [x] `PausedStateChanged(bool paused)`
- [x] `OwnershipTransferred(address indexed previous_owner, address indexed new_owner)`

#### 2.4 Build & Test
- [x] Compile: `cargo build --release` → Success
- [x] WASM generated: ~10.7 KB optimized
- [x] Export ABI: `cargo stylus export-abi` → Success

### Implementation Details
- **Lines of Code**: ~400 lines (significantly more than planned 150 for thoroughness)
- **Key Features**:
  - Complete signature verification with ecrecover precompile
  - Nonce-based replay protection
  - Deadline-based expiration
  - Target contract allowlist
  - Owner-based access control
  - Emergency pause mechanism
  - Comprehensive error types
- **Contract Address**: target/wasm32-unknown-unknown/release/stylustx_paymaster.wasm (36 KB raw, 10.7 KB optimized)

---

## Phase 3: Deploy Contract to Arbitrum Sepolia (Day 3 Morning)
**Duration**: 1-2 hours
**Status**: 🟡 READY TO START

### Objectives
- Deploy paymaster contract to Arbitrum Sepolia testnet
- Initialize contract with target address
- Verify deployment on Arbiscan
- Export and save ABI for SDK

### Prerequisites
- [ ] Get testnet wallet funded with Arbitrum Sepolia ETH (~0.1 ETH)
- [ ] Create `.env` file with `DEPLOYER_PRIVATE_KEY`
- [ ] Have target contract address (can be simple counter or dummy contract)

### Tasks Checklist

#### 3.1 Prepare for Deployment
- [ ] Get Arbitrum Sepolia ETH from faucet: https://faucet.quicknode.com/arbitrum/sepolia
- [ ] Create `.env` file from `.env.example`
- [ ] Add deployer private key to `.env`

#### 3.2 Deploy Contract
- [ ] Deploy: `cargo stylus deploy -e https://sepolia-rollup.arbitrum.io/rpc --private-key=$DEPLOYER_PRIVATE_KEY`
- [ ] Save deployed contract address to `.env` as `PAYMASTER_ADDRESS`
- [ ] Verify deployment succeeded

#### 3.3 Initialize Contract
- [ ] Call `initialize(target_address)` on deployed contract
- [ ] Verify owner is set correctly
- [ ] Verify target is set correctly

#### 3.4 Export ABI
- [ ] Export ABI: `cargo stylus export-abi > contracts/paymaster/abi.json`
- [ ] Commit ABI file for SDK usage

#### 3.5 Verify on Arbiscan
- [ ] View contract on https://sepolia.arbiscan.io/address/{PAYMASTER_ADDRESS}
- [ ] Verify bytecode is present
- [ ] Document contract address in README

### Success Criteria
- Contract deployed to Arbitrum Sepolia
- Contract address saved and documented
- ABI exported for SDK integration
- Can view contract on Arbiscan Sepolia

---

## Phase 4: TypeScript SDK (Day 3 Afternoon)
**Duration**: 2-3 hours
**Status**: ✅ COMPLETED

### Implementation Details
- **StylusTxClient class**: Main SDK interface for gasless transactions
- **Message hashing**: Exact match with contract's compute_hash() function
- **Signature handling**: ECDSA signature creation and parsing with ethers.js v6
- **Type definitions**: Full TypeScript types for all SDK interfaces
- **Constants**: Chain configs, ABI, domain separator

### Files Created
- `sdk/src/client.ts` - Main StylusTxClient class
- `sdk/src/types.ts` - TypeScript type definitions
- `sdk/src/constants.ts` - Contract ABI, chain configs
- `sdk/src/utils/hashing.ts` - Message hash computation
- `sdk/src/index.ts` - Public exports

---

## Phase 5: Demo Application (Day 4)
**Duration**: 3-4 hours
**Status**: ✅ COMPLETED

### Implementation Details
- **React + Vite**: Modern frontend stack
- **MetaMask integration**: Wallet connection and network switching
- **Gasless TX signing**: Sign transactions without paying gas
- **Transaction history**: Track signed and executed transactions
- **Responsive design**: Dark theme, mobile-friendly

### Files Created
- `demo/src/App.tsx` - Main application component
- `demo/src/hooks/useWallet.ts` - Wallet connection hook
- `demo/src/components/WalletConnect.tsx` - Wallet UI
- `demo/src/components/GaslessTxForm.tsx` - Transaction form
- `demo/src/components/StatusDisplay.tsx` - Transaction history
- `demo/src/App.css` - Styling

---

## Phase 6-7: Remaining Work
(To be completed after contract deployment)

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

### Completed
- ✅ Phase 1: Environment & Foundation
- ✅ Phase 2: Stylus Paymaster Contract (~400 lines Rust)
- ✅ Phase 4: TypeScript SDK (stylustx-sdk)
- ✅ Phase 5: Demo Application (React + Vite)

### To Continue Development:
1. **Phase 3 - Deploy Contract**:
   - Get testnet wallet funded with Arbitrum Sepolia ETH (~0.1 ETH)
   - Create `.env` file with `DEPLOYER_PRIVATE_KEY`
   - Deploy: `cargo stylus deploy -e https://sepolia-rollup.arbitrum.io/rpc --private-key=$DEPLOYER_PRIVATE_KEY`
   - Initialize contract with target address

2. **Phase 6 - Deploy Demo**:
   - Update demo `.env` with deployed contract addresses
   - Deploy demo to Vercel/Netlify
   - Test full gasless transaction flow

3. **Phase 7 - Documentation & Polish**:
   - Create README with setup instructions
   - Document API reference
   - Prepare grant proposal materials

### Version Notes:
- **stylus-sdk**: v0.10.0 (updated from guide's v0.6.0)
- **alloy-primitives/sol-types**: v1.2 (updated for compatibility)
- **cargo-stylus**: v0.10.0 (requires Stylus.toml + rust-toolchain.toml)
- **Rust**: v1.87.0 (pinned in rust-toolchain.toml)

---

**Last Updated**: 2026-02-04
**Plan Status**: Phases 1, 2, 4, 5 Complete - Ready for Deployment
**Next Phase**: Phase 3 - Deploy Contract to Arbitrum Sepolia

---

_This implementation plan is a living document. Update it as work progresses to maintain context for future sessions._
