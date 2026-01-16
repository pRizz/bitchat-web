/**
 * Settings store - manages user preferences and identity
 *
 * Initializes the storage layer and coordinates with chat store
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { NostrIdentity } from '@/types';
import { keyManager } from '@/crypto';
import { initializeStorage, wipeAllData } from '@/storage';
import { useChatStore } from './useChatStore';

export type Theme = 'dark' | 'light' | 'system';
export type PerformanceMode = 'balanced' | 'battery_saver' | 'performance';

interface PrivacySettings {
  showReadReceipts: boolean;
  showTypingIndicators: boolean;
  sharePresence: boolean;
}

interface SettingsState {
  // Identity
  identity: NostrIdentity | null;
  nickname: string;
  initialized: boolean;

  // Relays
  relays: string[];

  // Appearance
  theme: Theme;

  // Privacy
  privacy: PrivacySettings;

  // Performance
  performanceMode: PerformanceMode;

  // Actions
  initialize: () => Promise<void>;
  setNickname: (nickname: string) => void;
  addRelay: (url: string) => void;
  removeRelay: (url: string) => void;
  setTheme: (theme: Theme) => void;
  setPrivacy: (privacy: Partial<PrivacySettings>) => void;
  setPerformanceMode: (mode: PerformanceMode) => void;
  importIdentity: (nsec: string) => Promise<void>;
  exportIdentity: () => Promise<string>;
  deleteIdentity: () => Promise<void>;
  wipeAllData: () => Promise<void>;
}

const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://nostr.wine',
];

const DEFAULT_PRIVACY: PrivacySettings = {
  showReadReceipts: true,
  showTypingIndicators: true,
  sharePresence: true,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      identity: null,
      nickname: '',
      initialized: false,
      relays: DEFAULT_RELAYS,
      theme: 'dark',
      privacy: DEFAULT_PRIVACY,
      performanceMode: 'balanced',

      initialize: async () => {
        if (get().initialized) return;

        try {
          // Initialize storage layer first
          await initializeStorage();

          // Initialize identity
          await keyManager.initialize();
          const identity = await keyManager.getOrCreateNostrIdentity();
          set({ identity, initialized: true });

          // Initialize chat store (load persisted messages)
          await useChatStore.getState().initialize();
        } catch (error) {
          console.error('Failed to initialize:', error);
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

      setTheme: (theme: Theme) => {
        set({ theme });
        // Apply theme to document
        if (theme === 'system') {
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          document.documentElement.classList.toggle('dark', prefersDark);
          document.documentElement.classList.toggle('light', !prefersDark);
        } else {
          document.documentElement.classList.toggle('dark', theme === 'dark');
          document.documentElement.classList.toggle('light', theme === 'light');
        }
      },

      setPrivacy: (privacy: Partial<PrivacySettings>) => {
        set((state) => ({
          privacy: { ...state.privacy, ...privacy },
        }));
      },

      setPerformanceMode: (mode: PerformanceMode) => {
        set({ performanceMode: mode });
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

      wipeAllData: async () => {
        await wipeAllData();
        await useChatStore.getState().clearAll();
        set({
          identity: null,
          nickname: '',
          initialized: false,
          relays: DEFAULT_RELAYS,
          theme: 'dark',
          privacy: DEFAULT_PRIVACY,
          performanceMode: 'balanced',
        });
      },
    }),
    {
      name: 'bitchat-settings',
      partialize: (state) => ({
        nickname: state.nickname,
        relays: state.relays,
        theme: state.theme,
        privacy: state.privacy,
        performanceMode: state.performanceMode,
      }),
    }
  )
);
