/**
 * Database.ts - Core IndexedDB setup for BitChat Web
 *
 * Provides unified database access for all persistent data:
 * - Messages and conversations
 * - Peer information
 * - Settings and preferences
 * - Migration support
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { BitchatMessage, PeerInfo } from '@/types';

// Schema version - increment when adding migrations
const DB_VERSION = 1;
const DB_NAME = 'bitchat_data';

// Stored types extend runtime types with indexable keys
export interface StoredMessage extends BitchatMessage {
  peerId: string; // Conversation partner pubkey
  storedAt: number;
}

export interface StoredConversation {
  peerId: string;
  peerNickname?: string;
  lastMessageAt: number;
  lastMessagePreview: string;
  unreadCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface StoredPeer extends PeerInfo {
  trustedAt?: number;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface StoredSettings {
  key: string;
  value: unknown;
  updatedAt: number;
}

export interface StorageMetadata {
  key: string;
  value: string | number;
}

// IndexedDB schema definition
interface BitchatDBSchema extends DBSchema {
  messages: {
    key: string; // message.id
    value: StoredMessage;
    indexes: {
      'by-peer': string;
      'by-timestamp': number;
      'by-peer-timestamp': [string, number];
    };
  };
  conversations: {
    key: string; // peerId
    value: StoredConversation;
    indexes: {
      'by-last-message': number;
    };
  };
  peers: {
    key: string; // peer.id (publicKeyHex)
    value: StoredPeer;
    indexes: {
      'by-last-seen': number;
    };
  };
  settings: {
    key: string;
    value: StoredSettings;
  };
  metadata: {
    key: string;
    value: StorageMetadata;
  };
}

// Singleton database instance
let dbInstance: IDBPDatabase<BitchatDBSchema> | null = null;
let initPromise: Promise<IDBPDatabase<BitchatDBSchema>> | null = null;

/**
 * Get or initialize the database connection
 */
export async function getDatabase(): Promise<IDBPDatabase<BitchatDBSchema>> {
  if (dbInstance) return dbInstance;
  if (initPromise) return initPromise;

  initPromise = openDB<BitchatDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion) {
      console.log(`[Database] Upgrading from v${oldVersion} to v${newVersion}`);

      // Messages store
      if (!db.objectStoreNames.contains('messages')) {
        const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
        messageStore.createIndex('by-peer', 'peerId');
        messageStore.createIndex('by-timestamp', 'timestamp');
        messageStore.createIndex('by-peer-timestamp', ['peerId', 'timestamp']);
      }

      // Conversations store
      if (!db.objectStoreNames.contains('conversations')) {
        const convStore = db.createObjectStore('conversations', { keyPath: 'peerId' });
        convStore.createIndex('by-last-message', 'lastMessageAt');
      }

      // Peers store
      if (!db.objectStoreNames.contains('peers')) {
        const peerStore = db.createObjectStore('peers', { keyPath: 'id' });
        peerStore.createIndex('by-last-seen', 'lastSeen');
      }

      // Settings store
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }

      // Metadata store (for migrations, quotas, etc.)
      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata', { keyPath: 'key' });
      }
    },
    blocked() {
      console.warn('[Database] Blocked by another connection');
    },
    blocking() {
      console.warn('[Database] Blocking newer version');
    },
    terminated() {
      console.error('[Database] Connection terminated unexpectedly');
      dbInstance = null;
      initPromise = null;
    },
  });

  dbInstance = await initPromise;

  // Record database opened
  await dbInstance.put('metadata', {
    key: 'lastOpened',
    value: Date.now(),
  });

  return dbInstance;
}

/**
 * Close database connection (for testing/cleanup)
 */
export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    initPromise = null;
  }
}

/**
 * Delete the entire database (emergency wipe)
 */
export async function deleteDatabase(): Promise<void> {
  closeDatabase();
  await indexedDB.deleteDatabase(DB_NAME);
}

/**
 * Get storage usage estimate
 */
export async function getStorageEstimate(): Promise<{
  used: number;
  quota: number;
  percentUsed: number;
}> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    const used = estimate.usage || 0;
    const quota = estimate.quota || 0;
    return {
      used,
      quota,
      percentUsed: quota > 0 ? (used / quota) * 100 : 0,
    };
  }
  return { used: 0, quota: 0, percentUsed: 0 };
}

/**
 * Request persistent storage (prevents browser from evicting data)
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if ('storage' in navigator && 'persist' in navigator.storage) {
    return navigator.storage.persist();
  }
  return false;
}

/**
 * Check if storage is persistent
 */
export async function isStoragePersistent(): Promise<boolean> {
  if ('storage' in navigator && 'persisted' in navigator.storage) {
    return navigator.storage.persisted();
  }
  return false;
}

// Export types
export type { BitchatDBSchema };
