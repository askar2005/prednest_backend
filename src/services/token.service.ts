import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';

type TokenPayload = { sub: string; role: string };

export function signToken(userId: string, role: string): string {
  console.log('[TOKEN] signToken called for userId:', userId, 'role:', role);
  const options: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] };
  console.log('[TOKEN] JWT_EXPIRES_IN:', env.JWT_EXPIRES_IN);
  const token = jwt.sign({ sub: userId, role }, env.JWT_SECRET, options);
  console.log('[TOKEN] signToken SUCCESS — token length:', token.length, 'expiresIn:', env.JWT_EXPIRES_IN);
  return token;
}

export function verifyToken(token: string): TokenPayload {
  console.log('[TOKEN] verifyToken called — token length:', token.length);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    console.log('[TOKEN] verifyToken SUCCESS — sub:', payload.sub, 'role:', payload.role);
    return { sub: String(payload.sub), role: String(payload.role) };
  } catch (err) {
    console.log('[TOKEN] verifyToken FAILED:', err instanceof Error ? err.message : err);
    throw err;
  }
}
