# StylusTx Security Audit Report

**Version**: 1.0
**Date**: 2026-02-04
**Contract**: StylusTxPaymaster
**Auditor**: Internal Review

---

## Executive Summary

This security audit reviews the StylusTx Paymaster contract for potential vulnerabilities. The audit identified **3 critical**, **2 high**, **3 medium**, and **2 low** severity issues.

---

## Findings

### 🔴 CRITICAL-01: Delegate Call Instead of Regular Call

**Severity**: Critical
**Status**: FIXED
**Location**: `lib.rs:162-165`

**Description**:
The contract uses `RawCall::new_delegate()` which executes the target contract's code in the context of the paymaster. This means:
- The target can modify the paymaster's storage
- The target can drain any ETH held by the paymaster
- The target can change the owner, pause state, etc.

**Original Code**:
```rust
let result = unsafe {
    RawCall::new_delegate()
        .call(to, &data)
};
```

**Recommendation**: Use regular `call` instead of `delegate_call`.

**Fix**:
```rust
let result = unsafe {
    RawCall::new()
        .call(to, &data)
};
```

---

### 🔴 CRITICAL-02: Missing Signature Malleability Protection

**Severity**: Critical
**Status**: FIXED
**Location**: `lib.rs:286-316`

**Description**:
ECDSA signatures are malleable. For any valid signature `(r, s, v)`, the signature `(r, n-s, v')` is also valid (where `n` is the curve order). This could allow replay attacks in certain scenarios.

**Recommendation**: Enforce that `s` is in the lower half of the curve order (EIP-2).

**Fix**: Add `s` value check:
```rust
// secp256k1 curve order
const SECP256K1_N: U256 = U256::from_be_bytes([...]);
const SECP256K1_N_DIV_2: U256 = U256::from_be_bytes([...]);

if U256::from_be_bytes(s.0) > SECP256K1_N_DIV_2 {
    return Err(InvalidSignature { ... }.abi_encode());
}
```

---

### 🔴 CRITICAL-03: No Value Transfer Support

**Severity**: Critical
**Status**: FIXED
**Location**: `lib.rs:162-165`

**Description**:
The `execute` function accepts a `value` parameter but never uses it. The external call doesn't forward any ETH value, breaking any transactions that require ETH transfer.

**Recommendation**: Forward the `value` to the target call.

**Fix**:
```rust
let result = unsafe {
    RawCall::new()
        .value(value)  // Forward ETH value
        .call(to, &data)
};
```

---

### 🟠 HIGH-01: Zero Address Validation Missing

**Severity**: High
**Status**: FIXED
**Location**: `lib.rs:94-105`, `lib.rs:220-224`, `lib.rs:241-245`

**Description**:
- `initialize()` can set owner to zero address (if called by zero address, though unlikely)
- `set_allowed_target()` can set target to zero address, disabling all meta-transactions
- `transfer_ownership()` can transfer to zero address, permanently locking the contract

**Recommendation**: Add zero address checks.

---

### 🟠 HIGH-02: No Reentrancy Guard

**Severity**: High
**Status**: MITIGATED
**Location**: `lib.rs:112-171`

**Description**:
While the nonce is incremented before the external call (Checks-Effects-Interactions pattern), there's no explicit reentrancy guard. A malicious target could potentially re-enter through another function.

**Current Mitigation**: Nonce increment before call prevents replay of the same transaction.

**Recommendation**: Add explicit reentrancy guard for defense in depth.

---

### 🟡 MEDIUM-01: Missing Chain ID in Signature

**Severity**: Medium
**Status**: FIXED
**Location**: `lib.rs:264-284`

**Description**:
The message hash doesn't include the chain ID. A signature valid on Arbitrum Sepolia could be replayed on Arbitrum One if the same contract is deployed at the same address.

**Recommendation**: Include chain ID in the domain separator (EIP-712 style).

---

### 🟡 MEDIUM-02: Missing Contract Address in Signature

**Severity**: Medium
**Status**: FIXED
**Location**: `lib.rs:264-284`

**Description**:
The message hash doesn't include the paymaster contract address. If multiple paymaster contracts exist, signatures could potentially be replayed across them.

**Recommendation**: Include the contract address in the hash.

---

### 🟡 MEDIUM-03: Unbounded Deadline

**Severity**: Medium
**Status**: INFO
**Location**: `lib.rs:134-138`

**Description**:
Users can set deadline to `U256::MAX`, creating effectively permanent signatures. This increases the window for potential attacks.

**Recommendation**: Consider enforcing a maximum deadline (e.g., 1 hour from current time). However, this is a design choice that may not suit all use cases.

---

### 🟢 LOW-01: Missing Event Emission

**Severity**: Low
**Status**: ACKNOWLEDGED
**Location**: Throughout contract

**Description**:
The contract doesn't emit events for important state changes (meta-tx execution, pause, ownership transfer). This makes off-chain monitoring difficult.

**Note**: Events were removed due to alloy-sol-types compatibility issues with stylus-sdk 0.6.0. Should be re-added when SDK is updated.

---

### 🟢 LOW-02: No Batch Operation Support

**Severity**: Low
**Status**: ACKNOWLEDGED (Future Enhancement)

**Description**:
Each meta-transaction requires a separate on-chain transaction, increasing costs for users who want to perform multiple actions.

---

## Security Checklist

| Check | Status |
|-------|--------|
| Reentrancy protection | ✅ Nonce-based |
| Integer overflow/underflow | ✅ U256 handles |
| Access control | ✅ Owner-only functions |
| Input validation | ⚠️ Added zero-address checks |
| Signature verification | ✅ ecrecover + malleability fix |
| Replay protection | ✅ Nonce + chain ID + contract address |
| Delegate call safety | ✅ Changed to regular call |
| Initialization protection | ✅ Can only initialize once |
| Pause functionality | ✅ Emergency pause exists |

---

## Recommendations Summary

1. ✅ Replace `delegate_call` with regular `call`
2. ✅ Add signature malleability protection
3. ✅ Forward `value` in external call
4. ✅ Add zero-address validation
5. ✅ Include chain ID in message hash
6. ✅ Include contract address in message hash
7. ⏳ Add explicit reentrancy guard (defense in depth)
8. ⏳ Re-add events when SDK supports them

---

## Post-Audit Status

After implementing fixes, the contract security posture is significantly improved. A professional third-party audit is still recommended before mainnet deployment.
