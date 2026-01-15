/**
 * KeyManager - IndexedDB-based secure key storage for BitChat Web
 *
 * Stores cryptographic keys in IndexedDB with Web Crypto API.
 * Note: IndexedDB is less secure than iOS Keychain - keys can be accessed
 * by browser extensions with sufficient permissions.
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { schnorr } from '@noble/curves/secp256k1';
import { bytesToHex } from '@noble/hashes/utils';
import type { NostrIdentity } from '@/types';

interface StoredKey {
  id: string;
  type: 'noise_static' | 'noise_signing' | 'nostr_identity';
  privateKey: ArrayBuffer;
  publicKey: ArrayBuffer;
  createdAt: number;
}

interface BitchatKeyDB extends DBSchema {
  keys: {
    key: string;
    value: StoredKey;
  };
}

const DB_NAME = 'bitchat_keys';
const DB_VERSION = 1;
const STORE_NAME = 'keys';

// Key IDs
const NOISE_STATIC_KEY_ID = 'noise_static';
const NOSTR_IDENTITY_ID = 'nostr_identity';

class KeyManager {
  private db: IDBPDatabase<BitchatKeyDB> | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.db = await openDB<BitchatKeyDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      },
    });

    this.initialized = true;
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.db) {
      throw new Error('KeyManager not initialized. Call initialize() first.');
    }
  }

  /**
   * Generate or retrieve the Noise static key (X25519)
   * Used for Noise Protocol handshakes
   */
  async getOrCreateNoiseStaticKey(): Promise<CryptoKeyPair> {
    this.ensureInitialized();

    // Check if key exists
    const existing = await this.db!.get(STORE_NAME, NOISE_STATIC_KEY_ID);
    if (existing) {
      // Import existing key
      const privateKey = await crypto.subtle.importKey(
        'raw',
        existing.privateKey,
        { name: 'X25519' },
        true,
        ['deriveBits']
      );
      const publicKey = await crypto.subtle.importKey(
        'raw',
        existing.publicKey,
        { name: 'X25519' },
        true,
        []
      );
      return { privateKey, publicKey };
    }

    // Generate new X25519 key pair
    const keyPair = await crypto.subtle.generateKey(
      { name: 'X25519' },
      true,
      ['deriveBits']
    ) as CryptoKeyPair;

    // Export and store
    const privateKeyData = await crypto.subtle.exportKey('raw', keyPair.privateKey);
    const publicKeyData = await crypto.subtle.exportKey('raw', keyPair.publicKey);

    await this.db!.put(STORE_NAME, {
      id: NOISE_STATIC_KEY_ID,
      type: 'noise_static',
      privateKey: new Uint8Array(privateKeyData).buffer as ArrayBuffer,
      publicKey: new Uint8Array(publicKeyData).buffer as ArrayBuffer,
      createdAt: Date.now(),
    });

    return keyPair;
  }

  /**
   * Generate or retrieve the Nostr identity (secp256k1)
   * Used for Nostr protocol signing and NIP-17 encryption
   */
  async getOrCreateNostrIdentity(): Promise<NostrIdentity> {
    this.ensureInitialized();

    // Check if identity exists
    const existing = await this.db!.get(STORE_NAME, NOSTR_IDENTITY_ID);
    if (existing) {
      const privateKey = new Uint8Array(existing.privateKey);
      const publicKey = new Uint8Array(existing.publicKey);
      return this.buildNostrIdentity(privateKey, publicKey);
    }

    // Generate new secp256k1 key pair using @noble/curves
    const privateKey = schnorr.utils.randomPrivateKey();
    const publicKey = schnorr.getPublicKey(privateKey);

    // Store - copy to ensure we have a clean ArrayBuffer
    await this.db!.put(STORE_NAME, {
      id: NOSTR_IDENTITY_ID,
      type: 'nostr_identity',
      privateKey: privateKey.slice().buffer as ArrayBuffer,
      publicKey: publicKey.slice().buffer as ArrayBuffer,
      createdAt: Date.now(),
    });

    return this.buildNostrIdentity(privateKey, publicKey);
  }

  private buildNostrIdentity(privateKey: Uint8Array, publicKey: Uint8Array): NostrIdentity {
    const publicKeyHex = bytesToHex(publicKey);
    return {
      privateKey,
      publicKey,
      publicKeyHex,
      npub: bech32Encode('npub', publicKey),
      nsec: bech32Encode('nsec', privateKey),
    };
  }

  /**
   * Import a Nostr identity from nsec
   */
  async importNostrIdentity(nsec: string): Promise<NostrIdentity> {
    this.ensureInitialized();

    const { prefix, data } = bech32Decode(nsec);
    if (prefix !== 'nsec') {
      throw new Error('Invalid nsec format');
    }

    const privateKey = data;
    const publicKey = schnorr.getPublicKey(privateKey);

    // Store - copy to ensure we have a clean ArrayBuffer
    await this.db!.put(STORE_NAME, {
      id: NOSTR_IDENTITY_ID,
      type: 'nostr_identity',
      privateKey: privateKey.slice().buffer as ArrayBuffer,
      publicKey: publicKey.slice().buffer as ArrayBuffer,
      createdAt: Date.now(),
    });

    return this.buildNostrIdentity(privateKey, publicKey);
  }

  /**
   * Export keys for backup (as JSON with bech32-encoded keys)
   */
  async exportKeys(): Promise<string> {
    this.ensureInitialized();

    const nostrIdentity = await this.db!.get(STORE_NAME, NOSTR_IDENTITY_ID);
    if (!nostrIdentity) {
      throw new Error('No identity to export');
    }

    const privateKey = new Uint8Array(nostrIdentity.privateKey);
    return JSON.stringify({
      version: 1,
      nsec: bech32Encode('nsec', privateKey),
      createdAt: nostrIdentity.createdAt,
      exportedAt: Date.now(),
    });
  }

  /**
   * Delete all keys (panic mode)
   */
  async deleteAllKeys(): Promise<void> {
    this.ensureInitialized();
    await this.db!.clear(STORE_NAME);
  }

  /**
   * Check if an identity exists
   */
  async hasIdentity(): Promise<boolean> {
    this.ensureInitialized();
    const existing = await this.db!.get(STORE_NAME, NOSTR_IDENTITY_ID);
    return existing !== undefined;
  }
}

