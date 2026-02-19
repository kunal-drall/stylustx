import { Contract, Provider, Signer, JsonRpcProvider } from 'ethers';
import { PAYMASTER_CONTRACT_ABI, DEFAULT_DEADLINE_OFFSET, EIP712_TYPES, EIP712_DOMAIN } from './constants';
import { computeMessageHash, createDeadline, createTypedData, splitSignature } from './utils/hashing';
import {
  StylusTxConfig,
  MetaTransaction,
  SignedMetaTransaction,
  MetaTxResult,
  PolicyStatus,
  EIP712Domain,
} from './types';

/**
 * StylusTx Client for interacting with the paymaster contract
 */
export class StylusTxClient {
  private provider: Provider;
  private signer?: Signer;
  private paymasterContract: Contract;
  private paymasterAddress: string;
  private chainId: number;

  constructor(config: StylusTxConfig) {
    // Initialize provider
    if (typeof config.provider === 'string') {
      this.provider = new JsonRpcProvider(config.provider);
    } else {
      this.provider = config.provider;
    }

    this.signer = config.signer;
    this.paymasterAddress = config.paymasterAddress;
    this.chainId = config.chainId || 421614; // Default to Arbitrum Sepolia

    // Initialize contract
    this.paymasterContract = new Contract(
      this.paymasterAddress,
      PAYMASTER_CONTRACT_ABI,
      this.provider
    );
  }

  /**
   * Set the signer (user wallet) for signing meta-transactions
   */
  setSigner(signer: Signer): void {
    this.signer = signer;
  }

  /**
   * Get the current nonce for a user address
   */
  async getNonce(userAddress: string): Promise<bigint> {
    return await this.paymasterContract.get_nonce(userAddress);
  }

  /**
   * Get the allowed target contract address
   */
  async getAllowedTarget(): Promise<string> {
    return await this.paymasterContract.get_allowed_target();
  }

  /**
   * Check if the contract is initialized
   */
  async isInitialized(): Promise<boolean> {
    return await this.paymasterContract.is_initialized();
  }

  /**
   * Check if the contract is paused
   */
  async isPaused(): Promise<boolean> {
    return await this.paymasterContract.is_paused();
  }

  /**
   * Get the EIP-712 domain for this paymaster
   */
  getDomain(): EIP712Domain {
    return {
      name: EIP712_DOMAIN.name,
      version: EIP712_DOMAIN.version,
      chainId: this.chainId,
      verifyingContract: this.paymasterAddress,
    };
  }

  /**
   * Sign a meta-transaction using EIP-712 typed data signing
   * This provides better UX - users see structured data in their wallet
   */
  async signMetaTransaction(
    to: string,
    data: string,
    value: bigint = 0n,
    deadlineOffset: number = DEFAULT_DEADLINE_OFFSET
  ): Promise<SignedMetaTransaction> {
    if (!this.signer) {
      throw new Error('No signer configured. Call setSigner() first.');
    }

    const from = await this.signer.getAddress();
    const nonce = await this.getNonce(from);
    const deadline = createDeadline(deadlineOffset);

    const tx: MetaTransaction = {
      from,
      to,
      value,
      data,
      nonce,
      deadline,
    };

    // Create EIP-712 typed data
    const typedData = createTypedData(tx, this.chainId, this.paymasterAddress);

    // Sign using EIP-712 typed data (signTypedData)
    // This shows structured data in the wallet UI
    const signature = await this.signer.signTypedData(
      typedData.domain,
      typedData.types,
      typedData.message
    );

    // Split and normalize signature
    const { r, s, v } = splitSignature(signature);

    return {
      ...tx,
      v,
      r,
      s,
    };
  }

  /**
   * Sign a meta-transaction using raw message signing (legacy method)
   * Use signMetaTransaction() for better UX with EIP-712
   */
  async signMetaTransactionLegacy(
    to: string,
    data: string,
    value: bigint = 0n,
    deadlineOffset: number = DEFAULT_DEADLINE_OFFSET
  ): Promise<SignedMetaTransaction> {
    if (!this.signer) {
      throw new Error('No signer configured. Call setSigner() first.');
    }

    const from = await this.signer.getAddress();
    const nonce = await this.getNonce(from);
    const deadline = createDeadline(deadlineOffset);

    const tx: MetaTransaction = {
      from,
      to,
      value,
      data,
      nonce,
      deadline,
    };

    // Compute message hash
    const messageHash = computeMessageHash(tx, this.chainId, this.paymasterAddress);

    // Sign the raw hash
    const signature = await this.signer.signMessage(hexToBytes(messageHash));
    const { r, s, v } = splitSignature(signature);

    return {
      ...tx,
      v,
      r,
      s,
    };
  }

