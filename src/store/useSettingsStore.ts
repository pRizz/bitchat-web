/**
 * Settings store - manages user preferences and identity
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { NostrIdentity } from '@/types';
import { keyManager } from '@/crypto';

interface SettingsState {
  // Identity
  identity: NostrIdentity | null;
  nickname: string;
  initialized: boolean;

  // Relays
  relays: string[];

  // Actions
  initialize: () => Promise<void>;
  setNickname: (nickname: string) => void;
  addRelay: (url: string) => void;
  removeRelay: (url: string) => void;
  importIdentity: (nsec: string) => Promise<void>;
  exportIdentity: () => Promise<string>;
  deleteIdentity: () => Promise<void>;
}

const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://nostr.wine',
];

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      identity: null,
      nickname: '',
      initialized: false,
      relays: DEFAULT_RELAYS,

      initialize: async () => {
        if (get().initialized) return;

        try {
          await keyManager.initialize();
          const identity = await keyManager.getOrCreateNostrIdentity();
          set({ identity, initialized: true });
        } catch (error) {
          console.error('Failed to initialize identity:', error);
          throw error;
        }
      },

      setNickname: (nickname: string) => {
        set({ nickname: nickname.trim().slice(0, 32) });
      },

      addRelay: (url: string) => {
        const { relays } = get();
        if (!relays.includes(url)) {
          set({ relays: [...relays, url] });
        }
      },

      removeRelay: (url: string) => {
        const { relays } = get();
        set({ relays: relays.filter(r => r !== url) });
      },

      importIdentity: async (nsec: string) => {
        await keyManager.initialize();
        const identity = await keyManager.importNostrIdentity(nsec);
        set({ identity });
      },

      exportIdentity: async () => {
        return keyManager.exportKeys();
      },

      deleteIdentity: async () => {
        await keyManager.deleteAllKeys();
        set({ identity: null, initialized: false });
      },
    }),
    {
      name: 'bitchat-settings',
      partialize: (state) => ({
        nickname: state.nickname,
        relays: state.relays,
      }),
    }
  )
);
