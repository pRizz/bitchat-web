/**
 * NostrProtocol - NIP-17/NIP-44/NIP-59 implementation
 *
 * Provides private messaging with gift wrapping for BitChat Web.
 * Matches the Swift implementation in NostrProtocol.swift.
 */

import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { schnorr, secp256k1 } from '@noble/curves/secp256k1';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { NostrEvent, NostrEventKind } from './NostrEvent';
import type { NostrIdentity } from '@/types';

export class NostrProtocolError extends Error {
  constructor(
    public code: 'INVALID_PUBLIC_KEY' | 'INVALID_CIPHERTEXT' | 'INVALID_EVENT' | 'ENCRYPTION_FAILED',
    message?: string
  ) {
    super(message || code);
    this.name = 'NostrProtocolError';
  }
}

export class NostrProtocol {
  /**
   * Create a NIP-17 private message with NIP-59 gift wrapping
   */
  static async createPrivateMessage(
    content: string,
    recipientPubkey: string,
    senderIdentity: NostrIdentity
  ): Promise<NostrEvent> {
    // 1. Create the rumor (unsigned event)
    const rumor = new NostrEvent({
      pubkey: senderIdentity.publicKeyHex,
      createdAt: new Date(),
      kind: NostrEventKind.DM,
      tags: [],
      content,
    });

    // 2. Create ephemeral key for this message
    const ephemeralPrivateKey = schnorr.utils.randomPrivateKey();

    // 3. Seal the rumor (encrypt to recipient)
    const sealedEvent = await this.createSeal(rumor, recipientPubkey, ephemeralPrivateKey);

    // 4. Gift wrap the sealed event
    const giftWrap = await this.createGiftWrap(sealedEvent, recipientPubkey);

    return giftWrap;
  }

  /**
   * Decrypt a received NIP-17 message
   */
  static async decryptPrivateMessage(
    giftWrap: NostrEvent,
    recipientIdentity: NostrIdentity
  ): Promise<{ content: string; senderPubkey: string; timestamp: number }> {
    // 1. Unwrap the gift wrap
    const seal = await this.unwrapGiftWrap(giftWrap, recipientIdentity.privateKey);

    // 2. Open the seal
    const rumor = await this.openSeal(seal, recipientIdentity.privateKey);

    return {
      content: rumor.content,
      senderPubkey: rumor.pubkey,
      timestamp: rumor.created_at,
    };
  }

  /**
   * Create a geohash-scoped ephemeral public message (kind 20000)
   */
  static createEphemeralGeohashEvent(
    content: string,
    geohash: string,
    senderIdentity: NostrIdentity,
    nickname?: string,
    teleported = false
  ): NostrEvent {
    const tags: string[][] = [['g', geohash]];
    if (nickname?.trim()) {
      tags.push(['n', nickname.trim()]);
    }
    if (teleported) {
      tags.push(['t', 'teleport']);
    }

    const event = new NostrEvent({
      pubkey: senderIdentity.publicKeyHex,
      createdAt: new Date(),
      kind: NostrEventKind.EphemeralEvent,
      tags,
      content,
    });

    return event.sign(senderIdentity.privateKey);
  }

  /**
   * Create a geohash presence heartbeat (kind 20001)
   */
  static createGeohashPresenceEvent(
    geohash: string,
    senderIdentity: NostrIdentity
  ): NostrEvent {
    const event = new NostrEvent({
      pubkey: senderIdentity.publicKeyHex,
      createdAt: new Date(),
      kind: NostrEventKind.GeohashPresence,
      tags: [['g', geohash]],
      content: '',
    });

    return event.sign(senderIdentity.privateKey);
  }

  // MARK: - Private Methods

  private static async createSeal(
    rumor: NostrEvent,
    recipientPubkey: string,
    senderKey: Uint8Array
  ): Promise<NostrEvent> {
    const rumorJSON = rumor.toJSON();
    const encrypted = await this.encrypt(rumorJSON, recipientPubkey, senderKey);

    const senderPubkey = schnorr.getPublicKey(senderKey);

    const seal = new NostrEvent({
      pubkey: bytesToHex(senderPubkey),
      createdAt: this.randomizedTimestamp(),
      kind: NostrEventKind.Seal,
      tags: [],
      content: encrypted,
    });

    return seal.sign(senderKey);
  }

  private static async createGiftWrap(
    seal: NostrEvent,
    recipientPubkey: string
  ): Promise<NostrEvent> {
    const sealJSON = seal.toJSON();

    // Create new ephemeral key for gift wrap
    const wrapKey = schnorr.utils.randomPrivateKey();
    const wrapPubkey = schnorr.getPublicKey(wrapKey);

    const encrypted = await this.encrypt(sealJSON, recipientPubkey, wrapKey);

    const giftWrap = new NostrEvent({
      pubkey: bytesToHex(wrapPubkey),
      createdAt: this.randomizedTimestamp(),
      kind: NostrEventKind.GiftWrap,
      tags: [['p', recipientPubkey]],
      content: encrypted,
    });

    return giftWrap.sign(wrapKey);
  }

  private static async unwrapGiftWrap(
    giftWrap: NostrEvent,
    recipientKey: Uint8Array
  ): Promise<NostrEvent> {
    const decrypted = await this.decrypt(giftWrap.content, giftWrap.pubkey, recipientKey);
    const sealDict = JSON.parse(decrypted);
    return NostrEvent.fromDict(sealDict);
  }