  /**
   * Execute a signed meta-transaction (called by relayer)
   * Requires a signer with ETH to pay for gas
   */
  async executeMetaTransaction(
    signedTx: SignedMetaTransaction,
    relayerSigner?: Signer
  ): Promise<MetaTxResult> {
    const signerToUse = relayerSigner || this.signer;

    if (!signerToUse) {
      throw new Error('No signer available to execute transaction');
    }

    const contractWithSigner = this.paymasterContract.connect(signerToUse);

    try {
      const tx = await contractWithSigner.execute(
        signedTx.from,
        signedTx.to,
        signedTx.value,
        signedTx.data,
        signedTx.nonce,
        signedTx.deadline,
        signedTx.v,
        signedTx.r,
        signedTx.s
      );

      const receipt = await tx.wait();

      return {
        success: true,
        txHash: receipt.hash,
        returnData: receipt.logs?.[0]?.data,
      };
    } catch (error: any) {
      return {
        success: false,
        txHash: '',
        error: error.message || 'Transaction execution failed',
      };
    }
  }

  /**
   * Get the gas sponsorship policy status for a user
   */
  async getPolicyStatus(userAddress: string, gasLimit: bigint = 0n): Promise<PolicyStatus> {
    const [
      requiredToken,
      requiredBalance,
      isERC721,
      dailyTxLimit,
      userDailyTxCount,
      maxGasPerTx,
      canExecute,
    ] = await Promise.all([
      this.paymasterContract.get_required_token().catch(() => '0x0000000000000000000000000000000000000000'),
      this.paymasterContract.get_required_token_balance().catch(() => 0n),
      this.paymasterContract.is_required_token_erc721().catch(() => false),
      this.paymasterContract.get_daily_tx_limit().catch(() => 0n),
      this.paymasterContract.get_user_daily_tx_count(userAddress).catch(() => 0n),
      this.paymasterContract.get_max_gas_per_tx().catch(() => 0n),
      this.paymasterContract.can_user_execute(userAddress, gasLimit).catch(() => true),
    ]);

    const tokenGateEnabled = requiredToken !== '0x0000000000000000000000000000000000000000';

    return {
      tokenGateEnabled,
      requiredToken: tokenGateEnabled ? requiredToken : undefined,
      requiredBalance: tokenGateEnabled ? requiredBalance : undefined,
      isERC721: tokenGateEnabled ? isERC721 : undefined,
      dailyTxLimit,
      userDailyTxCount,
      maxGasPerTx,
      canExecute,
    };
  }

  /**
   * Verify that a signed meta-transaction is valid (without executing)
   */
  async verifyMetaTransaction(signedTx: SignedMetaTransaction): Promise<boolean> {
    try {
      // Check if contract is initialized and not paused
      const [initialized, paused] = await Promise.all([
        this.isInitialized(),
        this.isPaused(),
      ]);

      if (!initialized) {
        throw new Error('Paymaster contract not initialized');
      }

      if (paused) {
        throw new Error('Paymaster contract is paused');
      }

      // Check deadline
      const currentTime = BigInt(Math.floor(Date.now() / 1000));
      if (currentTime > signedTx.deadline) {
        throw new Error('Transaction deadline expired');
      }

      // Check nonce
      const expectedNonce = await this.getNonce(signedTx.from);
      if (signedTx.nonce !== expectedNonce) {
        throw new Error(`Invalid nonce. Expected ${expectedNonce}, got ${signedTx.nonce}`);
      }

      // Check target is allowed
      const allowedTarget = await this.getAllowedTarget();
      if (signedTx.to.toLowerCase() !== allowedTarget.toLowerCase()) {
        throw new Error(`Target ${signedTx.to} not allowed`);
      }

      // Check policy status
      const policyStatus = await this.getPolicyStatus(signedTx.from);
      if (!policyStatus.canExecute) {
        throw new Error('User does not meet policy requirements');
      }

      return true;
    } catch (error) {
      console.error('Meta-transaction verification failed:', error);
      return false;
    }
  }

  /**
   * Get the paymaster contract address
   */
  getPaymasterAddress(): string {
    return this.paymasterAddress;
  }

  /**
   * Get the configured chain ID
   */
  getChainId(): number {
    return this.chainId;
  }

  /**
   * Get the underlying contract instance
   */
  getContract(): Contract {
    return this.paymasterContract;
  }

