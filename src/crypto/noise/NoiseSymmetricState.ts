/**
 * NoiseSymmetricState - Manages symmetric cryptographic state during Noise handshakes
 *
 * Responsible for key derivation, protocol name hashing, and maintaining
 * the chaining key that provides key separation between handshake messages.
 *
 * Matches Swift implementation in NoiseProtocol.swift
 */

import { sha256 } from '@noble/hashes/sha256';
import { hmac } from '@noble/hashes/hmac';
import { NoiseCipherState } from './NoiseCipherState';

export class NoiseSymmetricState {
  private cipherState: NoiseCipherState;
  private chainingKey: Uint8Array;
  private hash: Uint8Array;

  constructor(protocolName: string) {
    this.cipherState = new NoiseCipherState();

    // Initialize with protocol name
    const nameData = new TextEncoder().encode(protocolName);
    if (nameData.length <= 32) {
      // Pad to 32 bytes
      this.hash = new Uint8Array(32);
      this.hash.set(nameData, 0);
    } else {
      // Hash if longer than 32 bytes
      this.hash = sha256(nameData);
    }

    this.chainingKey = new Uint8Array(this.hash);
  }

  /**
   * Mix key material into the chaining key and initialize cipher
   */
  mixKey(inputKeyMaterial: Uint8Array): void {
    const output = this.hkdf(this.chainingKey, inputKeyMaterial, 2);
    this.chainingKey = output[0];
    this.cipherState.initializeKey(output[1]);
  }

  /**
   * Mix data into the handshake hash
   */
  mixHash(data: Uint8Array): void {
    const combined = new Uint8Array(this.hash.length + data.length);
    combined.set(this.hash, 0);
    combined.set(data, this.hash.length);
    this.hash = sha256(combined);
  }

  /**
   * Mix key material and update hash (used for PSK patterns)
   */
  mixKeyAndHash(inputKeyMaterial: Uint8Array): void {
    const output = this.hkdf(this.chainingKey, inputKeyMaterial, 3);
    this.chainingKey = output[0];
    this.mixHash(output[1]);
    this.cipherState.initializeKey(output[2]);
  }

  /**
   * Get the current handshake hash
   */
  getHandshakeHash(): Uint8Array {
    return new Uint8Array(this.hash);
  }

  /**
   * Check if cipher key is initialized
   */
  hasCipherKey(): boolean {
    return this.cipherState.hasKey();
  }

  /**
   * Encrypt and mix into hash
   */
  encryptAndHash(plaintext: Uint8Array): Uint8Array {
    if (this.cipherState.hasKey()) {
      const ciphertext = this.cipherState.encrypt(plaintext, this.hash);
      this.mixHash(ciphertext);
      return ciphertext;
    } else {
      this.mixHash(plaintext);
      return plaintext;
    }
  }

  /**
   * Decrypt and mix into hash
   */
  decryptAndHash(ciphertext: Uint8Array): Uint8Array {
    if (this.cipherState.hasKey()) {
      const plaintext = this.cipherState.decrypt(ciphertext, this.hash);
      this.mixHash(ciphertext);
      return plaintext;
    } else {
      this.mixHash(ciphertext);
      return ciphertext;
    }
  }

  /**
   * Split into transport cipher states
   * Returns [sendCipher, receiveCipher] - roles will swap based on initiator/responder
   */
  split(useExtractedNonce: boolean): [NoiseCipherState, NoiseCipherState] {
    const output = this.hkdf(this.chainingKey, new Uint8Array(), 2);

    const c1 = new NoiseCipherState(output[0], useExtractedNonce);
    const c2 = new NoiseCipherState(output[1], useExtractedNonce);

    // Clear sensitive state after split
    this.clearSensitiveData();

    return [c1, c2];
  }

  /**
   * HKDF implementation (SHA-256)
   */
  private hkdf(chainingKey: Uint8Array, inputKeyMaterial: Uint8Array, numOutputs: number): Uint8Array[] {
    // Extract
    const tempKey = hmac(sha256, chainingKey, inputKeyMaterial);

    // Expand
    const outputs: Uint8Array[] = [];
    let currentOutput = new Uint8Array();

    for (let i = 1; i <= numOutputs; i++) {
      const input = new Uint8Array(currentOutput.length + 1);
      input.set(currentOutput, 0);
      input[currentOutput.length] = i;

      const hmacResult = hmac(sha256, tempKey, input);
      currentOutput = new Uint8Array(hmacResult);
      outputs.push(currentOutput.slice());
    }

    return outputs;
  }

  /**
   * Clear sensitive data
   */
  clearSensitiveData(): void {
    this.chainingKey.fill(0);
    this.hash.fill(0);
    this.cipherState.clearSensitiveData();
  }
}
