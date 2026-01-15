// Core types for BitChat Web

export interface PeerID {
  publicKey: Uint8Array;
  fingerprint: string;
}

export interface BitchatMessage {
  id: string;
  type: 'public' | 'private' | 'location';
  content: string;
  senderPubkey: string;
  senderNickname?: string;
  timestamp: number;
  encrypted: boolean;
  verified: boolean;
}

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig?: string;
}

export type EncryptionStatus = 'none' | 'handshaking' | 'secured' | 'verified';

export interface PeerInfo {
  id: string;
  publicKeyHex: string;
  nickname?: string;
  encryptionStatus: EncryptionStatus;
  lastSeen: number;
  via: 'ble' | 'nostr' | 'both';
}

export interface NostrRelay {
  url: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastError?: string;
}

// Noise Protocol types
export type NoiseRole = 'initiator' | 'responder';
export type NoisePattern = 'XX' | 'IK' | 'NK';

export interface NoiseSession {
  remotePublicKey: Uint8Array;
  sendCipher: NoiseCipherState;
  receiveCipher: NoiseCipherState;
  handshakeHash: Uint8Array;
}

export interface NoiseCipherState {
  encrypt(plaintext: Uint8Array, ad?: Uint8Array): Promise<Uint8Array>;
  decrypt(ciphertext: Uint8Array, ad?: Uint8Array): Promise<Uint8Array>;
}

// Nostr identity
export interface NostrIdentity {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  publicKeyHex: string;
  npub: string;
  nsec: string;
}
