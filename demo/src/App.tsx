import React, { useState, useEffect } from 'react';
import { useWallet } from './hooks/useWallet';
import { WalletConnect } from './components/WalletConnect';
import { GaslessTxForm } from './components/GaslessTxForm';
import { StatusDisplay } from './components/StatusDisplay';
import './App.css';

// Configuration - update these after deployment
const PAYMASTER_ADDRESS = import.meta.env.VITE_PAYMASTER_ADDRESS || '';
const TARGET_ADDRESS = import.meta.env.VITE_TARGET_ADDRESS || '';

interface SignedTransaction {
  from: string;
  to: string;
  value: string;
  data: string;
  nonce: string;
  deadline: string;
  signature: {
    v: number;
    r: string;
    s: string;
  };
  txHash?: string;
  status: 'signed' | 'pending' | 'success' | 'failed';
}

function App() {
  const wallet = useWallet();
  const [userNonce, setUserNonce] = useState<bigint>(0n);
  const [transactions, setTransactions] = useState<SignedTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch user nonce when wallet connects
  useEffect(() => {
    if (wallet.isConnected && wallet.address && PAYMASTER_ADDRESS) {
      fetchNonce();
    }
  }, [wallet.isConnected, wallet.address]);

  const fetchNonce = async () => {
    // In production, this would call the contract
    // For demo, we track locally
    setUserNonce(BigInt(transactions.filter(t => t.status !== 'failed').length));
  };

  const handleSign = async (callData: string) => {
    if (!wallet.signer || !wallet.address) {
      throw new Error('Wallet not connected');
    }

    setIsLoading(true);

    try {
      // Create deadline (5 minutes from now)
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

      // Create message hash (matching contract format)
      const { keccak256, concat, toUtf8Bytes, zeroPadValue, toBeHex, getBytes } = await import('ethers');

      const domainBytes = toUtf8Bytes('StylusTx');
      const fromBytes = getBytes(wallet.address);
      const toBytes = getBytes(TARGET_ADDRESS || '0x0000000000000000000000000000000000000000');
      const valueBytes = zeroPadValue(toBeHex(0n), 32);
      const dataHash = keccak256(callData);
      const dataHashBytes = getBytes(dataHash);
      const nonceBytes = zeroPadValue(toBeHex(userNonce), 32);
      const deadlineBytes = zeroPadValue(toBeHex(deadline), 32);

      const message = concat([
        domainBytes,
        fromBytes,
        toBytes,
        valueBytes,
        dataHashBytes,
        nonceBytes,
        deadlineBytes,
      ]);

      const messageHash = keccak256(message);

      // Sign the message
      const signature = await wallet.signer.signMessage(getBytes(messageHash));

      // Parse signature into v, r, s
      const { Signature } = await import('ethers');
      const sig = Signature.from(signature);

      const signedTx: SignedTransaction = {
        from: wallet.address,
        to: TARGET_ADDRESS || '0x0000000000000000000000000000000000000000',
        value: '0',
        data: callData,
        nonce: userNonce.toString(),
        deadline: deadline.toString(),
        signature: {
          v: sig.v,
          r: sig.r,
          s: sig.s,
        },
        status: 'signed',
      };

      setTransactions(prev => [signedTx, ...prev]);
      setUserNonce(prev => prev + 1n);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>StylusTx Demo</h1>
        <p className="subtitle">Gasless Transactions on Arbitrum</p>
        <WalletConnect
          address={wallet.address}
          isConnected={wallet.isConnected}
          isConnecting={wallet.isConnecting}
          isWrongNetwork={wallet.isWrongNetwork}
          error={wallet.error}
          onConnect={wallet.connect}
          onDisconnect={wallet.disconnect}
          onSwitchNetwork={wallet.switchToArbitrumSepolia}
        />
      </header>

      <main className="main">
        {!PAYMASTER_ADDRESS && (
          <div className="alert alert-warning">
            Paymaster contract not configured. Set VITE_PAYMASTER_ADDRESS in .env
          </div>
        )}

        {wallet.isConnected ? (
          <>
            <GaslessTxForm
              targetAddress={TARGET_ADDRESS}
              userNonce={userNonce}
              isLoading={isLoading}
              onSign={handleSign}
            />
            <StatusDisplay transactions={transactions} />
          </>
        ) : (
          <div className="connect-prompt">
            <h2>Welcome to StylusTx</h2>
            <p>Connect your wallet to start sending gasless transactions.</p>
            <ul className="features">
              <li>Sign transactions without paying gas</li>
              <li>Secure signature verification on-chain</li>
              <li>Powered by Arbitrum Stylus</li>
            </ul>
          </div>
        )}
      </main>

      <footer className="footer">
        <p>Built with Stylus on Arbitrum</p>
        <a
          href="https://github.com/kunal-drall/stylustx"
          target="_blank"
          rel="noopener noreferrer"
        >
          View Source
        </a>
      </footer>
    </div>
  );
}

export default App;
