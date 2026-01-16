/**
 * NostrRelayManager - WebSocket relay connection manager
 *
 * Handles connections to multiple Nostr relays with automatic reconnection,
 * subscription management, message routing, and deduplication.
 *
 * Matches the Swift implementation in NostrRelayManager.swift
 */

import type { NostrEventData } from '@/crypto/nostr';
import { messageDeduplicationService } from '@/services/MessageDeduplicationService';

export type RelayStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface RelayInfo {
  url: string;
  status: RelayStatus;
  lastError?: string;
  reconnectAttempts: number;
}

export interface NostrSubscription {
  id: string;
  filters: NostrFilter[];
  onEvent: (event: NostrEventData) => void;
  onEose?: () => void;
}

export interface NostrFilter {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  '#e'?: string[];
  '#p'?: string[];
  '#g'?: string[]; // Geohash tag
  since?: number;
  until?: number;
  limit?: number;
}

type RelayMessage =
  | ['EVENT', string, NostrEventData]
  | ['EOSE', string]
  | ['OK', string, boolean, string]
  | ['NOTICE', string];

// Default relays
const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://nostr.wine',
];

// Exponential backoff settings
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 300000; // 5 minutes
const BACKOFF_MULTIPLIER = 2;

export class NostrRelayManager {
  private relays: Map<string, WebSocket> = new Map();
  private relayInfo: Map<string, RelayInfo> = new Map();
  private subscriptions: Map<string, NostrSubscription> = new Map();
  private reconnectTimers: Map<string, number> = new Map();

  private onRelayStatusChange?: (url: string, status: RelayStatus) => void;

  constructor(relayUrls: string[] = DEFAULT_RELAYS) {
    for (const url of relayUrls) {
      this.relayInfo.set(url, {
        url,
        status: 'disconnected',
        reconnectAttempts: 0,
      });
    }
  }

  /**
   * Set callback for relay status changes
   */
  setOnRelayStatusChange(callback: (url: string, status: RelayStatus) => void): void {
    this.onRelayStatusChange = callback;
  }

