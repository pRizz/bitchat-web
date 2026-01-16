/**
 * IdentityStore.ts - Identity and peer management with encryption
 *
 * Wraps KeyManager and provides:
 * - Peer trust/verification storage
 * - Settings persistence
 * - Encrypted storage for sensitive data
 */

import { getDatabase, type StoredPeer } from './Database';
import { keyManager } from '@/crypto';
import type { PeerInfo, NostrIdentity } from '@/types';

/**
 * Initialize identity system
 * Delegates to KeyManager but provides unified API
 */
export async function initializeIdentity(): Promise<NostrIdentity> {
  await keyManager.initialize();
  return keyManager.getOrCreateNostrIdentity();
}

/**
 * Check if identity exists
 */
export async function hasIdentity(): Promise<boolean> {
  await keyManager.initialize();
  return keyManager.hasIdentity();
}

/**
 * Import identity from nsec
 */
export async function importIdentity(nsec: string): Promise<NostrIdentity> {
  await keyManager.initialize();
  return keyManager.importNostrIdentity(nsec);
}

/**
 * Export identity for backup
 */
export async function exportIdentity(): Promise<string> {
  return keyManager.exportKeys();
}

/**
 * Delete identity and all associated data
 */
export async function deleteIdentity(): Promise<void> {
  await keyManager.deleteAllKeys();
}

// ============ Peer Management ============

/**
 * Store or update peer information
 */
export async function storePeer(peer: PeerInfo): Promise<void> {
  const db = await getDatabase();
  const existing = await db.get('peers', peer.id);
  const now = Date.now();

  const storedPeer: StoredPeer = {
    ...peer,
    trustedAt: existing?.trustedAt,
    notes: existing?.notes,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  await db.put('peers', storedPeer);
}

/**
 * Get peer by public key
 */
export async function getPeer(publicKeyHex: string): Promise<StoredPeer | undefined> {
  const db = await getDatabase();
  return db.get('peers', publicKeyHex);
}

/**
 * Get all known peers
 */
export async function getAllPeers(): Promise<StoredPeer[]> {
  const db = await getDatabase();
  return db.getAll('peers');
}

/**
 * Get recently active peers
 */
export async function getRecentPeers(limit: number = 20): Promise<StoredPeer[]> {
  const db = await getDatabase();
  const peers = await db.getAllFromIndex('peers', 'by-last-seen');
  return peers.reverse().slice(0, limit);
}

/**
 * Mark peer as trusted (after verification)
 */
export async function trustPeer(publicKeyHex: string): Promise<void> {
  const db = await getDatabase();
  const peer = await db.get('peers', publicKeyHex);
  if (peer) {
    await db.put('peers', {
      ...peer,
      trustedAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
}

/**
 * Update peer notes
 */
export async function setPeerNotes(
  publicKeyHex: string,
  notes: string
): Promise<void> {
  const db = await getDatabase();
  const peer = await db.get('peers', publicKeyHex);
  if (peer) {
    await db.put('peers', {
      ...peer,
      notes,
      updatedAt: Date.now(),
    });
  }
}

/**
 * Update peer nickname
 */
export async function setPeerNickname(
  publicKeyHex: string,
  nickname: string
): Promise<void> {
  const db = await getDatabase();
  const peer = await db.get('peers', publicKeyHex);
  if (peer) {
    await db.put('peers', {
      ...peer,
      nickname,
      updatedAt: Date.now(),
    });
  }
}

/**
 * Delete peer
 */
export async function deletePeer(publicKeyHex: string): Promise<void> {
  const db = await getDatabase();
  await db.delete('peers', publicKeyHex);
}

/**
 * Clear all peers
 */
export async function clearAllPeers(): Promise<void> {
  const db = await getDatabase();
  await db.clear('peers');
}

// ============ Settings Management ============

/**
 * Store a setting
 */
export async function setSetting<T>(key: string, value: T): Promise<void> {
  const db = await getDatabase();
  await db.put('settings', {
    key,
    value,
    updatedAt: Date.now(),
  });
}

/**
 * Get a setting
 */
export async function getSetting<T>(key: string): Promise<T | undefined> {
  const db = await getDatabase();
  const setting = await db.get('settings', key);
  return setting?.value as T | undefined;
}

/**
 * Get a setting with default
 */
export async function getSettingWithDefault<T>(
  key: string,
  defaultValue: T
): Promise<T> {
  const value = await getSetting<T>(key);
  return value !== undefined ? value : defaultValue;
}

/**
 * Delete a setting
 */
export async function deleteSetting(key: string): Promise<void> {
  const db = await getDatabase();
  await db.delete('settings', key);
}

/**
 * Get all settings
 */
export async function getAllSettings(): Promise<Record<string, unknown>> {
  const db = await getDatabase();
  const settings = await db.getAll('settings');
  const result: Record<string, unknown> = {};
  for (const setting of settings) {
    result[setting.key] = setting.value;
  }
  return result;
}

/**
 * Clear all settings
 */
export async function clearAllSettings(): Promise<void> {
  const db = await getDatabase();
  await db.clear('settings');
}

// ============ Encryption Helpers ============

/**
 * Derive an encryption key from the identity
 * Uses the Nostr private key to derive a symmetric key for local encryption
 */
async function deriveStorageKey(salt: Uint8Array): Promise<CryptoKey> {
  await keyManager.initialize();
  const identity = await keyManager.getOrCreateNostrIdentity();

  // Import private key as base key
  const baseKey = await crypto.subtle.importKey(
    'raw',
    identity.privateKey.buffer as ArrayBuffer,
    'HKDF',
    false,
    ['deriveBits', 'deriveKey']
  );

  // Derive AES-GCM key
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt.buffer as ArrayBuffer,
      info: new TextEncoder().encode('bitchat-storage-encryption'),
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data for storage
 */
export async function encryptForStorage(data: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveStorageKey(salt);

  const encoded = new TextEncoder().encode(data);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  // Combine salt + iv + ciphertext and base64 encode
  const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt data from storage
 */
export async function decryptFromStorage(encrypted: string): Promise<string> {
  const combined = new Uint8Array(
    atob(encrypted)
      .split('')
      .map((c) => c.charCodeAt(0))
  );

  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const ciphertext = combined.slice(28);

  const key = await deriveStorageKey(salt);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Store encrypted setting
 */
export async function setEncryptedSetting(
  key: string,
  value: string
): Promise<void> {
  const encrypted = await encryptForStorage(value);
  await setSetting(key, { encrypted: true, data: encrypted });
}

/**
 * Get encrypted setting
 */
export async function getEncryptedSetting(
  key: string
): Promise<string | undefined> {
  const stored = await getSetting<{ encrypted: boolean; data: string }>(key);
  if (!stored || !stored.encrypted) return undefined;
  return decryptFromStorage(stored.data);
}
