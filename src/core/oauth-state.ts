import { randomBytes, createHash } from 'node:crypto';

/**
 * In-memory state storage for OAuth CSRF protection.
 * State tokens expire after 10 minutes.
 */

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface StateEntry {
  state: string;
  scopes: string[];
  codeVerifier: string;
  createdAt: number;
}

// In-memory store - cleared on process restart
const stateStore = new Map<string, StateEntry>();

/**
 * Generates a cryptographically secure state parameter for OAuth.
 * Also generates PKCE code verifier for enhanced security.
 *
 * @param scopes - The OAuth scopes being requested
 * @returns Object containing state, codeVerifier, and codeChallenge
 */
export function generateState(scopes: string[]): {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
} {
  // Clean up expired entries
  cleanupExpiredStates();

  // Generate cryptographically secure state
  const state = randomBytes(32).toString('base64url');

  // Generate PKCE code verifier (43-128 chars, URL-safe)
  const codeVerifier = randomBytes(32).toString('base64url');

  // Generate code challenge (S256 method)
  const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  // Store state with metadata
  stateStore.set(state, {
    state,
    scopes,
    codeVerifier,
    createdAt: Date.now(),
  });

  return { state, codeVerifier, codeChallenge };
}

/**
 * Validates a state parameter returned from OAuth callback.
 * Returns the associated metadata if valid, null if invalid/expired.
 *
 * @param state - The state parameter from the callback URL
 * @returns StateEntry if valid, null if invalid or expired
 */
export function validateState(state: string): {
  scopes: string[];
  codeVerifier: string;
} | null {
  const entry = stateStore.get(state);

  if (!entry) {
    return null;
  }

  // Check if expired
  if (Date.now() - entry.createdAt > STATE_TTL_MS) {
    stateStore.delete(state);
    return null;
  }

  // Valid - remove from store (one-time use)
  stateStore.delete(state);

  return {
    scopes: entry.scopes,
    codeVerifier: entry.codeVerifier,
  };
}

/**
 * Removes all expired state entries from the store.
 */
function cleanupExpiredStates(): void {
  const now = Date.now();
  for (const [key, entry] of stateStore) {
    if (now - entry.createdAt > STATE_TTL_MS) {
      stateStore.delete(key);
    }
  }
}

/**
 * Returns the number of pending states (for testing/debugging).
 */
export function getPendingStateCount(): number {
  cleanupExpiredStates();
  return stateStore.size;
}

/**
 * Clears all stored states (for testing).
 */
export function clearAllStates(): void {
  stateStore.clear();
}
