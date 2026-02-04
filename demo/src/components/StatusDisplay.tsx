import React from 'react';

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

interface StatusDisplayProps {
  transactions: SignedTransaction[];
  onExecute?: (tx: SignedTransaction) => Promise<void>;
}

export function StatusDisplay({ transactions, onExecute }: StatusDisplayProps) {
  if (transactions.length === 0) {
    return (
      <div className="status-display">
        <h2>Transaction History</h2>
        <p className="empty-state">No transactions yet. Sign a gasless transaction above.</p>
      </div>
    );
  }

  const formatAddress = (addr: string) => `${addr.slice(0, 10)}...${addr.slice(-8)}`;
  const formatHash = (hash: string) => `${hash.slice(0, 14)}...${hash.slice(-12)}`;

  return (
    <div className="status-display">
      <h2>Transaction History</h2>
      <div className="tx-list">
        {transactions.map((tx, index) => (
          <div key={index} className={`tx-card tx-${tx.status}`}>
            <div className="tx-header">
              <span className={`status-badge status-${tx.status}`}>
                {tx.status.toUpperCase()}
              </span>
              <span className="tx-nonce">Nonce: {tx.nonce}</span>
            </div>

            <div className="tx-details">
              <div className="tx-row">
                <span className="label">From:</span>
                <span className="mono">{formatAddress(tx.from)}</span>
              </div>
              <div className="tx-row">
                <span className="label">To:</span>
                <span className="mono">{formatAddress(tx.to)}</span>
              </div>
              <div className="tx-row">
                <span className="label">Data:</span>
                <span className="mono">{tx.data.length > 20 ? formatHash(tx.data) : tx.data}</span>
              </div>
              {tx.txHash && (
                <div className="tx-row">
                  <span className="label">Tx Hash:</span>
                  <a
                    href={`https://sepolia.arbiscan.io/tx/${tx.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mono link"
                  >
                    {formatHash(tx.txHash)}
                  </a>
                </div>
              )}
            </div>

            {tx.status === 'signed' && onExecute && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => onExecute(tx)}
              >
                Execute (Relay)
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
