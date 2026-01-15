/**
 * NoiseHandshakeState - Orchestrates the complete Noise handshake process
 *
 * This is the main interface for establishing encrypted sessions between peers.
 * Manages the handshake state machine, message patterns, and key derivation.
 *
 * Matches Swift implementation in NoiseProtocol.swift
 */

import { NoiseSymmetricState } from './NoiseSymmetricState';
import { NoiseCipherState } from './NoiseCipherState';
import {
  NoiseRole,
  NoisePattern,
  NoiseMessagePattern,
  NoiseError,
  createProtocolName,
  getMessagePatterns,
} from './types';

// Low-order points to reject (Curve25519 security)
const LOW_ORDER_POINTS: Uint8Array[] = [
  new Uint8Array(32).fill(0), // All zeros
  new Uint8Array([1, ...new Array(31).fill(0)]), // Order 1 point
  new Uint8Array([0xe0, 0xeb, 0x7a, 0x7c, 0x3b, 0x41, 0xb8, 0xae, 0x16, 0x56, 0xe3, 0xfa, 0xf1, 0x9f, 0xc4, 0x6a, 0xda, 0x09, 0x8d, 0xeb, 0x9c, 0x32, 0xb1, 0xfd, 0x86, 0x62, 0x05, 0x16, 0x5f, 0x49, 0xb8, 0x00]),
  new Uint8Array(32).fill(0xff), // All ones
];

export interface NoiseHandshakeConfig {
  role: NoiseRole;
  pattern: NoisePattern;
  localStaticKey?: CryptoKeyPair;
  remoteStaticKey?: Uint8Array;
  prologue?: Uint8Array;
}

export interface NoiseTransportKeys {
  sendCipher: NoiseCipherState;
  receiveCipher: NoiseCipherState;
  handshakeHash: Uint8Array;
}

export class NoiseHandshakeState {
  private readonly role: NoiseRole;
  private readonly pattern: NoisePattern;
  private symmetricState: NoiseSymmetricState;

  // Keys
  private localStaticPrivate: CryptoKey | null = null;
  private localStaticPublic: Uint8Array | null = null;
  private localEphemeralPrivate: CryptoKey | null = null;
  private localEphemeralPublic: Uint8Array | null = null;

  private remoteStaticPublic: Uint8Array | null = null;
  private remoteEphemeralPublic: Uint8Array | null = null;

  // Message patterns
  private messagePatterns: NoiseMessagePattern[][];
  private currentPattern = 0;

  private prologueData: Uint8Array;

  constructor(config: NoiseHandshakeConfig) {
    this.role = config.role;
    this.pattern = config.pattern;
    this.prologueData = config.prologue || new Uint8Array();

    // Initialize static keys
    if (config.localStaticKey) {
      this.localStaticPrivate = config.localStaticKey.privateKey;
      // Note: public key will be extracted when needed
    }
    this.remoteStaticPublic = config.remoteStaticKey || null;

    // Initialize protocol name and symmetric state
    const protocolName = createProtocolName(config.pattern);
    this.symmetricState = new NoiseSymmetricState(protocolName.fullName);

    // Initialize message patterns
    this.messagePatterns = getMessagePatterns(config.pattern);

    // Mix pre-message keys
    this.mixPreMessageKeys();
  }

  private mixPreMessageKeys(): void {
    // Mix prologue
    this.symmetricState.mixHash(this.prologueData);

    // For XX pattern, no pre-message keys
    // For IK/NK patterns, we'd mix the responder's static key here
    if (this.pattern === 'IK' || this.pattern === 'NK') {
      if (this.role === 'initiator' && this.remoteStaticPublic) {
        this.symmetricState.mixHash(this.remoteStaticPublic);
      }
    }
  }

  /**
   * Initialize local static key (async because we need to export public key)
   */
  async setLocalStaticKey(keyPair: CryptoKeyPair): Promise<void> {
    this.localStaticPrivate = keyPair.privateKey;
    const publicKeyData = await crypto.subtle.exportKey('raw', keyPair.publicKey);
    this.localStaticPublic = new Uint8Array(publicKeyData);
  }