  /**
   * Sign multiple meta-transactions for batch execution
   */
  async signBatchMetaTransactions(
    transactions: Array<{ to: string; data: string; value?: bigint }>,
    deadlineOffset: number = DEFAULT_DEADLINE_OFFSET
  ): Promise<SignedMetaTransaction[]> {
    if (!this.signer) {
      throw new Error('No signer configured. Call setSigner() first.');
    }

    const from = await this.signer.getAddress();
    let currentNonce = await this.getNonce(from);
    const deadline = createDeadline(deadlineOffset);

    const signedTransactions: SignedMetaTransaction[] = [];

    for (const tx of transactions) {
      const metaTx: MetaTransaction = {
        from,
        to: tx.to,
        value: tx.value || 0n,
        data: tx.data,
        nonce: currentNonce,
        deadline,
      };

      // Create EIP-712 typed data
      const typedData = createTypedData(metaTx, this.chainId, this.paymasterAddress);

      // Sign using EIP-712
      const signature = await this.signer.signTypedData(
        typedData.domain,
        typedData.types,
        typedData.message
      );

      const { r, s, v } = splitSignature(signature);

      signedTransactions.push({
        ...metaTx,
        v,
        r,
        s,
      });

      // Increment nonce for next transaction
      currentNonce = currentNonce + 1n;
    }

    return signedTransactions;
  }

  /**
   * Execute a batch of signed meta-transactions
   */
  async executeBatchMetaTransactions(
    signedTransactions: SignedMetaTransaction[],
    relayerSigner?: Signer
  ): Promise<MetaTxResult> {
    const signerToUse = relayerSigner || this.signer;

    if (!signerToUse) {
      throw new Error('No signer available to execute transaction');
    }

    const contractWithSigner = this.paymasterContract.connect(signerToUse);

    try {
      const froms = signedTransactions.map(tx => tx.from);
      const tos = signedTransactions.map(tx => tx.to);
      const values = signedTransactions.map(tx => tx.value);
      const datas = signedTransactions.map(tx => tx.data);
      const nonces = signedTransactions.map(tx => tx.nonce);
      const deadlines = signedTransactions.map(tx => tx.deadline);
      const vs = signedTransactions.map(tx => tx.v);
      const rs = signedTransactions.map(tx => tx.r);
      const ss = signedTransactions.map(tx => tx.s);

      const tx = await contractWithSigner.execute_batch(
        froms, tos, values, datas, nonces, deadlines, vs, rs, ss
      );

      const receipt = await tx.wait();

      return {
        success: true,
        txHash: receipt.hash,
      };
    } catch (error: any) {
      return {
        success: false,
        txHash: '',
        error: error.message || 'Batch execution failed',
      };
    }
  }

  /**
   * Send transactions to a relayer service
   */
  async sendToRelayer(
    signedTx: SignedMetaTransaction,
    relayerUrl: string
  ): Promise<MetaTxResult> {
    try {
      const response = await fetch(`${relayerUrl}/relay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: signedTx.from,
          to: signedTx.to,
          value: signedTx.value.toString(),
          data: signedTx.data,
          nonce: signedTx.nonce.toString(),
          deadline: signedTx.deadline.toString(),
          v: signedTx.v,
          r: signedTx.r,
          s: signedTx.s,
        }),
      });

      const result = await response.json();
      return {
        success: result.success,
        txHash: result.txHash || '',
        error: result.error,
      };
    } catch (error: any) {
      return {
        success: false,
        txHash: '',
        error: error.message || 'Failed to send to relayer',
      };
    }
  }

  /**
   * Send batch transactions to a relayer service
   */
  async sendBatchToRelayer(
    signedTransactions: SignedMetaTransaction[],
    relayerUrl: string
  ): Promise<MetaTxResult> {
    try {
      const transactions = signedTransactions.map(tx => ({
        from: tx.from,
        to: tx.to,
        value: tx.value.toString(),
        data: tx.data,
        nonce: tx.nonce.toString(),
        deadline: tx.deadline.toString(),
        v: tx.v,
        r: tx.r,
        s: tx.s,
      }));

      const response = await fetch(`${relayerUrl}/relay/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions }),
      });

      const result = await response.json();
      return {
        success: result.success,
        txHash: result.txHash || '',
        error: result.error,
      };
    } catch (error: any) {
      return {
        success: false,
        txHash: '',
        error: error.message || 'Failed to send batch to relayer',
      };
    }
  }
}

/**
 * Helper function to convert hex string to Uint8Array
 */
function hexToBytes(hexString: string): Uint8Array {
  const hex = hexString.startsWith('0x') ? hexString.slice(2) : hexString;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}
