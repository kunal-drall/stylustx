# StylusTx Deployment Guide

Step-by-step guide to deploy StylusTx to Arbitrum.

## Prerequisites

### Tools Required

1. **Rust 1.79.0** (specific version required for Stylus compatibility)
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   rustup install 1.79.0
   rustup target add wasm32-unknown-unknown
   ```

2. **cargo-stylus v0.5.6**
   ```bash
   cargo install cargo-stylus --version 0.5.6 --locked
   ```

3. **Node.js 18+**
   ```bash
   # Using nvm
   nvm install 18
   nvm use 18
   ```

4. **Foundry** (for contract interaction)
   ```bash
   curl -L https://foundry.paradigm.xyz | bash
   foundryup
   ```

### Wallet Setup

1. Create a **new wallet** for deployment (never use production keys!)
2. Export the private key
3. Fund with testnet ETH:
   - **Arbitrum Sepolia**: https://faucet.quicknode.com/arbitrum/sepolia
   - Need ~0.001 ETH for contract deployment
   - Need ~0.01 ETH for relayer operations

## Environment Configuration

Create `.env` in the project root:

```bash
# Deployment
DEPLOYER_PRIVATE_KEY=0x...     # Wallet that deploys contract
RPC_URL=https://sepolia-rollup.arbitrum.io/rpc

# After deployment, add:
PAYMASTER_ADDRESS=0x...        # Deployed paymaster address
TARGET_CONTRACT_ADDRESS=0x...  # Contract that can be called

# Relayer (TESTNET ONLY!)
RELAYER_PRIVATE_KEY=0x...      # Wallet that pays gas fees
```

## Step 1: Build Contract

```bash
cd contracts/paymaster

# Build for WASM target
cargo build --release --target wasm32-unknown-unknown

# Verify Stylus compatibility
cargo stylus check --endpoint https://sepolia-rollup.arbitrum.io/rpc
```

Expected output:
```
contract size: 12.0 KB
wasm data fee: 0.000073 ETH
```

## Step 2: Deploy Contract

### Option A: Using the deploy script

```bash
./scripts/deploy-paymaster.sh
```

### Option B: Manual deployment

```bash
cd contracts/paymaster

cargo stylus deploy \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --endpoint https://sepolia-rollup.arbitrum.io/rpc
```

**Save the deployed contract address!** Add it to `.env`:
```bash
PAYMASTER_ADDRESS=0x<deployed-address>
```

## Step 3: Initialize Contract

The contract must be initialized with a target contract address.

### Option A: Using the initialize script

```bash
./scripts/initialize-paymaster.sh
```

### Option B: Manual initialization

```bash
cast send $PAYMASTER_ADDRESS \
  "initialize(address)" \
  $TARGET_CONTRACT_ADDRESS \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --rpc-url $RPC_URL
```

## Step 4: Verify Deployment

```bash
# Check initialization
cast call $PAYMASTER_ADDRESS "is_initialized()" --rpc-url $RPC_URL
# Expected: 0x0000...0001 (true)

# Check allowed target
cast call $PAYMASTER_ADDRESS "get_allowed_target()" --rpc-url $RPC_URL
# Expected: Your target contract address

# Check owner
cast call $PAYMASTER_ADDRESS "owner()" --rpc-url $RPC_URL
# Expected: Deployer address
```

View on Arbiscan: `https://sepolia.arbiscan.io/address/$PAYMASTER_ADDRESS`

## Step 5: Configure Gas Policies (Optional)

### Set Token Gate

Require users to hold a specific token:

```bash
# ERC-20: Require 100 tokens
cast send $PAYMASTER_ADDRESS \
  "set_required_token(address,uint256,bool)" \
  $TOKEN_ADDRESS 100000000000000000000 false \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --rpc-url $RPC_URL

# ERC-721: Require at least 1 NFT
cast send $PAYMASTER_ADDRESS \
  "set_required_token(address,uint256,bool)" \
  $NFT_ADDRESS 1 true \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --rpc-url $RPC_URL
```

### Set Daily Limit

```bash
# 50 transactions per user per day
cast send $PAYMASTER_ADDRESS \
  "set_daily_tx_limit(uint256)" \
  50 \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --rpc-url $RPC_URL
```

### Set Max Gas Per Transaction

```bash
# 500,000 gas limit per transaction
cast send $PAYMASTER_ADDRESS \
  "set_max_gas_per_tx(uint256)" \
  500000 \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --rpc-url $RPC_URL
```

## Step 6: Deploy Relayer Service

### Option A: Local development

```bash
cd relayer
npm install

# Create .env
cp .env.example .env
# Edit with your values

npm run dev
```

### Option B: Production deployment

1. **Build**
   ```bash
   npm run build
   ```

2. **Configure environment** on your host:
   - `PAYMASTER_ADDRESS`: Deployed contract
   - `RELAYER_PRIVATE_KEY`: Funded wallet
   - `RPC_URL`: Arbitrum RPC endpoint
   - `PORT`: Service port (default: 3000)

3. **Run with PM2**
   ```bash
   pm2 start dist/index.js --name stylustx-relayer
   ```

4. **Set up HTTPS** (required for production)
   ```nginx
   server {
       listen 443 ssl;
       server_name relayer.yourdomain.com;

       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

## Step 7: Deploy Demo Application

### Option A: Vercel (recommended)

```bash
cd demo
npm install

# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

Set environment variables in Vercel dashboard:
- `VITE_PAYMASTER_ADDRESS`
- `VITE_TARGET_ADDRESS`
- `VITE_RPC_URL`
- `VITE_CHAIN_ID`

### Option B: Static hosting

```bash
cd demo
npm install
npm run build

# Upload dist/ to your host
```

## Verification Checklist

- [ ] Contract deployed to Arbitrum
- [ ] Contract initialized with target
- [ ] Contract visible on Arbiscan
- [ ] Relayer wallet funded
- [ ] Relayer service running
- [ ] Demo app accessible
- [ ] Test transaction succeeds

## Troubleshooting

### "Contract doesn't compile"

```bash
# Ensure correct Rust version
rustup override set 1.79.0

# Update dependencies if needed
cargo update indexmap@2.13.0 --precise 2.6.0
```

### "WASM reference-types error"

This occurs with Rust 1.82+. Use Rust 1.79.0:
```bash
rustup install 1.79.0
rustup override set 1.79.0
```

### "Insufficient funds"

Get testnet ETH from:
- https://faucet.quicknode.com/arbitrum/sepolia
- https://www.alchemy.com/faucets/arbitrum-sepolia

### "Signature verification fails"

- Ensure EIP-712 domain matches contract
- Check chain ID is correct
- Verify nonce is current

### "Transaction reverted"

Check:
1. Contract is initialized: `is_initialized() = true`
2. Contract not paused: `is_paused() = false`
3. Target is allowed: `get_allowed_target()` matches
4. User meets policy: `can_user_execute()` returns true

## Security Notes

1. **Never use mainnet private keys in .env files**
2. **Keep relayer wallet balance minimal** - only what's needed
3. **Monitor relayer balance** - set up alerts
4. **Use HTTPS** for relayer in production
5. **Consider rate limiting** beyond contract policies
6. **Audit before mainnet** - get professional security review
