//! StylusTx Paymaster Contract
//!
//! A gas abstraction layer for Arbitrum that enables gasless transactions.
//! Users sign meta-transactions off-chain, and a relayer submits them to this
//! contract which verifies the signature and executes the intended action.
//!
//! ## Security Features
//! - ECDSA signature verification with malleability protection (EIP-2)
//! - Nonce-based replay protection
//! - Chain ID and contract address in signature to prevent cross-chain/cross-contract replay
//! - Reentrancy guard for defense in depth
//! - Zero-address validation
//! - Emergency pause functionality

#![cfg_attr(not(feature = "export-abi"), no_main)]
extern crate alloc;

use alloc::vec::Vec;
use stylus_sdk::{
    alloy_primitives::{Address, FixedBytes, U256},
    prelude::*,
    crypto::keccak,
    call::RawCall,
    msg, block, contract,
};
use alloy_sol_types::{sol, SolError};

// Type alias for B256 (32-byte hash)
type B256 = FixedBytes<32>;

// =============================================================================
// CONSTANTS
// =============================================================================

/// Domain separator for message hashing (EIP-712 style)
const DOMAIN_NAME: &[u8] = b"StylusTx";
const DOMAIN_VERSION: &[u8] = b"1";

/// Address of the ecrecover precompile
const ECRECOVER_PRECOMPILE: Address = Address::new([
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1
]);

/// secp256k1 curve order divided by 2 (for signature malleability check)
/// n/2 = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0
const SECP256K1_N_DIV_2: [u8; 32] = [
    0x7F, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
    0x5D, 0x57, 0x6E, 0x73, 0x57, 0xA4, 0x50, 0x1D,
    0xDF, 0xE9, 0x2F, 0x46, 0x68, 0x1B, 0x20, 0xA0,
];

/// Arbitrum Sepolia Chain ID
const CHAIN_ID: u64 = 421614;

// =============================================================================
// STORAGE
// =============================================================================

sol_storage! {
    #[entrypoint]
    pub struct StylusTxPaymaster {
        /// Contract owner (can update settings)
        address owner;
        /// Nonce tracking per user to prevent replay attacks
        mapping(address => uint256) nonces;
        /// Allowed target contract (simplified for prototype)
        address allowed_target;
        /// Emergency pause flag
        bool paused;
        /// Whether the contract has been initialized
        bool initialized;
        /// Reentrancy guard
        bool locked;
    }
}

// =============================================================================
// ERRORS
// =============================================================================

sol! {
    /// Contract is already initialized
    error AlreadyInitialized();
    /// Contract is not initialized
    error NotInitialized();
    /// Contract is paused
    error ContractPaused();
    /// Caller is not the owner
    error NotOwner();
    /// Transaction deadline has expired
    error DeadlineExpired(uint256 deadline, uint256 current_time);
    /// Target contract is not in allowlist
    error TargetNotAllowed(address target);
    /// Nonce mismatch - possible replay attack
    error InvalidNonce(uint256 expected, uint256 provided);
    /// Signature verification failed
    error InvalidSignature(address expected, address recovered);
    /// Signature s value is too high (malleability)
    error SignatureMalleability();
    /// External call failed
    error CallFailed();
    /// ecrecover precompile failed
    error EcrecoverFailed();
    /// Zero address not allowed
    error ZeroAddress();
    /// Reentrancy detected
    error ReentrancyGuard();
}

// =============================================================================
// IMPLEMENTATION
// =============================================================================

#[public]
impl StylusTxPaymaster {
    // =========================================================================
    // INITIALIZATION
    // =========================================================================

    /// Initialize the paymaster contract
    /// Can only be called once
    /// @param target The initial allowed target contract address
    pub fn initialize(&mut self, target: Address) -> Result<(), Vec<u8>> {
        if self.initialized.get() {
            return Err(AlreadyInitialized {}.abi_encode());
        }

        // Validate target is not zero address
        if target.is_zero() {
            return Err(ZeroAddress {}.abi_encode());
        }

        self.owner.set(msg::sender());
        self.allowed_target.set(target);
        self.initialized.set(true);
        self.paused.set(false);
        self.locked.set(false);

        Ok(())
    }

    // =========================================================================
    // CORE META-TRANSACTION EXECUTION
    // =========================================================================

