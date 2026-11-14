import "server-only";
import bcrypt from "bcryptjs";

const COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Compared against when the email is unknown, so both paths take the same time.
export const DUMMY_HASH = "$2b$12$NczVEiUbn6HDeeUmaQcsSOpdyaO4/2Bl0IL7tP5CUVwcf.Uxegd1W";
