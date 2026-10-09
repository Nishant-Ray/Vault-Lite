import { firebase } from './firebase';
export async function bankRequest<T>(body?: Record<string, unknown>): Promise<T> {
  const user = firebase().auth.currentUser;
  if (!user) throw new Error('Log in to continue.');
  const response = await fetch('/api/plaid', {
    method: body ? 'POST' : 'GET', cache: 'no-store',
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not complete the bank request.');
  return result as T;
}
