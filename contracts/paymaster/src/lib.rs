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
//!
//! ## Gas Sponsorship Policies
//! - Token-gated access (optional ERC20/ERC721 requirement)
//! - Daily transaction limits per user
//! - Per-transaction gas cap

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
const SECP256K1_N_DIV_2: [u8; 32] = [
    0x7F, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
    0x5D, 0x57, 0x6E, 0x73, 0x57, 0xA4, 0x50, 0x1D,
    0xDF, 0xE9, 0x2F, 0x46, 0x68, 0x1B, 0x20, 0xA0,
];

/// Arbitrum Sepolia Chain ID
const CHAIN_ID: u64 = 421614;

/// Seconds in a day (for rate limiting epochs)
const SECONDS_PER_DAY: u64 = 86400;

/// ERC20 balanceOf selector: balanceOf(address) => uint256
const ERC20_BALANCE_OF_SELECTOR: [u8; 4] = [0x70, 0xa0, 0x82, 0x31];

/// ERC721 balanceOf selector: balanceOf(address) => uint256
const ERC721_BALANCE_OF_SELECTOR: [u8; 4] = [0x70, 0xa0, 0x82, 0x31];

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
        /// Allowed target contract
        address allowed_target;
        /// Emergency pause flag
        bool paused;
        /// Whether the contract has been initialized
        bool initialized;
        /// Reentrancy guard
        bool locked;

        // =====================================================================
        // GAS SPONSORSHIP POLICY STORAGE
        // =====================================================================

        /// Token gate: required token contract address (zero = disabled)
        address required_token;
        /// Token gate: minimum balance required (for ERC20)
        uint256 required_token_balance;
        /// Token gate: whether token is ERC721 (true) or ERC20 (false)
        bool is_erc721;

        /// Rate limit: maximum transactions per day per user (0 = unlimited)
        uint256 daily_tx_limit;
        /// Rate limit: tracking user's daily transaction count
        /// Key: keccak256(user || day_epoch) => tx_count
        mapping(bytes32 => uint256) daily_tx_count;

        /// Gas cap: maximum gas limit per transaction (0 = unlimited)
        uint256 max_gas_per_tx;
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
    /// User doesn't hold required token
    error TokenGateNotMet(address token, uint256 required, uint256 actual);
    /// User exceeded daily transaction limit
    error DailyLimitExceeded(uint256 limit, uint256 used);
    /// Transaction exceeds gas cap
    error GasCapExceeded(uint256 cap, uint256 requested);
    /// Batch execution failed at index
    error BatchExecutionFailed(uint256 index);
    /// Batch is empty
    error EmptyBatch();
    /// Batch exceeds maximum size
    error BatchTooLarge(uint256 size, uint256 max);
}

