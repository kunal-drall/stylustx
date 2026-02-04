#!/bin/bash
# Initialize StylusTx Paymaster Contract
#
# This script initializes the deployed paymaster contract with a target address.
# The target address is the contract that users can call gaslessly through the paymaster.
#
# Prerequisites:
# 1. Foundry (cast) installed
# 2. PAYMASTER_ADDRESS and TARGET_CONTRACT_ADDRESS set in .env
# 3. DEPLOYER_PRIVATE_KEY set in .env
#
# Usage: ./scripts/initialize-paymaster.sh

set -e

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "Error: .env file not found"
    exit 1
fi

# Check required environment variables
if [ -z "$DEPLOYER_PRIVATE_KEY" ]; then
    echo "Error: DEPLOYER_PRIVATE_KEY not set in .env"
    exit 1
fi

if [ -z "$PAYMASTER_ADDRESS" ] || [ "$PAYMASTER_ADDRESS" == "0x_paymaster_address_after_deployment" ]; then
    echo "Error: PAYMASTER_ADDRESS not set in .env"
    echo "Please deploy the contract first using ./scripts/deploy-paymaster.sh"
    exit 1
fi

if [ -z "$TARGET_CONTRACT_ADDRESS" ] || [ "$TARGET_CONTRACT_ADDRESS" == "0x_target_contract_address" ]; then
    echo "Error: TARGET_CONTRACT_ADDRESS not set in .env"
    echo "Please set the target contract address that users can call gaslessly"
    exit 1
fi

RPC_URL="${RPC_URL:-https://sepolia-rollup.arbitrum.io/rpc}"

echo "=== Initializing StylusTx Paymaster ==="
echo "Paymaster Address: $PAYMASTER_ADDRESS"
echo "Target Contract: $TARGET_CONTRACT_ADDRESS"
echo "RPC URL: $RPC_URL"
echo ""

# Ensure foundry path is set
export PATH="$HOME/.foundry/bin:$PATH"

# Check if already initialized
IS_INITIALIZED=$(cast call $PAYMASTER_ADDRESS "is_initialized()(bool)" --rpc-url $RPC_URL 2>/dev/null || echo "error")

if [ "$IS_INITIALIZED" == "true" ]; then
    echo "Contract is already initialized!"
    CURRENT_TARGET=$(cast call $PAYMASTER_ADDRESS "get_allowed_target()(address)" --rpc-url $RPC_URL)
    echo "Current target: $CURRENT_TARGET"
    exit 0
fi

echo "Sending initialization transaction..."

# Initialize the contract
cast send $PAYMASTER_ADDRESS \
    "initialize(address)" \
    $TARGET_CONTRACT_ADDRESS \
    --private-key $DEPLOYER_PRIVATE_KEY \
    --rpc-url $RPC_URL

echo ""
echo "=== Initialization Complete ==="
echo ""

# Verify initialization
echo "Verifying initialization..."
IS_INITIALIZED=$(cast call $PAYMASTER_ADDRESS "is_initialized()(bool)" --rpc-url $RPC_URL)
OWNER=$(cast call $PAYMASTER_ADDRESS "get_owner()(address)" --rpc-url $RPC_URL)
TARGET=$(cast call $PAYMASTER_ADDRESS "get_allowed_target()(address)" --rpc-url $RPC_URL)

echo "Is Initialized: $IS_INITIALIZED"
echo "Owner: $OWNER"
echo "Allowed Target: $TARGET"
echo ""
echo "Contract is ready for use!"
