import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';

type TokenPayload = { sub: string; role: string };

export function signToken(userId: string, role: string): string {
  const options: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] };
  return jwt.sign({ sub: userId, role }, env.JWT_SECRET, options);
}

export function verifyToken(token: string): TokenPayload {
  const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
  return { sub: String(payload.sub), role: String(payload.role) };
}