  /**
   * Write the next handshake message
   */
  async writeMessage(payload: Uint8Array = new Uint8Array()): Promise<Uint8Array> {
    if (this.currentPattern >= this.messagePatterns.length) {
      throw new NoiseError('HANDSHAKE_COMPLETE');
    }

    const messageBuffer: number[] = [];
    const patterns = this.messagePatterns[this.currentPattern];

    for (const pattern of patterns) {
      switch (pattern) {
        case 'e': {
          // Generate ephemeral key
          const ephemeralKeyPair = await crypto.subtle.generateKey(
            { name: 'X25519' },
            true,
            ['deriveBits']
          ) as CryptoKeyPair;
          this.localEphemeralPrivate = ephemeralKeyPair.privateKey;
          const publicKeyData = await crypto.subtle.exportKey('raw', ephemeralKeyPair.publicKey);
          this.localEphemeralPublic = new Uint8Array(publicKeyData);

          // Append to message and mix hash
          messageBuffer.push(...this.localEphemeralPublic);
          this.symmetricState.mixHash(this.localEphemeralPublic);
          break;
        }

        case 's': {
          // Send static key (encrypted if cipher is initialized)
          if (!this.localStaticPublic) {
            throw new NoiseError('MISSING_LOCAL_STATIC_KEY');
          }
          const encrypted = this.symmetricState.encryptAndHash(this.localStaticPublic);
          messageBuffer.push(...encrypted);
          break;
        }

        case 'ee':
        case 'es':
        case 'se':
        case 'ss':
          await this.performDHOperation(pattern);
          break;
      }
    }

    // Encrypt payload
    const encryptedPayload = this.symmetricState.encryptAndHash(payload);
    messageBuffer.push(...encryptedPayload);

    this.currentPattern++;
    return new Uint8Array(messageBuffer);
  }

  /**
   * Read the next handshake message
   */
  async readMessage(message: Uint8Array): Promise<Uint8Array> {
    if (this.currentPattern >= this.messagePatterns.length) {
      throw new NoiseError('HANDSHAKE_COMPLETE');
    }

    let offset = 0;
    const patterns = this.messagePatterns[this.currentPattern];

    for (const pattern of patterns) {
      switch (pattern) {
        case 'e': {
          // Read ephemeral key
          if (message.length - offset < 32) {
            throw new NoiseError('INVALID_MESSAGE');
          }
          const ephemeralData = message.slice(offset, offset + 32);
          offset += 32;

          // Validate public key
          this.validatePublicKey(ephemeralData);
          this.remoteEphemeralPublic = ephemeralData;
          this.symmetricState.mixHash(ephemeralData);
          break;
        }

        case 's': {
          // Read static key (may be encrypted)
          const keyLength = this.symmetricState.hasCipherKey() ? 48 : 32;
          if (message.length - offset < keyLength) {
            throw new NoiseError('INVALID_MESSAGE');
          }
          const staticData = message.slice(offset, offset + keyLength);
          offset += keyLength;

          try {
            const decrypted = this.symmetricState.decryptAndHash(staticData);
            this.validatePublicKey(decrypted);
            this.remoteStaticPublic = decrypted;
          } catch {
            throw new NoiseError('AUTHENTICATION_FAILURE');
          }
          break;
        }

        case 'ee':
        case 'es':
        case 'se':
        case 'ss':
          await this.performDHOperation(pattern);
          break;
      }
    }

    // Decrypt payload
    const encryptedPayload = message.slice(offset);
    const payload = this.symmetricState.decryptAndHash(encryptedPayload);

    this.currentPattern++;
    return payload;
  }