  private static async openSeal(
    seal: NostrEvent,
    recipientKey: Uint8Array
  ): Promise<NostrEvent> {
    const decrypted = await this.decrypt(seal.content, seal.pubkey, recipientKey);
    const rumorDict = JSON.parse(decrypted);
    return NostrEvent.fromDict(rumorDict);
  }

  // MARK: - NIP-44 v2 Encryption

  private static async encrypt(
    plaintext: string,
    recipientPubkey: string,
    senderKey: Uint8Array
  ): Promise<string> {
    const recipientPubkeyData = hexToBytes(recipientPubkey);

    // Derive shared secret
    const sharedSecret = this.deriveSharedSecret(senderKey, recipientPubkeyData);

    // Derive NIP-44 v2 symmetric key
    const key = this.deriveNIP44V2Key(sharedSecret);

    // 24-byte random nonce for XChaCha20-Poly1305
    const nonce = crypto.getRandomValues(new Uint8Array(24));

    // Encrypt
    const plaintextBytes = new TextEncoder().encode(plaintext);
    const cipher = xchacha20poly1305(key, nonce);
    const ciphertext = cipher.encrypt(plaintextBytes);

    // v2: base64url(nonce24 || ciphertext || tag)
    // Note: @noble/ciphers includes tag in ciphertext
    const combined = new Uint8Array(nonce.length + ciphertext.length);
    combined.set(nonce, 0);
    combined.set(ciphertext, nonce.length);

    return 'v2:' + this.base64URLEncode(combined);
  }

  private static async decrypt(
    ciphertext: string,
    senderPubkey: string,
    recipientKey: Uint8Array
  ): Promise<string> {
    if (!ciphertext.startsWith('v2:')) {
      throw new NostrProtocolError('INVALID_CIPHERTEXT', 'Expected NIP-44 v2 format');
    }

    const encoded = ciphertext.slice(3);
    const data = this.base64URLDecode(encoded);

    if (data.length <= 24 + 16) {
      throw new NostrProtocolError('INVALID_CIPHERTEXT', 'Ciphertext too short');
    }

    const nonce = data.slice(0, 24);
    const encryptedData = data.slice(24);

    const senderPubkeyData = hexToBytes(senderPubkey);

    // Try decryption with both Y coordinate parities for x-only pubkeys
    const tryDecrypt = (pubKeyData: Uint8Array): Uint8Array => {
      const sharedSecret = this.deriveSharedSecret(recipientKey, pubKeyData);
      const key = this.deriveNIP44V2Key(sharedSecret);
      const cipher = xchacha20poly1305(key, nonce);
      return cipher.decrypt(encryptedData);
    };

    // If 32 bytes (x-only), try both parities
    if (senderPubkeyData.length === 32) {
      // Try even Y (0x02 prefix)
      try {
        const evenKey = new Uint8Array(33);
        evenKey[0] = 0x02;
        evenKey.set(senderPubkeyData, 1);
        const plaintext = tryDecrypt(evenKey);
        return new TextDecoder().decode(plaintext);
      } catch {
        // Try odd Y (0x03 prefix)
        const oddKey = new Uint8Array(33);
        oddKey[0] = 0x03;
        oddKey.set(senderPubkeyData, 1);
        const plaintext = tryDecrypt(oddKey);
        return new TextDecoder().decode(plaintext);
      }
    } else {
      const plaintext = tryDecrypt(senderPubkeyData);
      return new TextDecoder().decode(plaintext);
    }
  }

  /**
   * Derive ECDH shared secret using secp256k1
   */
  private static deriveSharedSecret(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
    // Get full public key point
    let pubKeyPoint: typeof secp256k1.ProjectivePoint.BASE;

    if (publicKey.length === 32) {
      // X-only key - try to lift x to point
      // Default to even Y
      const evenKey = new Uint8Array(33);
      evenKey[0] = 0x02;
      evenKey.set(publicKey, 1);
      pubKeyPoint = secp256k1.ProjectivePoint.fromHex(evenKey);
    } else if (publicKey.length === 33) {
      // Compressed key
      pubKeyPoint = secp256k1.ProjectivePoint.fromHex(publicKey);
    } else {
      throw new NostrProtocolError('INVALID_PUBLIC_KEY', 'Invalid public key length');
    }

    // Multiply by private key scalar
    const sharedPoint = pubKeyPoint.multiply(BigInt('0x' + bytesToHex(privateKey)));

    // Return x-coordinate (32 bytes)
    return sharedPoint.toRawBytes(true).slice(1); // Skip prefix byte
  }

  /**
   * Derive NIP-44 v2 symmetric key using HKDF-SHA256
   */
  private static deriveNIP44V2Key(sharedSecret: Uint8Array): Uint8Array {
    return hkdf(sha256, sharedSecret, new Uint8Array(), new TextEncoder().encode('nip44-v2'), 32);
  }

  /**
   * Randomize timestamp for privacy (+/- 15 minutes)
   */
  private static randomizedTimestamp(): Date {
    const offset = Math.random() * 1800 - 900; // -900 to 900 seconds
    return new Date(Date.now() + offset * 1000);
  }

  // MARK: - Base64URL Helpers

  private static base64URLEncode(data: Uint8Array): string {
    const base64 = btoa(String.fromCharCode(...data));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  private static base64URLDecode(str: string): Uint8Array {
    // Add padding
    const pad = (4 - (str.length % 4)) % 4;
    let padded = str + '='.repeat(pad);
    // Replace URL-safe chars
    padded = padded.replace(/-/g, '+').replace(/_/g, '/');
    // Decode
    const binary = atob(padded);
    return new Uint8Array([...binary].map(c => c.charCodeAt(0)));
  }
}
