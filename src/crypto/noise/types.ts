/**
 * Noise Protocol types matching Swift implementation
 */

export type NoiseRole = 'initiator' | 'responder';

export type NoisePattern = 'XX' | 'IK' | 'NK';

export type NoiseMessagePattern = 'e' | 's' | 'ee' | 'es' | 'se' | 'ss';

export interface NoiseProtocolName {
  pattern: string;
  dh: string;
  cipher: string;
  hash: string;
  fullName: string;
}

export class NoiseError extends Error {
  constructor(
    public code:
      | 'UNINITIALIZED_CIPHER'
      | 'INVALID_CIPHERTEXT'
      | 'HANDSHAKE_COMPLETE'
      | 'HANDSHAKE_NOT_COMPLETE'
      | 'MISSING_LOCAL_STATIC_KEY'
      | 'MISSING_KEYS'
      | 'INVALID_MESSAGE'
      | 'AUTHENTICATION_FAILURE'
      | 'INVALID_PUBLIC_KEY'
      | 'REPLAY_DETECTED'
      | 'NONCE_EXCEEDED',
    message?: string
  ) {
    super(message || code);
    this.name = 'NoiseError';
  }
}

export function createProtocolName(pattern: NoisePattern): NoiseProtocolName {
  return {
    pattern: pattern,
    dh: '25519',
    cipher: 'ChaChaPoly',
    hash: 'SHA256',
    get fullName() {
      return `Noise_${this.pattern}_${this.dh}_${this.cipher}_${this.hash}`;
    },
  };
}

/**
 * Get message patterns for a Noise pattern
 * XX: Most versatile, mutual authentication
 * IK: Initiator knows responder's static key
 * NK: Anonymous initiator
 */
export function getMessagePatterns(pattern: NoisePattern): NoiseMessagePattern[][] {
  switch (pattern) {
    case 'XX':
      return [
        ['e'],              // -> e
        ['e', 'ee', 's', 'es'], // <- e, ee, s, es
        ['s', 'se'],        // -> s, se
      ];
    case 'IK':
      return [
        ['e', 'es', 's', 'ss'], // -> e, es, s, ss
        ['e', 'ee', 'se'],      // <- e, ee, se
      ];
    case 'NK':
      return [
        ['e', 'es'],        // -> e, es
        ['e', 'ee'],        // <- e, ee
      ];
  }
}
