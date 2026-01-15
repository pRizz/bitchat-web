/**
 * Noise Protocol implementation for BitChat Web
 *
 * Provides end-to-end encryption using the Noise Framework XX pattern.
 * Compatible with the Swift iOS/macOS implementation.
 */

export { NoiseCipherState } from './NoiseCipherState';
export { NoiseSymmetricState } from './NoiseSymmetricState';
export { NoiseHandshakeState } from './NoiseHandshakeState';
export type { NoiseHandshakeConfig, NoiseTransportKeys } from './NoiseHandshakeState';
export {
  NoiseError,
  createProtocolName,
  getMessagePatterns,
} from './types';
export type {
  NoiseRole,
  NoisePattern,
  NoiseMessagePattern,
  NoiseProtocolName,
} from './types';
