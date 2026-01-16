/**
 * MessageStore.ts - Message and conversation persistence
 *
 * Handles storage and retrieval of:
 * - Messages (with conversation context)
 * - Conversation metadata
 * - Message pruning for quota management
 */

import {
  getDatabase,
  type StoredMessage,
  type StoredConversation,
} from './Database';
import type { BitchatMessage } from '@/types';

// Match Swift implementation
const MAX_MESSAGES_PER_CONVERSATION = 1337;

/**
 * Store a message and update conversation metadata
 */
export async function storeMessage(
  peerId: string,
  message: BitchatMessage
): Promise<void> {
  const db = await getDatabase();

  const storedMessage: StoredMessage = {
    ...message,
    peerId,
    storedAt: Date.now(),
  };

  const tx = db.transaction(['messages', 'conversations'], 'readwrite');

  // Store message
  await tx.objectStore('messages').put(storedMessage);

  // Update conversation
  const convStore = tx.objectStore('conversations');
  const existing = await convStore.get(peerId);
  const now = Date.now();

  const conversation: StoredConversation = {
    peerId,
    peerNickname: message.senderNickname || existing?.peerNickname,
    lastMessageAt: message.timestamp,
    lastMessagePreview: message.content.slice(0, 100),
    unreadCount: existing?.unreadCount || 0,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  await convStore.put(conversation);
  await tx.done;
}

/**
 * Store multiple messages efficiently (for sync/restore)
 */
export async function storeMessages(
  messages: Array<{ peerId: string; message: BitchatMessage }>
): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction(['messages', 'conversations'], 'readwrite');
  const messageStore = tx.objectStore('messages');
  const convStore = tx.objectStore('conversations');

  // Group by conversation for efficient updates
  const byConversation = new Map<string, BitchatMessage[]>();
  for (const { peerId, message } of messages) {
    const existing = byConversation.get(peerId) || [];
    existing.push(message);
    byConversation.set(peerId, existing);
  }

  const now = Date.now();

  for (const { peerId, message } of messages) {
    const storedMessage: StoredMessage = {
      ...message,
      peerId,
      storedAt: now,
    };
    await messageStore.put(storedMessage);
  }

  // Update conversation metadata
  for (const [peerId, peerMessages] of byConversation) {
    const latestMessage = peerMessages.reduce((a, b) =>
      a.timestamp > b.timestamp ? a : b
    );
    const existing = await convStore.get(peerId);

    const conversation: StoredConversation = {
      peerId,
      peerNickname: latestMessage.senderNickname || existing?.peerNickname,
      lastMessageAt: latestMessage.timestamp,
      lastMessagePreview: latestMessage.content.slice(0, 100),
      unreadCount: existing?.unreadCount || 0,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    await convStore.put(conversation);
  }

  await tx.done;
}

/**
 * Get messages for a conversation
 */
export async function getMessages(
  peerId: string,
  options?: {
    limit?: number;
    before?: number; // timestamp for pagination
  }
): Promise<BitchatMessage[]> {
  const db = await getDatabase();
  const limit = options?.limit || MAX_MESSAGES_PER_CONVERSATION;

  const index = db
    .transaction('messages')
    .objectStore('messages')
    .index('by-peer-timestamp');

  const messages: StoredMessage[] = [];

  // Iterate in reverse order (newest first)
  let cursor = await index.openCursor(
    IDBKeyRange.bound(
      [peerId, 0],
      [peerId, options?.before || Number.MAX_SAFE_INTEGER]
    ),
    'prev'
  );

  while (cursor && messages.length < limit) {
    messages.push(cursor.value);
    cursor = await cursor.continue();
  }

  // Return in chronological order
  return messages.reverse();
}

/**
 * Get all conversations sorted by last message
 */
export async function getConversations(): Promise<StoredConversation[]> {
  const db = await getDatabase();
  const conversations = await db.getAllFromIndex(
    'conversations',
    'by-last-message'
  );
  // Return newest first
  return conversations.reverse();
}

/**
 * Get a single conversation
 */
export async function getConversation(
  peerId: string
): Promise<StoredConversation | undefined> {
  const db = await getDatabase();
  return db.get('conversations', peerId);
}

/**
 * Update conversation unread count
 */
export async function updateUnreadCount(
  peerId: string,
  count: number
): Promise<void> {
  const db = await getDatabase();
  const existing = await db.get('conversations', peerId);
  if (existing) {
    await db.put('conversations', {
      ...existing,
      unreadCount: count,
      updatedAt: Date.now(),
    });
  }
}

/**
 * Increment unread count for a conversation
 */
export async function incrementUnread(peerId: string): Promise<void> {
  const db = await getDatabase();
  const existing = await db.get('conversations', peerId);
  if (existing) {
    await db.put('conversations', {
      ...existing,
      unreadCount: existing.unreadCount + 1,
      updatedAt: Date.now(),
    });
  }
}

/**
 * Mark conversation as read
 */
export async function markAsRead(peerId: string): Promise<void> {
  await updateUnreadCount(peerId, 0);
}

/**
 * Update peer nickname in conversation
 */
export async function updateConversationNickname(
  peerId: string,
  nickname: string
): Promise<void> {
  const db = await getDatabase();
  const existing = await db.get('conversations', peerId);
  if (existing) {
    await db.put('conversations', {
      ...existing,
      peerNickname: nickname,
      updatedAt: Date.now(),
    });
  }
}

/**
 * Delete a conversation and all its messages
 */
export async function deleteConversation(peerId: string): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction(['messages', 'conversations'], 'readwrite');

  // Delete all messages for this peer
  const messageIndex = tx.objectStore('messages').index('by-peer');
  let cursor = await messageIndex.openCursor(IDBKeyRange.only(peerId));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }

  // Delete conversation
  await tx.objectStore('conversations').delete(peerId);
  await tx.done;
}

