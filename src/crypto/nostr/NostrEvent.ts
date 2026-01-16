/**
 * NostrEvent - Nostr event structure
 *
 * Matches the Swift NostrEvent implementation
 */

import { sha256 } from '@noble/hashes/sha256';
import { schnorr } from '@noble/curves/secp256k1';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

export enum NostrEventKind {
  Metadata = 0,
  TextNote = 1,
  EncryptedDM = 4, // NIP-04 legacy encrypted DM
  Seal = 13, // NIP-17 sealed event
  DM = 14, // NIP-17 DM rumor kind
  GiftWrap = 1059, // NIP-59 gift wrap
  EphemeralEvent = 20000,
  GeohashPresence = 20001,
}

export interface NostrEventData {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig?: string;
}

export class NostrEvent implements NostrEventData {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig?: string;

  constructor(params: {
    pubkey: string;
    createdAt: Date;
    kind: NostrEventKind;
    tags: string[][];
    content: string;
  }) {
    this.pubkey = params.pubkey;
    this.created_at = Math.floor(params.createdAt.getTime() / 1000);
    this.kind = params.kind;
    this.tags = params.tags;
    this.content = params.content;
    this.id = '';
  }

  /**
   * Create from dictionary (for parsing received events)
   */
  static fromDict(dict: Record<string, unknown>): NostrEvent {
    const event = new NostrEvent({
      pubkey: dict.pubkey as string,
      createdAt: new Date((dict.created_at as number) * 1000),
      kind: dict.kind as NostrEventKind,
      tags: dict.tags as string[][],
      content: dict.content as string,
    });
    event.id = dict.id as string || '';
    event.sig = dict.sig as string | undefined;
    return event;
  }

  /**
   * Calculate event ID (SHA-256 of serialized event)
   */
  calculateEventId(): { id: string; hash: Uint8Array } {
    const serialized = JSON.stringify([
      0,
      this.pubkey,
      this.created_at,
      this.kind,
      this.tags,
      this.content,
    ]);

    const hash = sha256(new TextEncoder().encode(serialized));
    return {
      id: bytesToHex(hash),
      hash,
    };
  }

  /**
   * Sign the event with a Schnorr private key
   */
  sign(privateKey: Uint8Array): NostrEvent {
    const { id, hash } = this.calculateEventId();

    // Generate random auxiliary data for Schnorr signing
    const auxRand = crypto.getRandomValues(new Uint8Array(32));

    // Sign with BIP-340 Schnorr
    const signature = schnorr.sign(hash, privateKey, auxRand);

    const signed = new NostrEvent({
      pubkey: this.pubkey,
      createdAt: new Date(this.created_at * 1000),
      kind: this.kind as NostrEventKind,
      tags: this.tags,
      content: this.content,
    });
    signed.id = id;
    signed.sig = bytesToHex(signature);
    return signed;
  }

  /**
   * Verify the event signature
   */
  verify(): boolean {
    if (!this.sig || !this.id) return false;

    try {
      const { hash } = this.calculateEventId();
      const signature = hexToBytes(this.sig);
      const pubkey = hexToBytes(this.pubkey);
      return schnorr.verify(signature, hash, pubkey);
    } catch {
      return false;
    }
  }

  /**
   * Convert to JSON string
   */
  toJSON(): string {
    return JSON.stringify({
      id: this.id,
      pubkey: this.pubkey,
      created_at: this.created_at,
      kind: this.kind,
      tags: this.tags,
      content: this.content,
      sig: this.sig,
    });
  }

  /**
   * Convert to plain object for relay transmission
   */
  toObject(): NostrEventData {
    return {
      id: this.id,
      pubkey: this.pubkey,
      created_at: this.created_at,
      kind: this.kind,
      tags: this.tags,
      content: this.content,
      sig: this.sig,
    };
  }
}
