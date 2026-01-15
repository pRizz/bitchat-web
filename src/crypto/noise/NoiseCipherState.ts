/**
 * NoiseCipherState - Manages symmetric encryption for Noise protocol sessions
 *
 * Handles ChaCha20-Poly1305 AEAD encryption with automatic nonce management
 * and replay protection using a sliding window algorithm.
 *
 * Matches Swift implementation in NoiseProtocol.swift
 */

import { chacha20poly1305 } from '@noble/ciphers/chacha';
import { NoiseError } from './types';

// Constants matching Swift implementation
const NONCE_SIZE_BYTES = 4;
const REPLAY_WINDOW_SIZE = 1024;
const REPLAY_WINDOW_BYTES = REPLAY_WINDOW_SIZE / 8; // 128 bytes
// const HIGH_NONCE_WARNING_THRESHOLD = 1_000_000_000n; // Unused for now

export class NoiseCipherState {
  private key: Uint8Array | null = null;
  private nonce: bigint = 0n;
  private useExtractedNonce: boolean;

  // Sliding window replay protection (only used when useExtractedNonce = true)
  private highestReceivedNonce: bigint = 0n;
  private replayWindow: Uint8Array = new Uint8Array(REPLAY_WINDOW_BYTES);

  constructor(key?: Uint8Array, useExtractedNonce = false) {
    if (key) {
      this.key = new Uint8Array(key);
    }
    this.useExtractedNonce = useExtractedNonce;
  }

  initializeKey(key: Uint8Array): void {
    this.key = new Uint8Array(key);
    this.nonce = 0n;
  }

  hasKey(): boolean {
    return this.key !== null;
  }

  /**
   * Encrypt plaintext with ChaCha20-Poly1305
   * Returns: useExtractedNonce ? <4-byte-nonce><ciphertext><16-byte-tag> : <ciphertext><16-byte-tag>
   */
  encrypt(plaintext: Uint8Array, associatedData: Uint8Array = new Uint8Array()): Uint8Array {
    if (!this.key) {
      throw new NoiseError('UNINITIALIZED_CIPHER');
    }

    const currentNonce = this.nonce;

    // Check if nonce exceeds 4-byte limit (UInt32 max)
    if (currentNonce > BigInt(0xffffffff) - 1n) {
      throw new NoiseError('NONCE_EXCEEDED');
    }

    // Create 12-byte nonce from counter (little-endian in bytes 4-12)
    // This matches Swift: nonce is placed in bytes 4-12 of 12-byte array
    const nonceData = new Uint8Array(12);
    const view = new DataView(nonceData.buffer);
    view.setBigUint64(4, currentNonce, true); // little-endian

    // Encrypt with ChaCha20-Poly1305
    const cipher = chacha20poly1305(this.key, nonceData, associatedData);
    const ciphertext = cipher.encrypt(plaintext);

    // Increment nonce
    this.nonce += 1n;

    // Build output
    if (this.useExtractedNonce) {
      // Include 4-byte nonce prefix (big-endian)
      const nonceBytes = new Uint8Array(NONCE_SIZE_BYTES);
      const nonceView = new DataView(nonceBytes.buffer);
      nonceView.setUint32(0, Number(currentNonce), false); // big-endian

      const result = new Uint8Array(NONCE_SIZE_BYTES + ciphertext.length);
      result.set(nonceBytes, 0);
      result.set(ciphertext, NONCE_SIZE_BYTES);
      return result;
    } else {
      return ciphertext;
    }
  }

