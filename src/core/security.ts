import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // NIST recommended for GCM
const AUTH_TAG_LENGTH = 16;

/**
 * SecurityGuard handles encryption/decryption of sensitive data (OAuth tokens)
 * using AES-256-GCM authenticated encryption.
 */
export class SecurityGuard {
  private readonly key: Buffer;

  constructor(encryptionKey?: string) {
    const envKey = encryptionKey ?? process.env.MCP_ENCRYPTION_KEY;

    if (!envKey) {
      throw new Error(
        'FATAL: MCP_ENCRYPTION_KEY is required.\n' +
        'Generate one with: openssl rand -hex 32'
      );
    }

    if (envKey.length !== 64) {
      throw new Error(
        'FATAL: MCP_ENCRYPTION_KEY must be exactly 64 hexadecimal characters (256 bits).\n' +
        `Current length: ${envKey.length}`
      );
    }

    if (!/^[0-9a-fA-F]+$/.test(envKey)) {
      throw new Error(
        'FATAL: MCP_ENCRYPTION_KEY must contain only hexadecimal characters (0-9, a-f).'
      );
    }

    // Reject obvious default/example keys
    if (envKey === '0'.repeat(64) || envKey === 'a'.repeat(64)) {
      throw new Error(
        'FATAL: Using a default encryption key is not allowed.\n' +
        'Generate a unique key with: openssl rand -hex 32'
      );
    }

    this.key = Buffer.from(envKey, 'hex');
  }

  /**
   * Encrypts plaintext using AES-256-GCM.
   * Returns format: iv:authTag:ciphertext (all hex-encoded)
   */
  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);

    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
  }

  /**
   * Decrypts a payload encrypted by encrypt().
   * Throws if payload is invalid or tampered.
   */
  decrypt(encryptedPayload: string): string {
    const parts = encryptedPayload.split(':');

    if (parts.length !== 3) {
      throw new Error(
        'Invalid encrypted payload format. Expected iv:authTag:ciphertext'
      );
    }

    const [ivHex, authTagHex, ciphertextHex] = parts;

    if (ivHex.length !== IV_LENGTH * 2) {
      throw new Error(`Invalid IV length. Expected ${IV_LENGTH * 2} hex chars.`);
    }

    if (authTagHex.length !== AUTH_TAG_LENGTH * 2) {
      throw new Error(`Invalid auth tag length. Expected ${AUTH_TAG_LENGTH * 2} hex chars.`);
    }

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);

    try {
      let plaintext = decipher.update(ciphertextHex, 'hex', 'utf8');
      plaintext += decipher.final('utf8');
      return plaintext;
    } catch (error) {
      throw new Error(
        'Decryption failed. The data may be corrupted or tampered with.'
      );
    }
  }

  /**
   * Returns a fingerprint of the encryption key for audit logging.
   * Never exposes the actual key.
   */
  getKeyFingerprint(): string {
    return createHash('sha256')
      .update(this.key)
      .digest('hex')
      .substring(0, 16);
  }
}

/**
 * Singleton instance for convenience.
 * Initialised lazily on first access.
 */
let securityGuardInstance: SecurityGuard | null = null;

export function getSecurityGuard(): SecurityGuard {
  if (!securityGuardInstance) {
    securityGuardInstance = new SecurityGuard();
  }
  return securityGuardInstance;
}
