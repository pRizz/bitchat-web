/**
 * Identity store - manages Nostr keypair identity
 *
 * Focused store for identity management, separate from settings.
 * Handles key generation, import, export, and fingerprint display.
 */

import { create } from 'zustand';
import type { NostrIdentity } from '@/types';
import { keyManager } from '@/crypto';

interface IdentityState {
  identity: NostrIdentity | null;
  initialized: boolean;
  loading: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  generateNewIdentity: () => Promise<void>;
  importFromNsec: (nsec: string) => Promise<void>;
  exportBackup: () => Promise<string>;
  deleteIdentity: () => Promise<void>;
  hasIdentity: () => Promise<boolean>;
}

export const useIdentityStore = create<IdentityState>()((set, get) => ({
  identity: null,
  initialized: false,
  loading: false,
  error: null,

  initialize: async () => {
    if (get().initialized) return;

    set({ loading: true, error: null });
    try {
      await keyManager.initialize();
      const hasExisting = await keyManager.hasIdentity();
      if (hasExisting) {
        const identity = await keyManager.getOrCreateNostrIdentity();
        set({ identity, initialized: true, loading: false });
      } else {
        set({ initialized: true, loading: false });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to initialize';
      set({ error: message, loading: false });
      throw error;
    }
  },

  generateNewIdentity: async () => {
    set({ loading: true, error: null });
    try {
      await keyManager.initialize();
      const identity = await keyManager.getOrCreateNostrIdentity();
      set({ identity, loading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate identity';
      set({ error: message, loading: false });
      throw error;
    }
  },

  importFromNsec: async (nsec: string) => {
    set({ loading: true, error: null });
    try {
      await keyManager.initialize();
      const identity = await keyManager.importNostrIdentity(nsec);
      set({ identity, loading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid nsec format';
      set({ error: message, loading: false });
      throw error;
    }
  },

  exportBackup: async () => {
    try {
      return await keyManager.exportKeys();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to export';
      set({ error: message });
      throw error;
    }
  },

  deleteIdentity: async () => {
    set({ loading: true, error: null });
    try {
      await keyManager.deleteAllKeys();
      set({ identity: null, loading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete';
      set({ error: message, loading: false });
      throw error;
    }
  },

  hasIdentity: async () => {
    await keyManager.initialize();
    return keyManager.hasIdentity();
  },
}));

// Selector hooks for common patterns
export const useIdentity = () => useIdentityStore((state) => state.identity);
export const useIdentityFingerprint = () => useIdentityStore((state) => state.identity?.fingerprint ?? null);
export const useIdentityNpub = () => useIdentityStore((state) => state.identity?.npub ?? null);
export const useIdentityLoading = () => useIdentityStore((state) => state.loading);
export const useIdentityError = () => useIdentityStore((state) => state.error);