  /**
   * Decrypt ciphertext with ChaCha20-Poly1305
   * Expects: useExtractedNonce ? <4-byte-nonce><ciphertext><16-byte-tag> : <ciphertext><16-byte-tag>
   */
  decrypt(ciphertext: Uint8Array, associatedData: Uint8Array = new Uint8Array()): Uint8Array {
    if (!this.key) {
      throw new NoiseError('UNINITIALIZED_CIPHER');
    }

    if (ciphertext.length < 16) {
      throw new NoiseError('INVALID_CIPHERTEXT');
    }

    let actualCiphertext: Uint8Array;
    let decryptionNonce: bigint;

    if (this.useExtractedNonce) {
      // Extract nonce from payload
      if (ciphertext.length < NONCE_SIZE_BYTES + 16) {
        throw new NoiseError('INVALID_CIPHERTEXT');
      }

      const nonceBytes = ciphertext.slice(0, NONCE_SIZE_BYTES);
      const nonceView = new DataView(nonceBytes.buffer, nonceBytes.byteOffset);
      decryptionNonce = BigInt(nonceView.getUint32(0, false)); // big-endian

      // Validate nonce with sliding window
      if (!this.isValidNonce(decryptionNonce)) {
        throw new NoiseError('REPLAY_DETECTED');
      }

      actualCiphertext = ciphertext.slice(NONCE_SIZE_BYTES);
    } else {
      actualCiphertext = ciphertext;
      decryptionNonce = this.nonce;
    }

    // Create 12-byte nonce (little-endian in bytes 4-12)
    const nonceData = new Uint8Array(12);
    const view = new DataView(nonceData.buffer);
    view.setBigUint64(4, decryptionNonce, true); // little-endian

    // Decrypt
    const cipher = chacha20poly1305(this.key, nonceData, associatedData);
    let plaintext: Uint8Array;
    try {
      plaintext = cipher.decrypt(actualCiphertext);
    } catch {
      throw new NoiseError('INVALID_CIPHERTEXT', 'Decryption failed - authentication failed');
    }

    // Update state after successful decryption
    if (this.useExtractedNonce) {
      this.markNonceAsSeen(decryptionNonce);
    }
    this.nonce += 1n;

    return plaintext;
  }

  /**
   * Check if nonce is valid for replay protection
   */
  private isValidNonce(receivedNonce: bigint): boolean {
    const windowSize = BigInt(REPLAY_WINDOW_SIZE);

    // Too old - outside window
    if (this.highestReceivedNonce >= windowSize && receivedNonce <= this.highestReceivedNonce - windowSize) {
      return false;
    }

    // Always accept newer nonces
    if (receivedNonce > this.highestReceivedNonce) {
      return true;
    }

    // Check if already seen in window
    const offset = Number(this.highestReceivedNonce - receivedNonce);
    const byteIndex = Math.floor(offset / 8);
    const bitIndex = offset % 8;

    return (this.replayWindow[byteIndex] & (1 << bitIndex)) === 0;
  }

  /**
   * Mark nonce as seen in replay window
   */
  private markNonceAsSeen(receivedNonce: bigint): void {
    if (receivedNonce > this.highestReceivedNonce) {
      const shift = Number(receivedNonce - this.highestReceivedNonce);

      if (shift >= REPLAY_WINDOW_SIZE) {
        // Clear entire window
        this.replayWindow.fill(0);
      } else {
        // Shift window right
        for (let i = REPLAY_WINDOW_BYTES - 1; i >= 0; i--) {
          const sourceByteIndex = i - Math.floor(shift / 8);
          let newByte = 0;

          if (sourceByteIndex >= 0) {
            newByte = this.replayWindow[sourceByteIndex] >> (shift % 8);
            if (sourceByteIndex > 0 && shift % 8 !== 0) {
              newByte |= this.replayWindow[sourceByteIndex - 1] << (8 - (shift % 8));
            }
          }

          this.replayWindow[i] = newByte;
        }
      }

      this.highestReceivedNonce = receivedNonce;
      this.replayWindow[0] |= 1; // Mark most recent bit as seen
    } else {
      const offset = Number(this.highestReceivedNonce - receivedNonce);
      const byteIndex = Math.floor(offset / 8);
      const bitIndex = offset % 8;
      this.replayWindow[byteIndex] |= 1 << bitIndex;
    }
  }

  /**
   * Clear sensitive data
   */
  clearSensitiveData(): void {
    if (this.key) {
      this.key.fill(0);
      this.key = null;
    }
    this.nonce = 0n;
    this.highestReceivedNonce = 0n;
    this.replayWindow.fill(0);
  }
}
