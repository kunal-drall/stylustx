import React, { useState } from 'react';

interface GaslessTxFormProps {
  targetAddress: string;
  userNonce: bigint;
  isLoading: boolean;
  onSign: (data: string) => Promise<void>;
}

export function GaslessTxForm({
  targetAddress,
  userNonce,
  isLoading,
  onSign,
}: GaslessTxFormProps) {
  const [callData, setCallData] = useState('0x');
  const [status, setStatus] = useState<'idle' | 'signing' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('signing');
    setErrorMsg('');

    try {
      await onSign(callData);
      setStatus('success');
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message || 'Failed to sign transaction');
    }
  };

  return (
    <div className="gasless-form">
      <h2>Create Gasless Transaction</h2>

      <div className="info-row">
        <label>Target Contract:</label>
        <span className="mono">{targetAddress || 'Not configured'}</span>
      </div>

      <div className="info-row">
        <label>Your Nonce:</label>
        <span className="mono">{userNonce.toString()}</span>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="callData">Call Data (hex):</label>
          <input
            id="callData"
            type="text"
            value={callData}
            onChange={(e) => setCallData(e.target.value)}
            placeholder="0x..."
            className="input"
          />
          <small>Enter the encoded function call data for the target contract</small>
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={isLoading || status === 'signing'}
        >
          {status === 'signing' ? 'Signing...' : 'Sign Gasless Transaction'}
        </button>
      </form>

      {status === 'success' && (
        <div className="alert alert-success">
          Transaction signed successfully! Ready to be relayed.
        </div>
      )}

      {status === 'error' && (
        <div className="alert alert-error">
          {errorMsg}
        </div>
      )}
    </div>
  );
}
