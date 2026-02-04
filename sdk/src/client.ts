import { Contract, Provider, Signer, JsonRpcProvider, Signature } from 'ethers';
import { PAYMASTER_CONTRACT_ABI, DEFAULT_DEADLINE_OFFSET } from './constants';
import { computeMessageHash, createDeadline } from './utils/hashing';
import {
  StylusTxConfig,
  MetaTransaction,
  SignedMetaTransaction,
  MetaTxResult,
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
    return await this.paymasterContract.getNonce(userAddress);
  }

  /**
   * Get the allowed target contract address
   */
  async getAllowedTarget(): Promise<string> {
    return await this.paymasterContract.getAllowedTarget();
  }

  /**
   * Check if the contract is initialized
   */
  async isInitialized(): Promise<boolean> {
    return await this.paymasterContract.isInitialized();
  }

  /**
   * Check if the contract is paused
   */
  async isPaused(): Promise<boolean> {
    return await this.paymasterContract.isPaused();
  }

  /**
   * Sign a meta-transaction using the configured signer
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

    // Compute message hash
    const messageHash = computeMessageHash(tx);

    // Sign the message hash
    const signature = await this.signer.signMessage(getBytes(messageHash));
    const sig = Signature.from(signature);

    return {
      ...tx,
      v: sig.v,
      r: sig.r,
      s: sig.s,
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
}

// Helper function to get bytes from a hex string (for signing)
function getBytes(hexString: string): Uint8Array {
  const hex = hexString.startsWith('0x') ? hexString.slice(2) : hexString;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}
