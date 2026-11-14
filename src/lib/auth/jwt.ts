// JWT sign/verify with no Next.js or Node-only imports, so proxy.ts can use it too.
import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "ep_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type Role = "ADMIN" | "STAFF";
export type SessionPayload = { sub: string; role: Role; sv: number };

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters.");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ role: payload.role, sv: payload.sv })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string") return null;
    if (payload.role !== "ADMIN" && payload.role !== "STAFF") return null;
    if (typeof payload.sv !== "number") return null;
    return { sub: payload.sub, role: payload.role, sv: payload.sv };
  } catch {
    return null;
  }
}