    /// Execute a meta-transaction on behalf of a user
    /// @param from The user who signed the meta-transaction
    /// @param to The target contract to call
    /// @param value The ETH value to forward (must be available in contract)
    /// @param data The calldata to send to the target
    /// @param nonce The user's current nonce (prevents replay)
    /// @param deadline Unix timestamp after which the signature expires
    /// @param v Signature recovery parameter
    /// @param r Signature r component
    /// @param s Signature s component
    pub fn execute(
        &mut self,
        from: Address,
        to: Address,
        value: U256,
        data: Vec<u8>,
        nonce: U256,
        deadline: U256,
        v: u8,
        r: B256,
        s: B256,
    ) -> Result<Vec<u8>, Vec<u8>> {
        // Reentrancy guard
        if self.locked.get() {
            return Err(ReentrancyGuard {}.abi_encode());
        }
        self.locked.set(true);

        // Execute with guard
        let result = self.execute_internal(from, to, value, data, nonce, deadline, v, r, s);

        // Release lock
        self.locked.set(false);

        result
    }

    // =========================================================================
    // VIEW FUNCTIONS
    // =========================================================================

    /// Get the current nonce for a user
    pub fn get_nonce(&self, user: Address) -> U256 {
        self.nonces.get(user)
    }

    /// Get the allowed target contract address
    pub fn get_allowed_target(&self) -> Address {
        self.allowed_target.get()
    }

    /// Get the contract owner
    pub fn get_owner(&self) -> Address {
        self.owner.get()
    }

    /// Check if the contract is paused
    pub fn is_paused(&self) -> bool {
        self.paused.get()
    }

    /// Check if the contract is initialized
    pub fn is_initialized(&self) -> bool {
        self.initialized.get()
    }

    /// Get the chain ID used for signatures
    pub fn get_chain_id(&self) -> u64 {
        CHAIN_ID
    }

    /// Compute the message hash for a meta-transaction (for SDK verification)
    pub fn get_message_hash(
        &self,
        from: Address,
        to: Address,
        value: U256,
        data: Vec<u8>,
        nonce: U256,
        deadline: U256,
    ) -> B256 {
        self.compute_hash(from, to, value, &data, nonce, deadline)
    }

    /// Get the domain separator for EIP-712 style signing
    pub fn get_domain_separator(&self) -> B256 {
        self.compute_domain_separator()
    }

    // =========================================================================
    // ADMIN FUNCTIONS
    // =========================================================================

    /// Update the allowed target contract (owner only)
    pub fn set_allowed_target(&mut self, new_target: Address) -> Result<(), Vec<u8>> {
        self.only_owner()?;

        // Validate new target is not zero address
        if new_target.is_zero() {
            return Err(ZeroAddress {}.abi_encode());
        }

        self.allowed_target.set(new_target);
        Ok(())
    }

    /// Pause the contract (owner only)
    pub fn pause(&mut self) -> Result<(), Vec<u8>> {
        self.only_owner()?;
        self.paused.set(true);
        Ok(())
    }

    /// Unpause the contract (owner only)
    pub fn unpause(&mut self) -> Result<(), Vec<u8>> {
        self.only_owner()?;
        self.paused.set(false);
        Ok(())
    }

    /// Transfer ownership to a new address (owner only)
    pub fn transfer_ownership(&mut self, new_owner: Address) -> Result<(), Vec<u8>> {
        self.only_owner()?;

        // Validate new owner is not zero address
        if new_owner.is_zero() {
            return Err(ZeroAddress {}.abi_encode());
        }

        self.owner.set(new_owner);
        Ok(())
    }
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

impl StylusTxPaymaster {
    /// Internal execute function (called within reentrancy guard)
    fn execute_internal(
        &mut self,
        from: Address,
        to: Address,
        value: U256,
        data: Vec<u8>,
        nonce: U256,
        deadline: U256,
        v: u8,
        r: B256,
        s: B256,
    ) -> Result<Vec<u8>, Vec<u8>> {
        // 1. Check contract is initialized
        if !self.initialized.get() {
            return Err(NotInitialized {}.abi_encode());
        }

        // 2. Check not paused
        if self.paused.get() {
            return Err(ContractPaused {}.abi_encode());
        }

        // 3. Check deadline hasn't passed
        let current_time = U256::from(block::timestamp());
        if current_time > deadline {
            return Err(DeadlineExpired { deadline, current_time }.abi_encode());
        }

        // 4. Check target is allowed
        let allowed = self.allowed_target.get();
        if to != allowed {
            return Err(TargetNotAllowed { target: to }.abi_encode());
        }

        // 5. Check signature malleability (EIP-2)
        // s must be in lower half of curve order
        if !self.is_valid_signature_s(&s) {
            return Err(SignatureMalleability {}.abi_encode());
        }

        // 6. Check and increment nonce (BEFORE external call - CEI pattern)
        let expected_nonce = self.nonces.get(from);
        if nonce != expected_nonce {
            return Err(InvalidNonce { expected: expected_nonce, provided: nonce }.abi_encode());
        }
        self.nonces.setter(from).set(expected_nonce + U256::from(1));

        // 7. Verify signature
        let message_hash = self.compute_hash(from, to, value, &data, nonce, deadline);
        let recovered = self.ecrecover_address(message_hash, v, r, s)?;

        if recovered != from {
            return Err(InvalidSignature { expected: from, recovered }.abi_encode());
        }

        // 8. Execute the call to target contract (regular call, not delegate)
        // Note: In stylus-sdk 0.6.0, value transfer requires payable functions
        // For now, we use a standard call without value forwarding
        let result = unsafe {
            RawCall::new()
                .call(to, &data)
        };

        match result {
            Ok(return_data) => Ok(return_data),
            Err(_) => Err(CallFailed {}.abi_encode()),
        }
    }

