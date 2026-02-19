import { Request, Response, NextFunction } from 'express';
import { isAddress, isHexString } from 'ethers';

interface ValidationError {
  field: string;
  message: string;
}

function validateAddress(value: any, field: string): ValidationError | null {
  if (!value || typeof value !== 'string') {
    return { field, message: `${field} is required` };
  }
  if (!isAddress(value)) {
    return { field, message: `${field} must be a valid Ethereum address` };
  }
  return null;
}

function validateHexString(value: any, field: string): ValidationError | null {
  if (!value || typeof value !== 'string') {
    return { field, message: `${field} is required` };
  }
  if (!isHexString(value)) {
    return { field, message: `${field} must be a valid hex string` };
  }
  return null;
}

function validateBigIntString(value: any, field: string): ValidationError | null {
  if (value === undefined || value === null) {
    return { field, message: `${field} is required` };
  }
  try {
    BigInt(value);
    return null;
  } catch {
    return { field, message: `${field} must be a valid integer string` };
  }
}

function validateSignatureV(value: any): ValidationError | null {
  if (typeof value !== 'number' || (value !== 27 && value !== 28 && value !== 0 && value !== 1)) {
    return { field: 'v', message: 'v must be 0, 1, 27, or 28' };
  }
  return null;
}

function validateSignedMetaTx(tx: any): ValidationError[] {
  const errors: ValidationError[] = [];

  const fromError = validateAddress(tx.from, 'from');
  if (fromError) errors.push(fromError);

  const toError = validateAddress(tx.to, 'to');
  if (toError) errors.push(toError);

  const valueError = validateBigIntString(tx.value, 'value');
  if (valueError) errors.push(valueError);

  const dataError = validateHexString(tx.data, 'data');
  if (dataError) errors.push(dataError);

  const nonceError = validateBigIntString(tx.nonce, 'nonce');
  if (nonceError) errors.push(nonceError);

  const deadlineError = validateBigIntString(tx.deadline, 'deadline');
  if (deadlineError) errors.push(deadlineError);

  const vError = validateSignatureV(tx.v);
  if (vError) errors.push(vError);

  const rError = validateHexString(tx.r, 'r');
  if (rError) errors.push(rError);

  const sError = validateHexString(tx.s, 's');
  if (sError) errors.push(sError);

  return errors;
}

export function validateMetaTxRequest(req: Request, res: Response, next: NextFunction) {
  const errors = validateSignedMetaTx(req.body);

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors,
    });
  }

  next();
}

export function validateBatchRequest(req: Request, res: Response, next: NextFunction) {
  const { transactions } = req.body;

  if (!Array.isArray(transactions)) {
    return res.status(400).json({
      success: false,
      error: 'transactions must be an array',
    });
  }

  if (transactions.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'transactions array cannot be empty',
    });
  }

  if (transactions.length > 10) {
    return res.status(400).json({
      success: false,
      error: 'Maximum 10 transactions per batch',
    });
  }

  for (let i = 0; i < transactions.length; i++) {
    const errors = validateSignedMetaTx(transactions[i]);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Validation failed for transaction at index ${i}`,
        details: errors,
      });
    }
  }

  next();
}