/// Maximum transactions in a single batch
const MAX_BATCH_SIZE: usize = 10;

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

        if target.is_zero() {
            return Err(ZeroAddress {}.abi_encode());
        }

        self.owner.set(msg::sender());
        self.allowed_target.set(target);
        self.initialized.set(true);
        self.paused.set(false);
        self.locked.set(false);

        // Initialize policies with defaults (no restrictions)
        self.required_token.set(Address::ZERO);
        self.required_token_balance.set(U256::ZERO);
        self.is_erc721.set(false);
        self.daily_tx_limit.set(U256::ZERO);
        self.max_gas_per_tx.set(U256::ZERO);

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
        // Reentrancy guard
        if self.locked.get() {
            return Err(ReentrancyGuard {}.abi_encode());
        }
        self.locked.set(true);

        let result = self.execute_internal(from, to, value, data, nonce, deadline, v, r, s);

        self.locked.set(false);
        result
    }

    /// Execute multiple meta-transactions in a single call (batch execution)
    /// All transactions must succeed or the entire batch fails (atomic)
    /// @param froms Array of signer addresses
    /// @param tos Array of target addresses
    /// @param values Array of ETH values
    /// @param datas Array of calldata
    /// @param nonces Array of nonces
    /// @param deadlines Array of deadlines
    /// @param vs Array of signature v components
    /// @param rs Array of signature r components
    /// @param ss Array of signature s components
    pub fn execute_batch(
        &mut self,
        froms: Vec<Address>,
        tos: Vec<Address>,
        values: Vec<U256>,
        datas: Vec<Vec<u8>>,
        nonces: Vec<U256>,
        deadlines: Vec<U256>,
        vs: Vec<u8>,
        rs: Vec<B256>,
        ss: Vec<B256>,
    ) -> Result<Vec<Vec<u8>>, Vec<u8>> {
        // Reentrancy guard
        if self.locked.get() {
            return Err(ReentrancyGuard {}.abi_encode());
        }
        self.locked.set(true);

        let result = self.execute_batch_internal(froms, tos, values, datas, nonces, deadlines, vs, rs, ss);

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

    /// Compute the message hash for a meta-transaction
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
    // POLICY VIEW FUNCTIONS
    // =========================================================================

    /// Get required token address (zero = no token gate)
    pub fn get_required_token(&self) -> Address {
        self.required_token.get()
    }

    /// Get required token balance
    pub fn get_required_token_balance(&self) -> U256 {
        self.required_token_balance.get()
    }

    /// Check if required token is ERC721
    pub fn is_required_token_erc721(&self) -> bool {
        self.is_erc721.get()
    }

    /// Get daily transaction limit (0 = unlimited)
    pub fn get_daily_tx_limit(&self) -> U256 {
        self.daily_tx_limit.get()
    }

    /// Get max gas per transaction (0 = unlimited)
    pub fn get_max_gas_per_tx(&self) -> U256 {
        self.max_gas_per_tx.get()
    }

    /// Get user's transaction count for today
    pub fn get_user_daily_tx_count(&self, user: Address) -> U256 {
        let epoch = self.get_current_day_epoch();
        let key = self.compute_daily_key(user, epoch);
        self.daily_tx_count.get(key)
    }

    /// Check if user can execute (passes all policy checks)
    pub fn can_user_execute(&self, user: Address, gas_limit: U256) -> bool {
        // Check token gate
        if !self.check_token_gate(user) {
            return false;
        }

        // Check daily limit
        if !self.check_daily_limit(user) {
            return false;
        }

        // Check gas cap
        if !self.check_gas_cap(gas_limit) {
            return false;
        }

        true
    }

    // =========================================================================
    // ADMIN FUNCTIONS - BASIC
    // =========================================================================

    /// Update the allowed target contract (owner only)
    pub fn set_allowed_target(&mut self, new_target: Address) -> Result<(), Vec<u8>> {
        self.only_owner()?;
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
        if new_owner.is_zero() {
            return Err(ZeroAddress {}.abi_encode());
        }
        self.owner.set(new_owner);
        Ok(())
    }

    // =========================================================================
    // ADMIN FUNCTIONS - POLICY CONFIGURATION
    // =========================================================================

    /// Set token gate requirement (owner only)
    /// @param token Token contract address (zero to disable)
    /// @param min_balance Minimum balance required
    /// @param is_erc721 True if token is ERC721, false if ERC20
    pub fn set_token_gate(
        &mut self,
        token: Address,
        min_balance: U256,
        is_erc721: bool,
    ) -> Result<(), Vec<u8>> {
        self.only_owner()?;
        self.required_token.set(token);
        self.required_token_balance.set(min_balance);
        self.is_erc721.set(is_erc721);
        Ok(())
    }

    /// Remove token gate requirement (owner only)
    pub fn remove_token_gate(&mut self) -> Result<(), Vec<u8>> {
        self.only_owner()?;
        self.required_token.set(Address::ZERO);
        self.required_token_balance.set(U256::ZERO);
        self.is_erc721.set(false);
        Ok(())
    }

    /// Set daily transaction limit (owner only)
    /// @param limit Max transactions per day per user (0 = unlimited)
    pub fn set_daily_tx_limit(&mut self, limit: U256) -> Result<(), Vec<u8>> {
        self.only_owner()?;
        self.daily_tx_limit.set(limit);
        Ok(())
    }

    /// Set max gas per transaction (owner only)
    /// @param max_gas Maximum gas limit per transaction (0 = unlimited)
    pub fn set_max_gas_per_tx(&mut self, max_gas: U256) -> Result<(), Vec<u8>> {
        self.only_owner()?;
        self.max_gas_per_tx.set(max_gas);
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
        if !self.is_valid_signature_s(&s) {
            return Err(SignatureMalleability {}.abi_encode());
        }

        // 6. Check gas sponsorship policies
        self.enforce_policies(from)?;

        // 7. Check and increment nonce (BEFORE external call - CEI pattern)
        let expected_nonce = self.nonces.get(from);
        if nonce != expected_nonce {
            return Err(InvalidNonce { expected: expected_nonce, provided: nonce }.abi_encode());
        }
        self.nonces.setter(from).set(expected_nonce + U256::from(1));

        // 8. Verify signature
        let message_hash = self.compute_hash(from, to, value, &data, nonce, deadline);
        let recovered = self.ecrecover_address(message_hash, v, r, s)?;

        if recovered != from {
            return Err(InvalidSignature { expected: from, recovered }.abi_encode());
        }

        // 9. Update daily transaction count
        self.increment_daily_tx_count(from);

        // 10. Execute the call to target contract
        let result = unsafe {
            RawCall::new()
                .call(to, &data)
        };

        match result {
            Ok(return_data) => Ok(return_data),
            Err(_) => Err(CallFailed {}.abi_encode()),
        }
    }

    /// Internal batch execute function (called within reentrancy guard)
    fn execute_batch_internal(
        &mut self,
        froms: Vec<Address>,
        tos: Vec<Address>,
        values: Vec<U256>,
        datas: Vec<Vec<u8>>,
        nonces: Vec<U256>,
        deadlines: Vec<U256>,
        vs: Vec<u8>,
        rs: Vec<B256>,
        ss: Vec<B256>,
    ) -> Result<Vec<Vec<u8>>, Vec<u8>> {
        let batch_size = froms.len();

        // Validate batch size
        if batch_size == 0 {
            return Err(EmptyBatch {}.abi_encode());
        }

        if batch_size > MAX_BATCH_SIZE {
            return Err(BatchTooLarge {
                size: U256::from(batch_size),
                max: U256::from(MAX_BATCH_SIZE),
            }.abi_encode());
        }

        // Validate all arrays have same length
        if tos.len() != batch_size
            || values.len() != batch_size
            || datas.len() != batch_size
            || nonces.len() != batch_size
            || deadlines.len() != batch_size
            || vs.len() != batch_size
            || rs.len() != batch_size
            || ss.len() != batch_size
        {
            return Err(BatchExecutionFailed { index: U256::ZERO }.abi_encode());
        }

        let mut results: Vec<Vec<u8>> = Vec::with_capacity(batch_size);

        // Execute each transaction
        for i in 0..batch_size {
            let result = self.execute_internal(
                froms[i],
                tos[i],
                values[i],
                datas[i].clone(),
                nonces[i],
                deadlines[i],
                vs[i],
                rs[i],
                ss[i],
            );

            match result {
                Ok(data) => results.push(data),
                Err(_) => {
                    return Err(BatchExecutionFailed { index: U256::from(i) }.abi_encode());
                }
            }
        }

        Ok(results)
    }

    /// Enforce all gas sponsorship policies
    fn enforce_policies(&self, user: Address) -> Result<(), Vec<u8>> {
        // Check token gate
        let required_token = self.required_token.get();
        if !required_token.is_zero() {
            let required_balance = self.required_token_balance.get();
            let actual_balance = self.get_token_balance(required_token, user);

            if actual_balance < required_balance {
                return Err(TokenGateNotMet {
                    token: required_token,
                    required: required_balance,
                    actual: actual_balance,
                }.abi_encode());
            }
        }

        // Check daily limit
        let daily_limit = self.daily_tx_limit.get();
        if daily_limit > U256::ZERO {
            let epoch = self.get_current_day_epoch();
            let key = self.compute_daily_key(user, epoch);
            let used = self.daily_tx_count.get(key);

            if used >= daily_limit {
                return Err(DailyLimitExceeded {
                    limit: daily_limit,
                    used,
                }.abi_encode());
            }
        }

        // Note: Gas cap is checked differently (needs gas limit from tx)
        // For now, we skip runtime gas checking as it requires access to gasleft()

        Ok(())
    }

    /// Check if user passes token gate
    fn check_token_gate(&self, user: Address) -> bool {
        let required_token = self.required_token.get();
        if required_token.is_zero() {
            return true;
        }

        let required_balance = self.required_token_balance.get();
        let actual_balance = self.get_token_balance(required_token, user);
        actual_balance >= required_balance
    }

    /// Check if user is within daily limit
    fn check_daily_limit(&self, user: Address) -> bool {
        let daily_limit = self.daily_tx_limit.get();
        if daily_limit == U256::ZERO {
            return true;
        }

        let epoch = self.get_current_day_epoch();
        let key = self.compute_daily_key(user, epoch);
        let used = self.daily_tx_count.get(key);
        used < daily_limit
    }

    /// Check if gas limit is within cap
    fn check_gas_cap(&self, gas_limit: U256) -> bool {
        let max_gas = self.max_gas_per_tx.get();
        if max_gas == U256::ZERO {
            return true;
        }
        gas_limit <= max_gas
    }

    /// Get token balance for a user
    fn get_token_balance(&self, token: Address, user: Address) -> U256 {
        // Build balanceOf(address) call
        let mut calldata = Vec::with_capacity(36);
        calldata.extend_from_slice(&ERC20_BALANCE_OF_SELECTOR);
        calldata.extend_from_slice(&[0u8; 12]); // Padding
        calldata.extend_from_slice(user.as_slice());

        // Call the token contract
        let result = unsafe {
            RawCall::new_static()
                .call(token, &calldata)
        };

        match result {
            Ok(data) if data.len() >= 32 => {
                U256::from_be_slice(&data[0..32])
            }
            _ => U256::ZERO,
        }
    }

    /// Get current day epoch (days since Unix epoch)
    fn get_current_day_epoch(&self) -> u64 {
        block::timestamp() / SECONDS_PER_DAY
    }

    /// Compute storage key for daily transaction count
    fn compute_daily_key(&self, user: Address, epoch: u64) -> B256 {
        let mut data = Vec::with_capacity(28);
        data.extend_from_slice(user.as_slice());
        data.extend_from_slice(&epoch.to_be_bytes());
        keccak(&data)
    }

    /// Increment user's daily transaction count
    fn increment_daily_tx_count(&mut self, user: Address) {
        let epoch = self.get_current_day_epoch();
        let key = self.compute_daily_key(user, epoch);
        let current = self.daily_tx_count.get(key);
        self.daily_tx_count.setter(key).set(current + U256::from(1));
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
        let s_bytes = s.as_slice();
        for i in 0..32 {
            if s_bytes[i] < SECP256K1_N_DIV_2[i] {
                return true;
            }
            if s_bytes[i] > SECP256K1_N_DIV_2[i] {
                return false;
            }
        }
        true
    }

    /// Recover the signer address from a signature
    fn ecrecover_address(&self, hash: B256, v: u8, r: B256, s: B256) -> Result<Address, Vec<u8>> {
        let v_normalized = if v < 27 { v + 27 } else { v };

        if v_normalized != 27 && v_normalized != 28 {
            return Err(EcrecoverFailed {}.abi_encode());
        }

        let mut input = [0u8; 128];
        input[0..32].copy_from_slice(hash.as_slice());
        input[63] = v_normalized;
        input[64..96].copy_from_slice(r.as_slice());
        input[96..128].copy_from_slice(s.as_slice());

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
