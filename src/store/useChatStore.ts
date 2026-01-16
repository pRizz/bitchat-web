/**
 * Chat store - manages messages and conversations
 *
 * Integrates with IndexedDB storage for persistence:
 * - Messages are stored on add
 * - Conversations are loaded on init
 * - Unread counts sync with storage
 */

import { create } from 'zustand';
import type { BitchatMessage } from '@/types';
import * as storage from '@/storage';

interface Conversation {
  peerId: string;
  peerNickname?: string;
  messages: BitchatMessage[];
  unreadCount: number;
  lastMessageAt: number;
}

interface ChatState {
  // Conversations indexed by peer pubkey
  conversations: Map<string, Conversation>;

  // Currently selected peer
  activePeerId: string | null;

  // Loading state
  initialized: boolean;

  // Actions
  initialize: () => Promise<void>;
  setActivePeer: (peerId: string | null) => void;
  addMessage: (peerId: string, message: BitchatMessage) => void;
  markAsRead: (peerId: string) => void;
  getConversation: (peerId: string) => Conversation | undefined;
  getOrCreateConversation: (peerId: string) => Conversation;
  updatePeerNickname: (peerId: string, nickname: string) => void;
  clearConversation: (peerId: string) => void;
  clearAll: () => Promise<void>;
}

const MAX_MESSAGES_PER_CONVERSATION = 1337; // Match Swift implementation

export const useChatStore = create<ChatState>()((set, get) => ({
  conversations: new Map(),
  activePeerId: null,
  initialized: false,

  initialize: async () => {
    if (get().initialized) return;

    try {
      // Load conversations from storage
      const storedConversations = await storage.getConversations();
      const conversations = new Map<string, Conversation>();

      // Load messages for each conversation
      for (const stored of storedConversations) {
        const messages = await storage.getMessages(stored.peerId, {
          limit: MAX_MESSAGES_PER_CONVERSATION,
        });

        conversations.set(stored.peerId, {
          peerId: stored.peerId,
          peerNickname: stored.peerNickname,
          messages,
          unreadCount: stored.unreadCount,
          lastMessageAt: stored.lastMessageAt,
        });
      }

      set({ conversations, initialized: true });
    } catch (error) {
      console.error('[ChatStore] Failed to initialize from storage:', error);
      set({ initialized: true }); // Continue with empty state
    }
  },

  setActivePeer: (peerId: string | null) => {
    set({ activePeerId: peerId });
    if (peerId) {
      get().markAsRead(peerId);
    }
  },

  addMessage: (peerId: string, message: BitchatMessage) => {
    // Persist to storage (fire and forget, but log errors)
    storage.storeMessage(peerId, message).catch((err) => {
      console.error('[ChatStore] Failed to persist message:', err);
    });

    set((state) => {
      const conversations = new Map(state.conversations);
      const existing = conversations.get(peerId) || {
        peerId,
        messages: [],
        unreadCount: 0,
        lastMessageAt: 0,
      };

      // Add message and trim if needed
      const messages = [...existing.messages, message];
      if (messages.length > MAX_MESSAGES_PER_CONVERSATION) {
        messages.splice(0, messages.length - MAX_MESSAGES_PER_CONVERSATION);
      }

      // Update unread count if not active conversation
      const isActive = state.activePeerId === peerId;
      const isOwnMessage = message.senderPubkey === peerId ? false : true; // TODO: compare with own pubkey
      const newUnread = isActive || isOwnMessage ? existing.unreadCount : existing.unreadCount + 1;

      // Persist unread count change
      if (newUnread !== existing.unreadCount) {
        storage.updateUnreadCount(peerId, newUnread).catch((err) => {
          console.error('[ChatStore] Failed to update unread count:', err);
        });
      }

      conversations.set(peerId, {
        ...existing,
        messages,
        unreadCount: newUnread,
        lastMessageAt: message.timestamp,
      });

      return { conversations };
    });
  },

  markAsRead: (peerId: string) => {
    set((state) => {
      const conversations = new Map(state.conversations);
      const existing = conversations.get(peerId);
      if (existing && existing.unreadCount > 0) {
        // Persist to storage
        storage.markAsRead(peerId).catch((err) => {
          console.error('[ChatStore] Failed to mark as read:', err);
        });
        conversations.set(peerId, { ...existing, unreadCount: 0 });
        return { conversations };
      }
      return state;
    });
  },

  getConversation: (peerId: string) => {
    return get().conversations.get(peerId);
  },

  getOrCreateConversation: (peerId: string) => {
    const existing = get().conversations.get(peerId);
    if (existing) return existing;

    const newConversation: Conversation = {
      peerId,
      messages: [],
      unreadCount: 0,
      lastMessageAt: 0,
    };

    set((state) => {
      const conversations = new Map(state.conversations);
      conversations.set(peerId, newConversation);
      return { conversations };
    });

    return newConversation;
  },

  updatePeerNickname: (peerId: string, nickname: string) => {
    // Persist to storage
    storage.updateConversationNickname(peerId, nickname).catch((err) => {
      console.error('[ChatStore] Failed to update nickname:', err);
    });

    set((state) => {
      const conversations = new Map(state.conversations);
      const existing = conversations.get(peerId);
      if (existing) {
        conversations.set(peerId, { ...existing, peerNickname: nickname });
        return { conversations };
      }
      return state;
    });
  },

  clearConversation: (peerId: string) => {
    // Delete from storage
    storage.deleteConversation(peerId).catch((err) => {
      console.error('[ChatStore] Failed to delete conversation:', err);
    });

    set((state) => {
      const conversations = new Map(state.conversations);
      conversations.delete(peerId);
      return { conversations };
    });
  },

  clearAll: async () => {
    await storage.clearAllMessages();
    set({ conversations: new Map(), activePeerId: null });
  },
}));

// Selector hooks for common operations
export const useActiveConversation = () => {
  const activePeerId = useChatStore((s) => s.activePeerId);
  const conversations = useChatStore((s) => s.conversations);
  return activePeerId ? conversations.get(activePeerId) : undefined;
};

export const useConversationList = () => {
  const conversations = useChatStore((s) => s.conversations);
  return Array.from(conversations.values())
    .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
};

export const useTotalUnread = () => {
  const conversations = useChatStore((s) => s.conversations);
  return Array.from(conversations.values())
    .reduce((sum, c) => sum + c.unreadCount, 0);
};
