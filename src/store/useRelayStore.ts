/**
 * Relay store - manages Nostr relay connection status
 */

import { create } from 'zustand';
import { nostrRelayManager, type RelayInfo } from '@/transport/nostr';

interface RelayState {
  relays: RelayInfo[];
  connected: boolean;

  // Actions
  connect: (relayUrls: string[]) => Promise<void>;
  disconnect: () => void;
  addRelay: (url: string) => void;
  removeRelay: (url: string) => void;
  getConnectedCount: () => number;
}

export const useRelayStore = create<RelayState>()((set) => ({
  relays: [],
  connected: false,

  connect: async (relayUrls: string[]) => {
    // Update relay list from settings
    const currentRelays = nostrRelayManager.getRelays().map(r => r.url);

    // Add new relays
    for (const url of relayUrls) {
      if (!currentRelays.includes(url)) {
        nostrRelayManager.addRelay(url);
      }
    }

    // Remove old relays
    for (const url of currentRelays) {
      if (!relayUrls.includes(url)) {
        nostrRelayManager.removeRelay(url);
      }
    }

    // Set up status change listener
    nostrRelayManager.setOnRelayStatusChange(() => {
      set({ relays: nostrRelayManager.getRelays() });
    });

    // Connect
    await nostrRelayManager.connect();

    set({
      relays: nostrRelayManager.getRelays(),
      connected: true,
    });
  },

  disconnect: () => {
    nostrRelayManager.disconnect();
    set({
      relays: nostrRelayManager.getRelays(),
      connected: false,
    });
  },

  addRelay: (url: string) => {
    nostrRelayManager.addRelay(url);
    set({ relays: nostrRelayManager.getRelays() });
  },

  removeRelay: (url: string) => {
    nostrRelayManager.removeRelay(url);
    set({ relays: nostrRelayManager.getRelays() });
  },

  getConnectedCount: () => {
    return nostrRelayManager.getConnectedCount();
  },
}));
