import { SignJWT, jwtVerify } from 'jose';
import { config } from '@/config.js';

const secret = new TextEncoder().encode(config.jwtSecret);
const ALG = 'HS256';

export interface SessionClaims {
  sub: string; // staff id
  email: string;
  name: string;
}

/** Verified session: claims plus when the token was issued (ms epoch). */
export interface VerifiedSession extends SessionClaims {
  issuedAtMs: number;
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ email: claims.email, name: claims.name })
    .setProtectedHeader({ alg: ALG })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(Date.now() / 1000 + config.sessionTtlMs / 1000)
    .sign(secret);
}

export async function verifySession(token: string): Promise<VerifiedSession | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: [ALG] });
    if (!payload.sub || typeof payload.iat !== 'number') return null;
    return {
      sub: payload.sub,
      email: String(payload.email ?? ''),
      name: String(payload.name ?? ''),
      issuedAtMs: payload.iat * 1000,
    };
  } catch {
    return null;
  }
}