    /// Check that caller is the owner
    fn only_owner(&self) -> Result<(), Vec<u8>> {
        if msg::sender() != self.owner.get() {
            return Err(NotOwner {}.abi_encode());
        }
        Ok(())
    }

    /// Compute the domain separator (EIP-712 style)
    fn compute_domain_separator(&self) -> B256 {
        let mut domain = Vec::with_capacity(128);
        domain.extend_from_slice(DOMAIN_NAME);
        domain.extend_from_slice(DOMAIN_VERSION);
        domain.extend_from_slice(&CHAIN_ID.to_be_bytes());
        domain.extend_from_slice(contract::address().as_slice());
        keccak(&domain)
    }

    /// Compute the message hash for signature verification
    /// Format: keccak(domain_separator || from || to || value || keccak(data) || nonce || deadline)
    /// IMPORTANT: This must match the SDK's computeMessageHash() exactly!
    fn compute_hash(
        &self,
        from: Address,
        to: Address,
        value: U256,
        data: &[u8],
        nonce: U256,
        deadline: U256,
    ) -> B256 {
        let domain_separator = self.compute_domain_separator();
        let data_hash = keccak(data);

        let mut message = Vec::with_capacity(32 + 20 + 20 + 32 + 32 + 32 + 32);
        message.extend_from_slice(domain_separator.as_slice());
        message.extend_from_slice(from.as_slice());
        message.extend_from_slice(to.as_slice());
        message.extend_from_slice(&value.to_be_bytes::<32>());
        message.extend_from_slice(data_hash.as_slice());
        message.extend_from_slice(&nonce.to_be_bytes::<32>());
        message.extend_from_slice(&deadline.to_be_bytes::<32>());

        keccak(&message)
    }

    /// Check if signature s value is in lower half of curve order (EIP-2)
    fn is_valid_signature_s(&self, s: &B256) -> bool {
        // Compare s with secp256k1_n / 2
        let s_bytes = s.as_slice();
        for i in 0..32 {
            if s_bytes[i] < SECP256K1_N_DIV_2[i] {
                return true;
            }
            if s_bytes[i] > SECP256K1_N_DIV_2[i] {
                return false;
            }
        }
        true // Equal is valid
    }

    /// Recover the signer address from a signature using the ecrecover precompile
    fn ecrecover_address(&self, hash: B256, v: u8, r: B256, s: B256) -> Result<Address, Vec<u8>> {
        // Normalize v to 27/28 if it's 0/1
        let v_normalized = if v < 27 { v + 27 } else { v };

        // Validate v is 27 or 28
        if v_normalized != 27 && v_normalized != 28 {
            return Err(EcrecoverFailed {}.abi_encode());
        }

        // Build input for ecrecover precompile
        // Format: hash (32 bytes) || v (32 bytes, right-padded) || r (32 bytes) || s (32 bytes)
        let mut input = [0u8; 128];
        input[0..32].copy_from_slice(hash.as_slice());
        input[63] = v_normalized;
        input[64..96].copy_from_slice(r.as_slice());
        input[96..128].copy_from_slice(s.as_slice());

        // Call ecrecover precompile at address 0x01 using static call
        let result = unsafe {
            RawCall::new_static()
                .call(ECRECOVER_PRECOMPILE, &input)
        }.map_err(|_| EcrecoverFailed {}.abi_encode())?;

        if result.len() < 32 {
            return Err(EcrecoverFailed {}.abi_encode());
        }

        let recovered = Address::from_slice(&result[12..32]);

        if recovered.is_zero() {
            return Err(EcrecoverFailed {}.abi_encode());
        }

        Ok(recovered)
    }
}