  /**
   * Connect to all configured relays
   */
  async connect(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const url of this.relayInfo.keys()) {
      promises.push(this.connectToRelay(url));
    }
    await Promise.allSettled(promises);
  }

  /**
   * Connect to a specific relay
   */
  private async connectToRelay(url: string): Promise<void> {
    const info = this.relayInfo.get(url);
    if (!info) return;

    // Cancel any pending reconnect
    const existingTimer = this.reconnectTimers.get(url);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.reconnectTimers.delete(url);
    }

    // Close existing connection
    const existing = this.relays.get(url);
    if (existing) {
      existing.close();
      this.relays.delete(url);
    }

    // Update status
    this.updateRelayStatus(url, 'connecting');

    return new Promise((resolve) => {
      try {
        const ws = new WebSocket(url);

        ws.onopen = () => {
          console.log(`[NostrRelayManager] Connected to ${url}`);
          info.reconnectAttempts = 0;
          this.updateRelayStatus(url, 'connected');

          // Resubscribe to all active subscriptions
          for (const sub of this.subscriptions.values()) {
            this.sendSubscription(url, sub);
          }

          resolve();
        };

        ws.onclose = () => {
          console.log(`[NostrRelayManager] Disconnected from ${url}`);
          this.relays.delete(url);
          this.updateRelayStatus(url, 'disconnected');
          this.scheduleReconnect(url);
        };

        ws.onerror = (error) => {
          console.error(`[NostrRelayManager] Error on ${url}:`, error);
          info.lastError = 'WebSocket error';
          this.updateRelayStatus(url, 'error');
        };

        ws.onmessage = (event) => {
          this.handleMessage(url, event.data);
        };

        this.relays.set(url, ws);
      } catch (error) {
        console.error(`[NostrRelayManager] Failed to connect to ${url}:`, error);
        info.lastError = String(error);
        this.updateRelayStatus(url, 'error');
        this.scheduleReconnect(url);
        resolve();
      }
    });
  }

  /**
   * Schedule a reconnect with exponential backoff
   */
  private scheduleReconnect(url: string): void {
    const info = this.relayInfo.get(url);
    if (!info) return;

    info.reconnectAttempts++;
    const backoff = Math.min(
      INITIAL_BACKOFF_MS * Math.pow(BACKOFF_MULTIPLIER, info.reconnectAttempts - 1),
      MAX_BACKOFF_MS
    );

    console.log(`[NostrRelayManager] Scheduling reconnect to ${url} in ${backoff}ms`);

    const timer = window.setTimeout(() => {
      this.reconnectTimers.delete(url);
      this.connectToRelay(url);
    }, backoff);

    this.reconnectTimers.set(url, timer);
  }

  /**
   * Update relay status and notify listeners
   */
  private updateRelayStatus(url: string, status: RelayStatus): void {
    const info = this.relayInfo.get(url);
    if (info) {
      info.status = status;
      this.onRelayStatusChange?.(url, status);
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(url: string, data: string): void {
    try {
      const message = JSON.parse(data) as RelayMessage;

      switch (message[0]) {
        case 'EVENT': {
          const [, subId, event] = message;

          // Deduplicate - skip if we've already seen this event
          if (!messageDeduplicationService.processEvent(event)) {
            return;
          }

          const sub = this.subscriptions.get(subId);
          if (sub) {
            sub.onEvent(event);
          }
          break;
        }

        case 'EOSE': {
          const [, subId] = message;
          const sub = this.subscriptions.get(subId);
          if (sub?.onEose) {
            sub.onEose();
          }
          break;
        }

        case 'OK': {
          const [, eventId, success, reason] = message;
          if (!success) {
            console.warn(`[NostrRelayManager] Event ${eventId} rejected by ${url}: ${reason}`);
          }
          break;
        }

        case 'NOTICE': {
          console.log(`[NostrRelayManager] Notice from ${url}: ${message[1]}`);
          break;
        }
      }
    } catch (error) {
      console.error(`[NostrRelayManager] Failed to parse message from ${url}:`, error);
    }
  }

  /**
   * Create a subscription
   */
  subscribe(filters: NostrFilter[], onEvent: (event: NostrEventData) => void, onEose?: () => void): string {
    const subId = crypto.randomUUID().slice(0, 8);

    const subscription: NostrSubscription = {
      id: subId,
      filters,
      onEvent,
      onEose,
    };

    this.subscriptions.set(subId, subscription);

    // Send to all connected relays
    for (const [url, ws] of this.relays) {
      if (ws.readyState === WebSocket.OPEN) {
        this.sendSubscription(url, subscription);
      }
    }

    return subId;
  }

  /**
   * Send subscription to a specific relay
   */
  private sendSubscription(url: string, sub: NostrSubscription): void {
    const ws = this.relays.get(url);
    if (ws?.readyState === WebSocket.OPEN) {
      const message = ['REQ', sub.id, ...sub.filters];
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Unsubscribe from a subscription
   */
  unsubscribe(subId: string): void {
    this.subscriptions.delete(subId);

    // Send CLOSE to all connected relays
    for (const [, ws] of this.relays) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(['CLOSE', subId]));
      }
    }
  }

  /**
   * Publish an event to all connected relays
   */
  async publish(event: NostrEventData): Promise<void> {
    const message = JSON.stringify(['EVENT', event]);

    for (const [url, ws] of this.relays) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
        console.log(`[NostrRelayManager] Published event ${event.id} to ${url}`);
      }
    }
  }

  /**
   * Add a new relay
   */
  addRelay(url: string): void {
    if (this.relayInfo.has(url)) return;

    this.relayInfo.set(url, {
      url,
      status: 'disconnected',
      reconnectAttempts: 0,
    });

    this.connectToRelay(url);
  }

  /**
   * Remove a relay
   */
  removeRelay(url: string): void {
    const ws = this.relays.get(url);
    if (ws) {
      ws.close();
      this.relays.delete(url);
    }

    const timer = this.reconnectTimers.get(url);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(url);
    }

    this.relayInfo.delete(url);
  }

  /**
   * Get all relay info
   */
  getRelays(): RelayInfo[] {
    return Array.from(this.relayInfo.values());
  }

  /**
   * Get connected relay count
   */
  getConnectedCount(): number {
    return Array.from(this.relayInfo.values()).filter(r => r.status === 'connected').length;
  }

  /**
   * Disconnect from all relays
   */
  disconnect(): void {
    for (const [, ws] of this.relays) {
      ws.close();
    }
    this.relays.clear();

    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();

    for (const info of this.relayInfo.values()) {
      info.status = 'disconnected';
    }
  }
}

// Export singleton instance
export const nostrRelayManager = new NostrRelayManager();
