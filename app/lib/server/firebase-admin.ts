import 'server-only';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export function admin() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) throw new Error('Bank connections require Firebase server credentials.');
  const app = getApps().find(a => a.name === 'vault-server') ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }, 'vault-server');
  return { auth: getAuth(app), db: getFirestore(app) };
}
export class ApiError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function ownerUid() {
  const uid = process.env.NEXT_PUBLIC_ALLOWED_USER_UID;
  if (!uid) throw new ApiError('Bank connections are not configured.', 503);
  return uid;
}
export async function requireOwner(request: Request) {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) throw new ApiError('Log in to continue.', 401);
  let uid: string;
  try { uid = (await admin().auth.verifyIdToken(header.slice(7), true)).uid; }
  catch (e) { if (e instanceof Error && e.message.includes('server credentials')) throw new ApiError(e.message, 503); throw new ApiError('Your session expired. Log in again.', 401); }
  if (uid !== ownerUid()) throw new ApiError('This account does not have access.', 403);
  return uid;
}
