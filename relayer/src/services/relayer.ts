import { Contract, JsonRpcProvider, Wallet, formatEther } from 'ethers';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import PAYMASTER_ABI from '../../../contracts/paymaster/abi.json';

export interface RelayerConfig {
  paymasterAddress: string;
  rpcUrl: string;
  relayerPrivateKey: string;
  chainId: number;
}

export interface SignedMetaTransaction {
  from: string;
  to: string;
  value: string;
  data: string;
  nonce: string;
  deadline: string;
  v: number;
  r: string;
  s: string;
}

export interface RelayResult {
  success: boolean;
  txHash?: string;
  error?: string;
  requestId?: string;
}

export interface TransactionStatus {
  txHash: string;
  status: 'pending' | 'confirmed' | 'failed';
  blockNumber?: number;
  gasUsed?: string;
}

export interface RelayerInfo {
  address: string;
  balance: string;
  paymaster: string;
  chainId: number;
  paymasterInitialized: boolean;
  paymasterPaused: boolean;
  allowedTarget: string;
}

export interface PolicyStatus {
  tokenGateEnabled: boolean;
  requiredToken?: string;
  requiredBalance?: string;
  isERC721?: boolean;
  dailyTxLimit: string;
  userDailyTxCount: string;
  maxGasPerTx: string;
  canExecute: boolean;
}

export class RelayerService {
  private provider: JsonRpcProvider;
  private wallet: Wallet;
  private paymasterContract: Contract;
  private paymasterAddress: string;
  private chainId: number;
  private pendingTxs: Map<string, string> = new Map();

  constructor(config: RelayerConfig) {
    this.provider = new JsonRpcProvider(config.rpcUrl);
    this.wallet = new Wallet(config.relayerPrivateKey, this.provider);
    this.paymasterAddress = config.paymasterAddress;
    this.chainId = config.chainId;

    this.paymasterContract = new Contract(
      config.paymasterAddress,
      PAYMASTER_ABI,
      this.wallet
    );

    logger.info(`Relayer initialized: ${this.wallet.address}`);
  }

  getRelayerAddress(): string {
    return this.wallet.address;
  }

  async getInfo(): Promise<RelayerInfo> {
    const [balance, initialized, paused, allowedTarget] = await Promise.all([
      this.provider.getBalance(this.wallet.address),
      this.paymasterContract.is_initialized().catch(() => false),
      this.paymasterContract.is_paused().catch(() => false),
      this.paymasterContract.get_allowed_target().catch(() => '0x0000000000000000000000000000000000000000'),
    ]);

    return {
      address: this.wallet.address,
      balance: formatEther(balance),
      paymaster: this.paymasterAddress,
      chainId: this.chainId,
      paymasterInitialized: initialized,
      paymasterPaused: paused,
      allowedTarget,
    };
  }

  async getNonce(userAddress: string): Promise<bigint> {
    return await this.paymasterContract.get_nonce(userAddress);
  }

  async getPolicyStatus(userAddress: string, gasLimit: bigint): Promise<PolicyStatus> {
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
      requiredBalance: tokenGateEnabled ? requiredBalance.toString() : undefined,
      isERC721: tokenGateEnabled ? isERC721 : undefined,
      dailyTxLimit: dailyTxLimit.toString(),
      userDailyTxCount: userDailyTxCount.toString(),
      maxGasPerTx: maxGasPerTx.toString(),
      canExecute,
    };
  }

  async relay(signedTx: SignedMetaTransaction): Promise<RelayResult> {
    const requestId = uuidv4();

    try {
      logger.info(`[${requestId}] Relaying transaction from ${signedTx.from}`);

      // Validate deadline hasn't expired
      const currentTime = Math.floor(Date.now() / 1000);
      if (BigInt(signedTx.deadline) <= BigInt(currentTime)) {
        return {
          success: false,
          error: 'Transaction deadline expired',
          requestId,
        };
      }

      // Execute the transaction
      const tx = await this.paymasterContract.execute(
        signedTx.from,
        signedTx.to,
        BigInt(signedTx.value),
        signedTx.data,
        BigInt(signedTx.nonce),
        BigInt(signedTx.deadline),
        signedTx.v,
        signedTx.r,
        signedTx.s
      );

      this.pendingTxs.set(tx.hash, requestId);
      logger.info(`[${requestId}] Transaction submitted: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await tx.wait();
      this.pendingTxs.delete(tx.hash);

      if (receipt.status === 1) {
        logger.info(`[${requestId}] Transaction confirmed: ${tx.hash}`);
        return {
          success: true,
          txHash: tx.hash,
          requestId,
        };
      } else {
        logger.warn(`[${requestId}] Transaction reverted: ${tx.hash}`);
        return {
          success: false,
          txHash: tx.hash,
          error: 'Transaction reverted',
          requestId,
        };
      }
    } catch (error: any) {
      logger.error(`[${requestId}] Relay error:`, error);
      return {
        success: false,
        error: error.reason || error.message || 'Unknown error',
        requestId,
      };
    }
  }

  async relayBatch(transactions: SignedMetaTransaction[]): Promise<RelayResult> {
    const requestId = uuidv4();

    try {
      logger.info(`[${requestId}] Relaying batch of ${transactions.length} transactions`);

      // Extract arrays for batch call
      const froms = transactions.map(tx => tx.from);
      const tos = transactions.map(tx => tx.to);
      const values = transactions.map(tx => BigInt(tx.value));
      const datas = transactions.map(tx => tx.data);
      const nonces = transactions.map(tx => BigInt(tx.nonce));
      const deadlines = transactions.map(tx => BigInt(tx.deadline));
      const vs = transactions.map(tx => tx.v);
      const rs = transactions.map(tx => tx.r);
      const ss = transactions.map(tx => tx.s);

      // Execute batch
      const tx = await this.paymasterContract.execute_batch(
        froms, tos, values, datas, nonces, deadlines, vs, rs, ss
      );

      this.pendingTxs.set(tx.hash, requestId);
      logger.info(`[${requestId}] Batch submitted: ${tx.hash}`);

      const receipt = await tx.wait();
      this.pendingTxs.delete(tx.hash);

      if (receipt.status === 1) {
        logger.info(`[${requestId}] Batch confirmed: ${tx.hash}`);
        return {
          success: true,
          txHash: tx.hash,
          requestId,
        };
      } else {
        return {
          success: false,
          txHash: tx.hash,
          error: 'Batch transaction reverted',
          requestId,
        };
      }
    } catch (error: any) {
      logger.error(`[${requestId}] Batch relay error:`, error);
      return {
        success: false,
        error: error.reason || error.message || 'Unknown error',
        requestId,
      };
    }
  }

  async getTransactionStatus(txHash: string): Promise<TransactionStatus> {
    try {
      const receipt = await this.provider.getTransactionReceipt(txHash);

      if (!receipt) {
        return {
          txHash,
          status: 'pending',
        };
      }

      return {
        txHash,
        status: receipt.status === 1 ? 'confirmed' : 'failed',
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
      };
    } catch (error) {
      return {
        txHash,
        status: 'pending',
      };
    }
  }
}
