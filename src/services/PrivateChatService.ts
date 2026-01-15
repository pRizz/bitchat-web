/**
 * PrivateChatService - Orchestrates private messaging via Nostr
 *
 * Wires together:
 * - NostrProtocol (encryption/decryption)
 * - NostrRelayManager (transport)
 * - ChatStore (state)
 */

import { NostrProtocol, NostrEvent, NostrEventKind } from '@/crypto/nostr';
import { nostrRelayManager, type NostrFilter } from '@/transport/nostr';
import { useChatStore } from '@/store/useChatStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { BitchatMessage, NostrIdentity } from '@/types';

class PrivateChatService {
  private subscriptionId: string | null = null;
  private processedEventIds: Set<string> = new Set();

  /**
   * Start listening for incoming private messages
   */
  startListening(): void {
    const identity = useSettingsStore.getState().identity;
    if (!identity) {
      console.error('Cannot start listening: no identity');
      return;
    }

    // Subscribe to gift-wrapped messages for our pubkey
    const filters: NostrFilter[] = [
      {
        kinds: [NostrEventKind.GiftWrap],
        '#p': [identity.publicKeyHex],
        // Get messages from last 7 days
        since: Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60,
      },
    ];

    this.subscriptionId = nostrRelayManager.subscribe(
      filters,
      (eventData) => this.handleIncomingEvent(eventData, identity),
      () => console.log('[PrivateChatService] EOSE received')
    );

    console.log('[PrivateChatService] Started listening for messages');
  }

  /**
   * Stop listening for messages
   */
  stopListening(): void {
    if (this.subscriptionId) {
      nostrRelayManager.unsubscribe(this.subscriptionId);
      this.subscriptionId = null;
    }
  }

  /**
   * Handle incoming Nostr event
   */
  private async handleIncomingEvent(
    eventData: { id: string; pubkey: string; created_at: number; kind: number; tags: string[][]; content: string; sig?: string },
    identity: NostrIdentity
  ): Promise<void> {
    // Deduplicate
    if (this.processedEventIds.has(eventData.id)) {
      return;
    }
    this.processedEventIds.add(eventData.id);

    // Limit processed IDs cache
    if (this.processedEventIds.size > 10000) {
      const idsArray = Array.from(this.processedEventIds);
      this.processedEventIds = new Set(idsArray.slice(-5000));
    }

    try {
      // Parse as NostrEvent
      const giftWrap = NostrEvent.fromDict(eventData);

      // Decrypt the message
      const { content, senderPubkey, timestamp } = await NostrProtocol.decryptPrivateMessage(
        giftWrap,
        identity
      );

      // Create BitchatMessage
      const message: BitchatMessage = {
        id: eventData.id,
        type: 'private',
        content,
        senderPubkey,
        timestamp,
        encrypted: true,
        verified: true, // Decryption succeeded
      };

      // Add to chat store
      useChatStore.getState().addMessage(senderPubkey, message);

      console.log(`[PrivateChatService] Received message from ${senderPubkey.slice(0, 8)}...`);
    } catch (error) {
      console.error('[PrivateChatService] Failed to decrypt message:', error);
    }
  }

  /**
   * Send a private message
   */
  async sendMessage(recipientPubkey: string, content: string): Promise<void> {
    const identity = useSettingsStore.getState().identity;
    if (!identity) {
      throw new Error('No identity configured');
    }

    // Create encrypted gift-wrapped message
    const giftWrap = await NostrProtocol.createPrivateMessage(
      content,
      recipientPubkey,
      identity
    );

    // Publish to relays
    await nostrRelayManager.publish(giftWrap.toObject());

    // Add to local chat store (our own message)
    const message: BitchatMessage = {
      id: giftWrap.id,
      type: 'private',
      content,
      senderPubkey: identity.publicKeyHex,
      timestamp: Math.floor(Date.now() / 1000),
      encrypted: true,
      verified: true,
    };

    useChatStore.getState().addMessage(recipientPubkey, message);

    console.log(`[PrivateChatService] Sent message to ${recipientPubkey.slice(0, 8)}...`);
  }

  /**
   * Validate a Nostr pubkey (hex or npub)
   */
  validatePubkey(input: string): string | null {
    // If it's a hex pubkey (64 chars)
    if (/^[0-9a-fA-F]{64}$/.test(input)) {
      return input.toLowerCase();
    }

    // If it's an npub, decode it
    if (input.startsWith('npub1')) {
      try {
        const decoded = this.decodeBech32(input);
        if (decoded.prefix === 'npub' && decoded.data.length === 32) {
          return Array.from(decoded.data)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        }
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Simple bech32 decode for npub
   */
  private decodeBech32(str: string): { prefix: string; data: Uint8Array } {
    const ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

    const pos = str.lastIndexOf('1');
    if (pos < 1) throw new Error('Invalid bech32');

    const prefix = str.slice(0, pos);
    const dataChars = str.slice(pos + 1);

    const values: number[] = [];
    for (const char of dataChars) {
      const idx = ALPHABET.indexOf(char.toLowerCase());
      if (idx === -1) throw new Error('Invalid character');
      values.push(idx);
    }

    // Remove checksum (last 6 chars) and convert 5-bit to 8-bit
    const data5bit = values.slice(0, -6);
    const data8bit: number[] = [];

    let acc = 0;
    let bits = 0;
    for (const value of data5bit) {
      acc = (acc << 5) | value;
      bits += 5;
      while (bits >= 8) {
        bits -= 8;
        data8bit.push((acc >> bits) & 0xff);
      }
    }

    return { prefix, data: new Uint8Array(data8bit) };
  }
}

// Export singleton
export const privateChatService = new PrivateChatService();
