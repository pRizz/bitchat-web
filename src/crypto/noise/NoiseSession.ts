/**
 * NoiseSession - Manages an established Noise protocol session
 *
 * After a successful handshake, this class wraps the transport ciphers
 * and provides a clean interface for encrypted communication.
 *
 * Features:
 * - Send/receive encrypted messages
 * - Session state tracking
 * - Automatic cleanup of sensitive data
 * - Handshake hash for channel binding
 */

import { NoiseCipherState } from './NoiseCipherState';
import { NoiseHandshakeState, NoiseTransportKeys } from './NoiseHandshakeState';
import { NoiseError, NoiseRole, NoisePattern } from './types';

export type NoiseSessionState = 'handshaking' | 'established' | 'closed';

export interface NoiseSessionConfig {
  role: NoiseRole;
  pattern: NoisePattern;
  localStaticKey?: CryptoKeyPair;
  remoteStaticKey?: Uint8Array;
  prologue?: Uint8Array;
  useExtractedNonce?: boolean;
}

export class NoiseSession {
  private handshakeState: NoiseHandshakeState | null;
  private sendCipher: NoiseCipherState | null = null;
  private receiveCipher: NoiseCipherState | null = null;
  private handshakeHash: Uint8Array | null = null;
  private remoteStaticKey: Uint8Array | null = null;
  private sessionState: NoiseSessionState = 'handshaking';
  private readonly useExtractedNonce: boolean;
  private readonly role: NoiseRole;

  constructor(config: NoiseSessionConfig) {
    this.role = config.role;
    this.useExtractedNonce = config.useExtractedNonce ?? true;
    this.handshakeState = new NoiseHandshakeState({
      role: config.role,
      pattern: config.pattern,
      localStaticKey: config.localStaticKey,
      remoteStaticKey: config.remoteStaticKey,
      prologue: config.prologue,
    });
  }

  /**
   * Set local static key (must be called before handshake if not provided in config)
   */
  async setLocalStaticKey(keyPair: CryptoKeyPair): Promise<void> {
    if (!this.handshakeState) {
      throw new NoiseError('HANDSHAKE_COMPLETE', 'Cannot set key after handshake');
    }
    await this.handshakeState.setLocalStaticKey(keyPair);
  }

  /**
   * Get current session state
   */
  getState(): NoiseSessionState {
    return this.sessionState;
  }

  /**
   * Check if session is established
   */
  isEstablished(): boolean {
    return this.sessionState === 'established';
  }

  /**
   * Write the next handshake message
   */
  async writeHandshakeMessage(payload: Uint8Array = new Uint8Array()): Promise<Uint8Array> {
    if (!this.handshakeState) {
      throw new NoiseError('HANDSHAKE_COMPLETE');
    }

    const message = await this.handshakeState.writeMessage(payload);

    // Check if handshake is complete
    if (this.handshakeState.isHandshakeComplete()) {
      this.finalizeHandshake();
    }

    return message;
  }

  /**
   * Read the next handshake message
   */
  async readHandshakeMessage(message: Uint8Array): Promise<Uint8Array> {
    if (!this.handshakeState) {
      throw new NoiseError('HANDSHAKE_COMPLETE');
    }

    const payload = await this.handshakeState.readMessage(message);

    // Check if handshake is complete
    if (this.handshakeState.isHandshakeComplete()) {
      this.finalizeHandshake();
    }

    return payload;
  }

  /**
   * Finalize handshake and extract transport keys
   */
  private finalizeHandshake(): void {
    if (!this.handshakeState) return;

    // Get transport keys
    const keys: NoiseTransportKeys = this.handshakeState.getTransportKeys(this.useExtractedNonce);

    this.sendCipher = keys.sendCipher;
    this.receiveCipher = keys.receiveCipher;
    this.handshakeHash = keys.handshakeHash;
    this.remoteStaticKey = this.handshakeState.getRemoteStaticPublicKey();

    // Clear handshake state
    this.handshakeState = null;
    this.sessionState = 'established';
  }

  /**
   * Encrypt a message for sending
   */
  encrypt(plaintext: Uint8Array, associatedData: Uint8Array = new Uint8Array()): Uint8Array {
    if (!this.sendCipher) {
      throw new NoiseError('HANDSHAKE_NOT_COMPLETE');
    }
    return this.sendCipher.encrypt(plaintext, associatedData);
  }

  /**
   * Decrypt a received message
   */
  decrypt(ciphertext: Uint8Array, associatedData: Uint8Array = new Uint8Array()): Uint8Array {
    if (!this.receiveCipher) {
      throw new NoiseError('HANDSHAKE_NOT_COMPLETE');
    }
    return this.receiveCipher.decrypt(ciphertext, associatedData);
  }

  /**
   * Get the handshake hash (for channel binding)
   */
  getHandshakeHash(): Uint8Array {
    if (!this.handshakeHash) {
      if (this.handshakeState) {
        return this.handshakeState.getHandshakeHash();
      }
      throw new NoiseError('HANDSHAKE_NOT_COMPLETE');
    }
    return new Uint8Array(this.handshakeHash);
  }

  /**
   * Get the remote peer's static public key
   */
  getRemoteStaticKey(): Uint8Array | null {
    return this.remoteStaticKey ? new Uint8Array(this.remoteStaticKey) : null;
  }

  /**
   * Get the role of this session
   */
  getRole(): NoiseRole {
    return this.role;
  }

  /**
   * Close the session and clear all sensitive data
   */
  close(): void {
    if (this.sendCipher) {
      this.sendCipher.clearSensitiveData();
      this.sendCipher = null;
    }
    if (this.receiveCipher) {
      this.receiveCipher.clearSensitiveData();
      this.receiveCipher = null;
    }
    if (this.handshakeHash) {
      this.handshakeHash.fill(0);
      this.handshakeHash = null;
    }
    if (this.remoteStaticKey) {
      this.remoteStaticKey.fill(0);
      this.remoteStaticKey = null;
    }
    this.handshakeState = null;
    this.sessionState = 'closed';
  }
}

/**
 * Create a pair of NoiseSession instances for testing/local communication
 */
export async function createSessionPair(
  initiatorStaticKey: CryptoKeyPair,
  responderStaticKey: CryptoKeyPair,
  pattern: NoisePattern = 'XX'
): Promise<{ initiator: NoiseSession; responder: NoiseSession }> {
  const initiator = new NoiseSession({
    role: 'initiator',
    pattern,
    localStaticKey: initiatorStaticKey,
  });

  const responder = new NoiseSession({
    role: 'responder',
    pattern,
    localStaticKey: responderStaticKey,
  });

  // Extract public keys
  await initiator.setLocalStaticKey(initiatorStaticKey);
  await responder.setLocalStaticKey(responderStaticKey);

  return { initiator, responder };
}
