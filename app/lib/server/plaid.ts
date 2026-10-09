import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import { ApiError } from './firebase-admin';

export const bankId = (value: string) => createHash('sha256').update(value).digest('hex');
export function plaid() {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const environment = process.env.PLAID_ENV ?? 'sandbox';
  if (!clientId || !secret || !['sandbox', 'production'].includes(environment)) throw new ApiError('Bank connections are not configured.', 503);
  return new PlaidApi(new Configuration({ basePath: PlaidEnvironments[environment], baseOptions: {
    timeout: 20000, headers: { 'PLAID-CLIENT-ID': clientId, 'PLAID-SECRET': secret },
  } }));
}
function encryptionKey() {
  const raw = process.env.PLAID_TOKEN_ENCRYPTION_KEY ?? '';
  if (!/^[a-fA-F0-9]{64}$/.test(raw)) throw new ApiError('Bank token encryption is not configured.', 503);
  return Buffer.from(raw, 'hex');
}
export function encryptToken(token: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), nonce);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [nonce, cipher.getAuthTag(), encrypted].map(b => b.toString('base64')).join('.');
}
export function decryptToken(token: string) {
  const [nonce, tag, encrypted] = token.split('.').map(p => Buffer.from(p, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
export function secretEquals(actual: string, expected: string) {
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function plaidErrorCode(error: unknown): string {
  return (error as { response?: { data?: { error_code?: string } } })?.response?.data?.error_code ?? '';
}
export function safeBankError(error: unknown) {
  if (error instanceof ApiError) return error.message;
  switch (plaidErrorCode(error)) {
    case 'ITEM_LOGIN_REQUIRED': return 'Reconnect this bank to continue syncing.';
    case 'PRODUCT_NOT_READY': return 'Your bank is still preparing transactions. Try syncing again later.';
    case 'INSTITUTION_DOWN': case 'INSTITUTION_NOT_RESPONDING': return 'Your bank is temporarily unavailable. Try again later.';
    case 'INVALID_CREDENTIALS': case 'INVALID_API_KEYS': return 'Check your Plaid API keys and environment in Vercel.';
    case 'RATE_LIMIT_EXCEEDED': return 'The bank sync limit was reached. Try again later.';
    default: return 'Could not complete the bank request. Check the server configuration or try again later.';
  }
}
