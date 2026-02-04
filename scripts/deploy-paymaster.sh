#!/bin/bash
# Deploy StylusTx Paymaster Contract to Arbitrum Sepolia
#
# Prerequisites:
# 1. Rust and cargo-stylus installed
# 2. DEPLOYER_PRIVATE_KEY set in .env
# 3. Wallet funded with ~0.001 ETH on Arbitrum Sepolia
#    Get testnet ETH from: https://faucet.quicknode.com/arbitrum/sepolia
#
# Usage: ./scripts/deploy-paymaster.sh

set -e

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "Error: .env file not found"
    echo "Copy .env.example to .env and fill in your values"
    exit 1
fi

# Check required environment variables
if [ -z "$DEPLOYER_PRIVATE_KEY" ]; then
    echo "Error: DEPLOYER_PRIVATE_KEY not set in .env"
    exit 1
fi

RPC_URL="${RPC_URL:-https://sepolia-rollup.arbitrum.io/rpc}"

echo "=== StylusTx Paymaster Deployment ==="
echo "Network: Arbitrum Sepolia"
echo "RPC URL: $RPC_URL"

# Get wallet address
if command -v cast &> /dev/null; then
    WALLET_ADDRESS=$(cast wallet address --private-key $DEPLOYER_PRIVATE_KEY)
    echo "Deployer Address: $WALLET_ADDRESS"

    # Check balance
    BALANCE=$(cast balance $WALLET_ADDRESS --rpc-url $RPC_URL)
    echo "Wallet Balance: $BALANCE wei"

    if [ "$BALANCE" == "0" ]; then
        echo ""
        echo "Error: Wallet has no funds!"
        echo "Please fund the wallet with Arbitrum Sepolia ETH from:"
        echo "  https://faucet.quicknode.com/arbitrum/sepolia"
        echo ""
        echo "Wallet address to fund: $WALLET_ADDRESS"
        exit 1
    fi
fi

echo ""
echo "Building and deploying contract..."
echo ""

# Navigate to contract directory
cd contracts/paymaster

# Source cargo environment
source $HOME/.cargo/env 2>/dev/null || true

# Deploy the contract
cargo stylus deploy \
    --private-key $DEPLOYER_PRIVATE_KEY \
    --endpoint $RPC_URL

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Next steps:"
echo "1. Copy the deployed contract address from the output above"
echo "2. Update PAYMASTER_ADDRESS in your .env file"
echo "3. Run ./scripts/initialize-paymaster.sh to initialize the contract"
