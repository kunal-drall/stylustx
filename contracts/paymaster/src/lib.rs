//! StylusTx Paymaster Contract
//!
//! A gas abstraction layer for Arbitrum that enables gasless transactions.
//! Users sign meta-transactions off-chain, and a relayer submits them to this
//! contract which verifies the signature and executes the intended action.

#![cfg_attr(not(feature = "export-abi"), no_main)]
extern crate alloc;

use alloc::vec::Vec;
use stylus_sdk::{
    alloy_primitives::{Address, B256, U256},
    prelude::*,
    crypto::keccak,
    call::{call, RawCall},
};
use alloy_sol_types::{sol, SolError};
use stylus_core::{calls::MutatingCallContext, CallContext};

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
    }
}

// =============================================================================
// EVENTS
// =============================================================================

sol! {
    /// Emitted when a meta-transaction is executed
    event MetaTxExecuted(
        address indexed user,
        address indexed target,
        uint256 nonce,
        bool success
    );

    /// Emitted when the allowed target is updated
    event TargetUpdated(
        address indexed old_target,
        address indexed new_target
    );

    /// Emitted when the contract is paused or unpaused
    event PausedStateChanged(bool paused);

    /// Emitted when ownership is transferred
    event OwnershipTransferred(
        address indexed previous_owner,
        address indexed new_owner
    );
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
    /// External call failed
    error CallFailed();
    /// ecrecover precompile failed
    error EcrecoverFailed();
}

// =============================================================================
// CONSTANTS
// =============================================================================

/// Domain separator for message hashing
const DOMAIN_SEPARATOR: &[u8] = b"StylusTx";

/// Address of the ecrecover precompile
const ECRECOVER_PRECOMPILE: Address = Address::new([
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1
]);

// =============================================================================
// CALL CONTEXT FOR EXTERNAL CALLS
// =============================================================================

/// Context for making external calls with value
struct CallWithValue {
    gas_amount: u64,
    call_value: U256,
}

impl CallWithValue {
    fn new(value: U256) -> Self {
        Self {
            gas_amount: u64::MAX, // Use all available gas
            call_value: value,
        }
    }
}

impl CallContext for CallWithValue {
    fn gas(&self) -> u64 {
        self.gas_amount
    }
}

unsafe impl MutatingCallContext for CallWithValue {
    fn value(&self) -> U256 {
        self.call_value
    }
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
    pub fn initialize(&mut self, target: Address) -> Result<(), Vec<u8>> {
        if self.initialized.get() {
            return Err(AlreadyInitialized {}.abi_encode());
        }

        self.owner.set(self.vm().msg_sender());
        self.allowed_target.set(target);
        self.initialized.set(true);
        self.paused.set(false);

        Ok(())
    }

    // =========================================================================
    // CORE META-TRANSACTION EXECUTION
    // =========================================================================

    /// Execute a meta-transaction on behalf of a user
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
        // 1. Check contract is initialized
        if !self.initialized.get() {
            return Err(NotInitialized {}.abi_encode());
        }

        // 2. Check not paused
        if self.paused.get() {
            return Err(ContractPaused {}.abi_encode());
        }

        // 3. Check deadline hasn't passed
        let current_time = U256::from(self.vm().block_timestamp());
        if current_time > deadline {
            return Err(DeadlineExpired { deadline, current_time }.abi_encode());
        }

        // 4. Check target is allowed
        let allowed = self.allowed_target.get();
        if to != allowed {
            return Err(TargetNotAllowed { target: to }.abi_encode());
        }

        // 5. Check and increment nonce (BEFORE external call to prevent reentrancy)
        let expected_nonce = self.nonces.get(from);
        if nonce != expected_nonce {
            return Err(InvalidNonce { expected: expected_nonce, provided: nonce }.abi_encode());
        }
        self.nonces.setter(from).set(expected_nonce + U256::from(1));

        // 6. Verify signature
        let message_hash = Self::compute_hash(from, to, value, &data, nonce, deadline);
        let recovered = self.ecrecover_address(message_hash, v, r, s)?;

        if recovered != from {
            return Err(InvalidSignature { expected: from, recovered }.abi_encode());
        }

