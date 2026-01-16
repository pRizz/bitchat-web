/**
 * MessageDeduplicationService - Prevent duplicate message processing
 *
 * Uses a bounded set with LRU eviction to efficiently track seen events.
 * Matches the Swift MessageDeduplicationService implementation.
 */

import type { NostrEventData } from '@/crypto/nostr';

// Maximum number of event IDs to track
const MAX_TRACKED_EVENTS = 10000;

// Cleanup threshold (when to evict old entries)
const CLEANUP_THRESHOLD = MAX_TRACKED_EVENTS * 0.9;

export class MessageDeduplicationService {
  private seenEvents: Map<string, number> = new Map();
  private eventOrder: string[] = [];

  /**
   * Check if an event has been seen before
   * Returns true if this is a duplicate
   */
  isDuplicate(event: NostrEventData): boolean {
    return this.seenEvents.has(event.id);
  }

  /**
   * Check if an event ID has been seen before
   */
  hasSeenId(eventId: string): boolean {
    return this.seenEvents.has(eventId);
  }

  /**
   * Mark an event as seen
   * Returns true if it was already seen (duplicate)
   */
  markSeen(event: NostrEventData): boolean {
    return this.markSeenId(event.id);
  }

  /**
   * Mark an event ID as seen
   * Returns true if it was already seen (duplicate)
   */
  markSeenId(eventId: string): boolean {
    if (this.seenEvents.has(eventId)) {
      return true;
    }

    // Add to tracking
    this.seenEvents.set(eventId, Date.now());
    this.eventOrder.push(eventId);

    // Cleanup if needed
    if (this.eventOrder.length > MAX_TRACKED_EVENTS) {
      this.cleanup();
    }

    return false;
  }

  /**
   * Check and mark in one operation (most common use case)
   * Returns true if this is a NEW event (not duplicate)
   */
  processEvent(event: NostrEventData): boolean {
    return !this.markSeen(event);
  }

  /**
   * Remove old entries using LRU eviction
   */
  private cleanup(): void {
    const toRemove = this.eventOrder.length - CLEANUP_THRESHOLD;
    if (toRemove <= 0) return;

    // Remove oldest entries
    const removedIds = this.eventOrder.splice(0, toRemove);
    for (const id of removedIds) {
      this.seenEvents.delete(id);
    }
  }

  /**
   * Get statistics about the deduplication cache
   */
  getStats(): {
    trackedCount: number;
    maxCapacity: number;
    utilizationPercent: number;
  } {
    return {
      trackedCount: this.seenEvents.size,
      maxCapacity: MAX_TRACKED_EVENTS,
      utilizationPercent: (this.seenEvents.size / MAX_TRACKED_EVENTS) * 100,
    };
  }

  /**
   * Clear all tracked events
   */
  clear(): void {
    this.seenEvents.clear();
    this.eventOrder = [];
  }
}

// Export singleton instance
export const messageDeduplicationService = new MessageDeduplicationService();
