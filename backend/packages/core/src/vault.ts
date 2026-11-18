import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

export class SecretVault {
  private readonly masterKey: Buffer;

  constructor(masterKeyHexOrBase64?: string) {
    const raw =
      masterKeyHexOrBase64 ??
      process.env.VAULT_MASTER_KEY ??
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    if (raw.length === 64 && /^[0-9a-fA-F]+$/.test(raw)) {
      this.masterKey = Buffer.from(raw, "hex");
    } else {
      this.masterKey = crypto.createHash("sha256").update(raw, "utf8").digest();
    }
  }

  /**
   * Encrypts a raw API key or OAuth token using AES-256-GCM with a random 96-bit IV.
   * Format: v1:<iv_b64>:<authTag_b64>:<ciphertext_b64>
   */
  encrypt(plaintext: string, aadContext = "devhouse-vault"): string {
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, this.masterKey, iv);
    cipher.setAAD(Buffer.from(aadContext, "utf8"));
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `v1:${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
  }

  /**
   * Decrypts an AES-256-GCM envelope. Throws if tampered or wrong AAD/master key.
   */
  decrypt(envelope: string, aadContext = "devhouse-vault"): string {
    const parts = envelope.split(":");
    if (parts.length !== 4 || parts[0] !== "v1") {
      throw new Error("Invalid vault envelope format");
    }
    const iv = Buffer.from(parts[1]!, "base64");
    const authTag = Buffer.from(parts[2]!, "base64");
    const ciphertext = Buffer.from(parts[3]!, "base64");
    const decipher = crypto.createDecipheriv(ALGORITHM, this.masterKey, iv);
    decipher.setAAD(Buffer.from(aadContext, "utf8"));
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8");
  }

  /**
   * Permanently masks a raw secret for safe UI display. Never returns the middle entropy.
   */
  static maskSecret(rawSecret: string): string {
    const clean = rawSecret.trim();
    if (clean.length <= 10) {
      return `${clean.slice(0, 2)}••••••••••••`;
    }
    return `${clean.slice(0, 7)}••••••••••••••••••••••${clean.slice(-4)}`;
  }
}