  /**
   * Perform DH operation and mix into symmetric state
   */
  private async performDHOperation(pattern: NoiseMessagePattern): Promise<void> {
    let localKey: CryptoKey;
    let remoteKey: Uint8Array;

    switch (pattern) {
      case 'ee':
        if (!this.localEphemeralPrivate || !this.remoteEphemeralPublic) {
          throw new NoiseError('MISSING_KEYS');
        }
        localKey = this.localEphemeralPrivate;
        remoteKey = this.remoteEphemeralPublic;
        break;

      case 'es':
        if (this.role === 'initiator') {
          if (!this.localEphemeralPrivate || !this.remoteStaticPublic) {
            throw new NoiseError('MISSING_KEYS');
          }
          localKey = this.localEphemeralPrivate;
          remoteKey = this.remoteStaticPublic;
        } else {
          if (!this.localStaticPrivate || !this.remoteEphemeralPublic) {
            throw new NoiseError('MISSING_KEYS');
          }
          localKey = this.localStaticPrivate;
          remoteKey = this.remoteEphemeralPublic;
        }
        break;

      case 'se':
        if (this.role === 'initiator') {
          if (!this.localStaticPrivate || !this.remoteEphemeralPublic) {
            throw new NoiseError('MISSING_KEYS');
          }
          localKey = this.localStaticPrivate;
          remoteKey = this.remoteEphemeralPublic;
        } else {
          if (!this.localEphemeralPrivate || !this.remoteStaticPublic) {
            throw new NoiseError('MISSING_KEYS');
          }
          localKey = this.localEphemeralPrivate;
          remoteKey = this.remoteStaticPublic;
        }
        break;

      case 'ss':
        if (!this.localStaticPrivate || !this.remoteStaticPublic) {
          throw new NoiseError('MISSING_KEYS');
        }
        localKey = this.localStaticPrivate;
        remoteKey = this.remoteStaticPublic;
        break;

      default:
        return;
    }

    // Import remote public key and perform ECDH
    const remotePublicKey = await crypto.subtle.importKey(
      'raw',
      remoteKey.slice().buffer,
      { name: 'X25519' },
      false,
      []
    );

    const sharedSecret = await crypto.subtle.deriveBits(
      { name: 'X25519', public: remotePublicKey },
      localKey,
      256
    );

    this.symmetricState.mixKey(new Uint8Array(sharedSecret));
  }

  /**
   * Check if handshake is complete
   */
  isHandshakeComplete(): boolean {
    return this.currentPattern >= this.messagePatterns.length;
  }

  /**
   * Get transport ciphers after handshake completion
   */
  getTransportKeys(useExtractedNonce: boolean): NoiseTransportKeys {
    if (!this.isHandshakeComplete()) {
      throw new NoiseError('HANDSHAKE_NOT_COMPLETE');
    }

    // Capture handshake hash before split clears state
    const handshakeHash = this.symmetricState.getHandshakeHash();

    const [c1, c2] = this.symmetricState.split(useExtractedNonce);

    // Initiator uses c1 for sending, c2 for receiving
    // Responder uses c2 for sending, c1 for receiving
    return this.role === 'initiator'
      ? { sendCipher: c1, receiveCipher: c2, handshakeHash }
      : { sendCipher: c2, receiveCipher: c1, handshakeHash };
  }

  /**
   * Get remote static public key after handshake
   */
  getRemoteStaticPublicKey(): Uint8Array | null {
    return this.remoteStaticPublic ? new Uint8Array(this.remoteStaticPublic) : null;
  }

  /**
   * Get current handshake hash
   */
  getHandshakeHash(): Uint8Array {
    return this.symmetricState.getHandshakeHash();
  }

  /**
   * Validate a Curve25519 public key
   */
  private validatePublicKey(keyData: Uint8Array): void {
    if (keyData.length !== 32) {
      throw new NoiseError('INVALID_PUBLIC_KEY');
    }

    // Check for low-order points
    for (const badPoint of LOW_ORDER_POINTS) {
      if (this.constantTimeCompare(keyData, badPoint)) {
        throw new NoiseError('INVALID_PUBLIC_KEY', 'Low-order point detected');
      }
    }
  }

  /**
   * Constant-time comparison to prevent timing attacks
   */
  private constantTimeCompare(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a[i] ^ b[i];
    }
    return result === 0;
  }
}
