import React from 'react';

interface WalletConnectProps {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  isWrongNetwork: boolean;
  error: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onSwitchNetwork: () => void;
}

export function WalletConnect({
  address,
  isConnected,
  isConnecting,
  isWrongNetwork,
  error,
  onConnect,
  onDisconnect,
  onSwitchNetwork,
}: WalletConnectProps) {
  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  if (isConnected && address) {
    return (
      <div className="wallet-container">
        <div className="wallet-info">
          <span className="wallet-address">{formatAddress(address)}</span>
          {isWrongNetwork && (
            <button className="btn btn-warning" onClick={onSwitchNetwork}>
              Switch to Arbitrum Sepolia
            </button>
          )}
          <button className="btn btn-secondary" onClick={onDisconnect}>
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wallet-container">
      <button
        className="btn btn-primary"
        onClick={onConnect}
        disabled={isConnecting}
      >
        {isConnecting ? 'Connecting...' : 'Connect Wallet'}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