/**
 * Delete a single message
 */
export async function deleteMessage(messageId: string): Promise<void> {
  const db = await getDatabase();
  await db.delete('messages', messageId);
}

/**
 * Prune old messages per conversation (keep most recent N)
 */
export async function pruneMessages(
  maxPerConversation: number = MAX_MESSAGES_PER_CONVERSATION
): Promise<number> {
  const db = await getDatabase();
  const conversations = await db.getAll('conversations');
  let totalDeleted = 0;

  for (const conv of conversations) {
    const index = db
      .transaction('messages')
      .objectStore('messages')
      .index('by-peer-timestamp');

    // Count messages for this peer
    const messages: string[] = [];
    let cursor = await index.openCursor(
      IDBKeyRange.bound([conv.peerId, 0], [conv.peerId, Number.MAX_SAFE_INTEGER]),
      'prev'
    );

    while (cursor) {
      messages.push(cursor.value.id);
      cursor = await cursor.continue();
    }

    // Delete oldest messages beyond limit
    if (messages.length > maxPerConversation) {
      const toDelete = messages.slice(maxPerConversation);
      const tx = db.transaction('messages', 'readwrite');

      for (const id of toDelete) {
        await tx.objectStore('messages').delete(id);
        totalDeleted++;
      }

      await tx.done;
    }
  }

  return totalDeleted;
}

/**
 * Get message count for a conversation
 */
export async function getMessageCount(peerId: string): Promise<number> {
  const db = await getDatabase();
  const index = db
    .transaction('messages')
    .objectStore('messages')
    .index('by-peer');
  return index.count(IDBKeyRange.only(peerId));
}

/**
 * Get total message count
 */
export async function getTotalMessageCount(): Promise<number> {
  const db = await getDatabase();
  return db.count('messages');
}

/**
 * Clear all messages and conversations
 */
export async function clearAllMessages(): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction(['messages', 'conversations'], 'readwrite');
  await tx.objectStore('messages').clear();
  await tx.objectStore('conversations').clear();
  await tx.done;
}
