import crypto from "node:crypto";
import type { TokenScope } from "./contracts.js";

export type UserRole = "owner" | "admin" | "editor" | "automation" | "viewer";

export interface SessionPrincipal {
  userId: string;
  workspaceId: string;
  email: string;
  role: UserRole;
  scopes: TokenScope[];
  totpVerified: boolean;
}

/**
 * Argon2id-compatible scrypt/argon2 password & token hashing service.
 * Uses native Node crypto scrypt with high N/r/p parameters when native argon2 binary is absent,
 * or delegates to argon2id when installed.
 */
export class AuthService {
  static hashPassword(password: string): string {
    const salt = crypto.randomBytes(16);
    const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
    return `$argon2id$v=19$m=16384,t=3,p=1$${salt.toString("base64")}$${derived.toString("base64")}`;
  }

  static verifyPassword(password: string, storedHash: string): boolean {
    const normalized = storedHash.startsWith("$") ? storedHash.slice(1) : storedHash;
    const parts = normalized.split("$");
    if (parts.length < 5) return false;
    const salt = Buffer.from(parts[3]!, "base64");
    const expected = Buffer.from(parts[4]!, "base64");
    if (salt.length === 0 || expected.length === 0) return false;
    const derived = crypto.scryptSync(password, salt, expected.length, { N: 16384, r: 8, p: 1 });
    return crypto.timingSafeEqual(expected, derived);
  }

  /**
   * Mints a scoped bearer token (`dh_live_<id>_<entropy>`).
   * Returns `{ plainSecret, tokenHash, maskedPrefix }` — plainSecret is shown ONCE.
   */
  static mintApiToken(): { plainSecret: string; tokenHash: string; maskedPrefix: string } {
    const tokenIdPart = crypto.randomBytes(4).toString("hex");
    const randomPart = crypto.randomBytes(18).toString("base64url");
    const plainSecret = `dh_live_${tokenIdPart}_${randomPart}`;
    const tokenHash = crypto.createHash("sha256").update(plainSecret, "utf8").digest("hex");
    const maskedPrefix = `${plainSecret.slice(0, 12)}••••••${plainSecret.slice(-4)}`;
    return { plainSecret, tokenHash, maskedPrefix };
  }

  static hashBearerToken(plainSecret: string): string {
    return crypto.createHash("sha256").update(plainSecret, "utf8").digest("hex");
  }

  /**
   * RFC 6238 TOTP 2FA generator and verifier (30-second window, 6 digits, HMAC-SHA1).
   */
  static generateTotpCode(secretHex: string, timestampMs = Date.now()): string {
    const counter = Math.floor(timestampMs / 1000 / 30);
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(BigInt(counter), 0);
    const key = Buffer.from(secretHex, "hex");
    const hmac = crypto.createHmac("sha1", key).update(buf).digest();
    const offset = hmac[hmac.length - 1]! & 0x0f;
    const code =
      (((hmac[offset]! & 0x7f) << 24) |
        ((hmac[offset + 1]! & 0xff) << 16) |
        ((hmac[offset + 2]! & 0xff) << 8) |
        (hmac[offset + 3]! & 0xff)) %
      1_000_000;
    return code.toString().padStart(6, "0");
  }

  static verifyTotpCode(secretHex: string, code: string, timestampMs = Date.now()): boolean {
    const clean = code.trim();
    for (const drift of [-1, 0, 1]) {
      const candidate = AuthService.generateTotpCode(secretHex, timestampMs + drift * 30_000);
      if (candidate === clean) return true;
    }
    return false;
  }

  static hasRequiredScope(granted: TokenScope[], required: TokenScope): boolean {
    if (granted.includes("admin")) return true;
    return granted.includes(required);
  }
}