        // 7. Execute the call to target contract
        let context = CallWithValue::new(value);
        let result = call(self.vm(), context, to, &data);

        match result {
            Ok(return_data) => {
                self.vm().log(MetaTxExecuted {
                    user: from,
                    target: to,
                    nonce,
                    success: true,
                });
                Ok(return_data)
            }
            Err(_) => {
                self.vm().log(MetaTxExecuted {
                    user: from,
                    target: to,
                    nonce,
                    success: false,
                });
                Err(CallFailed {}.abi_encode())
            }
        }
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
        Self::compute_hash(from, to, value, &data, nonce, deadline)
    }

    // =========================================================================
    // ADMIN FUNCTIONS
    // =========================================================================

    /// Update the allowed target contract (owner only)
    pub fn set_allowed_target(&mut self, new_target: Address) -> Result<(), Vec<u8>> {
        self.only_owner()?;

        let old_target = self.allowed_target.get();
        self.allowed_target.set(new_target);

        self.vm().log(TargetUpdated { old_target, new_target });
        Ok(())
    }

    /// Pause the contract (owner only)
    pub fn pause(&mut self) -> Result<(), Vec<u8>> {
        self.only_owner()?;
        self.paused.set(true);
        self.vm().log(PausedStateChanged { paused: true });
        Ok(())
    }

    /// Unpause the contract (owner only)
    pub fn unpause(&mut self) -> Result<(), Vec<u8>> {
        self.only_owner()?;
        self.paused.set(false);
        self.vm().log(PausedStateChanged { paused: false });
        Ok(())
    }

    /// Transfer ownership to a new address (owner only)
    pub fn transfer_ownership(&mut self, new_owner: Address) -> Result<(), Vec<u8>> {
        self.only_owner()?;

        let previous_owner = self.owner.get();
        self.owner.set(new_owner);

        self.vm().log(OwnershipTransferred { previous_owner, new_owner });
        Ok(())
    }
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

impl StylusTxPaymaster {
    /// Check that caller is the owner
    fn only_owner(&self) -> Result<(), Vec<u8>> {
        if self.vm().msg_sender() != self.owner.get() {
            return Err(NotOwner {}.abi_encode());
        }
        Ok(())
    }

    /// Compute the message hash for signature verification
    /// Format: keccak(domain || from || to || value || keccak(data) || nonce || deadline)
    /// IMPORTANT: This must match the SDK's computeMessageHash() exactly!
    fn compute_hash(
        from: Address,
        to: Address,
        value: U256,
        data: &[u8],
        nonce: U256,
        deadline: U256,
    ) -> B256 {
        let data_hash = keccak(data);

        let mut message = Vec::with_capacity(DOMAIN_SEPARATOR.len() + 20 + 20 + 32 + 32 + 32 + 32);
        message.extend_from_slice(DOMAIN_SEPARATOR);
        message.extend_from_slice(from.as_slice());
        message.extend_from_slice(to.as_slice());
        message.extend_from_slice(&value.to_be_bytes::<32>());
        message.extend_from_slice(data_hash.as_slice());
        message.extend_from_slice(&nonce.to_be_bytes::<32>());
        message.extend_from_slice(&deadline.to_be_bytes::<32>());

        keccak(&message)
    }

    /// Recover the signer address from a signature using the ecrecover precompile
    fn ecrecover_address(&self, hash: B256, v: u8, r: B256, s: B256) -> Result<Address, Vec<u8>> {
        // Normalize v to 27/28 if it's 0/1
        let v_normalized = if v < 27 { v + 27 } else { v };

        // Build input for ecrecover precompile
        // Format: hash (32 bytes) || v (32 bytes, right-padded) || r (32 bytes) || s (32 bytes)
        let mut input = [0u8; 128];
        input[0..32].copy_from_slice(hash.as_slice());
        input[63] = v_normalized;
        input[64..96].copy_from_slice(r.as_slice());
        input[96..128].copy_from_slice(s.as_slice());

        // Call ecrecover precompile at address 0x01 using static call
        let result = unsafe {
            RawCall::new_static(self.vm())
                .call(ECRECOVER_PRECOMPILE, &input)
                .map_err(|_| EcrecoverFailed {}.abi_encode())?
        };

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