// Bech32 encoding/decoding for Nostr keys (npub/nsec)
const BECH32_ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32Encode(prefix: string, data: Uint8Array): string {
  const values = convertBits(data, 8, 5, true);
  const checksum = createChecksum(prefix, values);
  const combined = [...values, ...checksum];
  return prefix + '1' + combined.map(v => BECH32_ALPHABET[v]).join('');
}

function bech32Decode(str: string): { prefix: string; data: Uint8Array } {
  const pos = str.lastIndexOf('1');
  if (pos < 1 || pos + 7 > str.length) {
    throw new Error('Invalid bech32 string');
  }

  const prefix = str.slice(0, pos);
  const dataChars = str.slice(pos + 1);

  const values: number[] = [];
  for (const char of dataChars) {
    const idx = BECH32_ALPHABET.indexOf(char.toLowerCase());
    if (idx === -1) throw new Error('Invalid character in bech32 string');
    values.push(idx);
  }

  // Verify checksum
  if (!verifyChecksum(prefix, values)) {
    throw new Error('Invalid bech32 checksum');
  }

  // Remove checksum and convert back to 8-bit
  const data = convertBits(values.slice(0, -6), 5, 8, false);
  return { prefix, data: new Uint8Array(data) };
}

function convertBits(data: Uint8Array | number[], fromBits: number, toBits: number, pad: boolean): number[] {
  let acc = 0;
  let bits = 0;
  const result: number[] = [];
  const maxv = (1 << toBits) - 1;

  for (const value of data) {
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      result.push((acc >> bits) & maxv);
    }
  }

  if (pad) {
    if (bits > 0) {
      result.push((acc << (toBits - bits)) & maxv);
    }
  } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv)) {
    throw new Error('Invalid padding');
  }

  return result;
}

function polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((top >> i) & 1) chk ^= GEN[i];
    }
  }
  return chk;
}

function hrpExpand(hrp: string): number[] {
  const result: number[] = [];
  for (const char of hrp) {
    result.push(char.charCodeAt(0) >> 5);
  }
  result.push(0);
  for (const char of hrp) {
    result.push(char.charCodeAt(0) & 31);
  }
  return result;
}

function createChecksum(hrp: string, data: number[]): number[] {
  const values = [...hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
  const mod = polymod(values) ^ 1;
  const result: number[] = [];
  for (let i = 0; i < 6; i++) {
    result.push((mod >> (5 * (5 - i))) & 31);
  }
  return result;
}

function verifyChecksum(hrp: string, data: number[]): boolean {
  return polymod([...hrpExpand(hrp), ...data]) === 1;
}

// Export singleton instance
export const keyManager = new KeyManager();
export { KeyManager };
