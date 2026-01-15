/**
 * Chat store - manages messages and conversations
 */

import { create } from 'zustand';
import type { BitchatMessage } from '@/types';

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

  // Actions
  setActivePeer: (peerId: string | null) => void;
  addMessage: (peerId: string, message: BitchatMessage) => void;
  markAsRead: (peerId: string) => void;
  getConversation: (peerId: string) => Conversation | undefined;
  getOrCreateConversation: (peerId: string) => Conversation;
  updatePeerNickname: (peerId: string, nickname: string) => void;
  clearConversation: (peerId: string) => void;
}

const MAX_MESSAGES_PER_CONVERSATION = 1337; // Match Swift implementation

export const useChatStore = create<ChatState>()((set, get) => ({
  conversations: new Map(),
  activePeerId: null,

  setActivePeer: (peerId: string | null) => {
    set({ activePeerId: peerId });
    if (peerId) {
      get().markAsRead(peerId);
    }
  },

  addMessage: (peerId: string, message: BitchatMessage) => {
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

      conversations.set(peerId, {
        ...existing,
        messages,
        unreadCount: isActive || isOwnMessage ? existing.unreadCount : existing.unreadCount + 1,
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
    set((state) => {
      const conversations = new Map(state.conversations);
      conversations.delete(peerId);
      return { conversations };
    });
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
