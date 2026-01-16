/**
 * StorageManager.ts - Quota and migration management
 *
 * Handles:
 * - Data migrations between versions
 * - Storage quota monitoring and cleanup
 * - Full data wipe (emergency/logout)
 */

import {
  getDatabase,
  deleteDatabase,
  getStorageEstimate,
  requestPersistentStorage,
  isStoragePersistent,
} from './Database';
import { pruneMessages, getTotalMessageCount, clearAllMessages } from './MessageStore';
import { clearAllPeers, clearAllSettings, deleteIdentity } from './IdentityStore';
import { keyManager } from '@/crypto';

// Migration version tracking
const CURRENT_MIGRATION_VERSION = 1;

// Quota thresholds
const QUOTA_WARNING_PERCENT = 80;
const QUOTA_CRITICAL_PERCENT = 90;
const MAX_MESSAGES_PER_CONV_UNDER_PRESSURE = 500;

export interface StorageStats {
  messageCount: number;
  storageUsed: number;
  storageQuota: number;
  percentUsed: number;
  isPersistent: boolean;
  migrationVersion: number;
}

export interface MigrationResult {
  fromVersion: number;
  toVersion: number;
  success: boolean;
  error?: string;
}

/**
 * Storage manager singleton
 */
export class StorageManager {
  private initialized = false;

  /**
   * Initialize storage system
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Ensure database is created
    const db = await getDatabase();

    // Request persistent storage
    const wasPersistent = await isStoragePersistent();
    if (!wasPersistent) {
      const granted = await requestPersistentStorage();
      console.log(`[StorageManager] Persistent storage: ${granted ? 'granted' : 'denied'}`);
    }

    // Run migrations
    await this.runMigrations();

    // Check quota
    await this.checkQuota();

    this.initialized = true;
  }

  /**
   * Run any pending data migrations
   */
  async runMigrations(): Promise<MigrationResult[]> {
    const db = await getDatabase();
    const results: MigrationResult[] = [];

    // Get current version
    const versionMeta = await db.get('metadata', 'migrationVersion');
    const currentVersion = (versionMeta?.value as number) || 0;

    if (currentVersion >= CURRENT_MIGRATION_VERSION) {
      return results;
    }

    console.log(`[StorageManager] Running migrations from v${currentVersion} to v${CURRENT_MIGRATION_VERSION}`);

    // Run migrations sequentially
    for (let v = currentVersion + 1; v <= CURRENT_MIGRATION_VERSION; v++) {
      try {
        await this.runMigration(v);
        results.push({ fromVersion: v - 1, toVersion: v, success: true });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[StorageManager] Migration to v${v} failed:`, error);
        results.push({ fromVersion: v - 1, toVersion: v, success: false, error: errorMsg });
        break;
      }
    }

    // Update version
    const lastSuccess = results.filter((r) => r.success).pop();
    if (lastSuccess) {
      await db.put('metadata', {
        key: 'migrationVersion',
        value: lastSuccess.toVersion,
      });
    }

    return results;
  }

  /**
   * Run a specific migration
   */
  private async runMigration(version: number): Promise<void> {
    console.log(`[StorageManager] Running migration to v${version}`);

    switch (version) {
      case 1:
        // Initial version - no migration needed
        // Future migrations would go here:
        // case 2: await this.migrateV1ToV2(); break;
        break;
      default:
        throw new Error(`Unknown migration version: ${version}`);
    }
  }

  /**
   * Check storage quota and cleanup if needed
   */
  async checkQuota(): Promise<{
    status: 'ok' | 'warning' | 'critical';
    percentUsed: number;
    cleaned: boolean;
  }> {
    const estimate = await getStorageEstimate();
    const percentUsed = estimate.percentUsed;

    let status: 'ok' | 'warning' | 'critical' = 'ok';
    let cleaned = false;

    if (percentUsed >= QUOTA_CRITICAL_PERCENT) {
      status = 'critical';
      console.warn(`[StorageManager] Storage critical: ${percentUsed.toFixed(1)}% used`);
      // Aggressive cleanup
      const deleted = await pruneMessages(MAX_MESSAGES_PER_CONV_UNDER_PRESSURE);
      if (deleted > 0) {
        console.log(`[StorageManager] Pruned ${deleted} messages`);
        cleaned = true;
      }
    } else if (percentUsed >= QUOTA_WARNING_PERCENT) {
      status = 'warning';
      console.warn(`[StorageManager] Storage warning: ${percentUsed.toFixed(1)}% used`);
      // Normal cleanup
      const deleted = await pruneMessages();
      if (deleted > 0) {
        console.log(`[StorageManager] Pruned ${deleted} messages`);
        cleaned = true;
      }
    }

    return { status, percentUsed, cleaned };
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<StorageStats> {
    const db = await getDatabase();
    const estimate = await getStorageEstimate();
    const persistent = await isStoragePersistent();
    const messageCount = await getTotalMessageCount();
    const versionMeta = await db.get('metadata', 'migrationVersion');

    return {
      messageCount,
      storageUsed: estimate.used,
      storageQuota: estimate.quota,
      percentUsed: estimate.percentUsed,
      isPersistent: persistent,
      migrationVersion: (versionMeta?.value as number) || 0,
    };
  }

  /**
   * Wipe all data (emergency/logout)
   */
  async wipeAll(): Promise<void> {
    console.log('[StorageManager] Wiping all data');

    // Clear all stores
    await clearAllMessages();
    await clearAllPeers();
    await clearAllSettings();

    // Delete identity keys
    await keyManager.initialize();
    await keyManager.deleteAllKeys();

    // Delete the entire database
    await deleteDatabase();

    this.initialized = false;
    console.log('[StorageManager] All data wiped');
  }
}

// Singleton instance
const storageManager = new StorageManager();

/**
 * Initialize storage (call on app startup)
 */
export async function initializeStorage(): Promise<void> {
  await storageManager.initialize();
}

/**
 * Run migrations manually
 */
export async function runMigrations(): Promise<MigrationResult[]> {
  return storageManager.runMigrations();
}

/**
 * Check and manage quota
 */
export async function manageQuota(): Promise<{
  status: 'ok' | 'warning' | 'critical';
  percentUsed: number;
  cleaned: boolean;
}> {
  return storageManager.checkQuota();
}

/**
 * Wipe all data
 */
export async function wipeAllData(): Promise<void> {
  await storageManager.wipeAll();
}

/**
 * Get storage statistics
 */
export async function getStorageStats(): Promise<StorageStats> {
  return storageManager.getStats();
}

export { storageManager };
