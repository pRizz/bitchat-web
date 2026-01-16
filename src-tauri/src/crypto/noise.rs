//! Noise Protocol implementation using the snow crate.
//!
//! Provides XX, IK, and NK handshake patterns for secure
//! peer-to-peer communication with forward secrecy.

use snow::{Builder, Keypair};
use thiserror::Error;

use super::session::{Session, SessionManager, SessionState, SESSIONS};

/// Noise Protocol patterns supported
pub const PATTERN_XX: &str = "Noise_XX_25519_ChaChaPoly_BLAKE2s";
pub const PATTERN_IK: &str = "Noise_IK_25519_ChaChaPoly_BLAKE2s";
pub const PATTERN_NK: &str = "Noise_NK_25519_ChaChaPoly_BLAKE2s";

/// Maximum message size for Noise Protocol
const MAX_MESSAGE_SIZE: usize = 65535;

/// Errors that can occur during Noise operations
#[derive(Error, Debug)]
pub enum NoiseError {
    #[error("Snow error: {0}")]
    Snow(#[from] snow::Error),

    #[error("Session not found for peer: {0}")]
    SessionNotFound(String),

    #[error("Session already exists for peer: {0}")]
    SessionExists(String),

    #[error("Handshake not complete")]
    HandshakeNotComplete,

    #[error("Handshake already complete")]
    HandshakeAlreadyComplete,

    #[error("Invalid pattern: {0}")]
    InvalidPattern(String),

    #[error("Message too large: {0} bytes (max {MAX_MESSAGE_SIZE})")]
    MessageTooLarge(usize),

    #[error("Decryption failed")]
    DecryptionFailed,
}

/// Static keypair for this node (generated once)
lazy_static::lazy_static! {
    static ref LOCAL_KEYPAIR: Keypair = {
        let builder = Builder::new(PATTERN_XX.parse().unwrap());
        builder.generate_keypair().expect("Failed to generate keypair")
    };
}

/// Get the local public key
pub fn get_local_public_key() -> Vec<u8> {
    LOCAL_KEYPAIR.public.clone()
}

/// Parse a pattern string to the full Noise pattern
fn get_pattern(pattern: &str) -> Result<&'static str, NoiseError> {
    match pattern.to_uppercase().as_str() {
        "XX" => Ok(PATTERN_XX),
        "IK" => Ok(PATTERN_IK),
        "NK" => Ok(PATTERN_NK),
        _ => Err(NoiseError::InvalidPattern(pattern.to_string())),
    }
}

/// Initiate a handshake with a peer
///
/// For XX pattern: No remote key needed
/// For IK pattern: Remote static key required
/// For NK pattern: Remote static key required
pub fn initiate_handshake(
    peer_id: &str,
    pattern: &str,
    remote_static: Option<&[u8]>,
) -> Result<Vec<u8>, NoiseError> {
    if SESSIONS.contains(peer_id) {
        return Err(NoiseError::SessionExists(peer_id.to_string()));
    }

    let pattern_str = get_pattern(pattern)?;
    let mut builder = Builder::new(pattern_str.parse()?);
    builder = builder.local_private_key(&LOCAL_KEYPAIR.private);

    // IK and NK patterns need the remote static key upfront
    if pattern.to_uppercase() != "XX" {
        if let Some(rs) = remote_static {
            builder = builder.remote_public_key(rs);
        }
    }

    let mut handshake = builder.build_initiator()?;

    // Generate first handshake message
    let mut buf = vec![0u8; MAX_MESSAGE_SIZE];
    let len = handshake.write_message(&[], &mut buf)?;
    buf.truncate(len);

    // Store the session
    let session = Session {
        peer_id: peer_id.to_string(),
        pattern: pattern.to_uppercase(),
        is_initiator: true,
        state: SessionState::Handshaking(handshake),
        remote_static_key: None,
    };
    SESSIONS.insert(peer_id.to_string(), session);

    Ok(buf)
}

/// Respond to a handshake from a peer
pub fn respond_handshake(
    peer_id: &str,
    pattern: &str,
    message: &[u8],
) -> Result<Vec<u8>, NoiseError> {
    if SESSIONS.contains(peer_id) {
        return Err(NoiseError::SessionExists(peer_id.to_string()));
    }

    let pattern_str = get_pattern(pattern)?;
    let builder = Builder::new(pattern_str.parse()?)
        .local_private_key(&LOCAL_KEYPAIR.private);

    let mut handshake = builder.build_responder()?;

    // Process incoming message
    let mut payload = vec![0u8; MAX_MESSAGE_SIZE];
    let _payload_len = handshake.read_message(message, &mut payload)?;

    // Generate response
    let mut response = vec![0u8; MAX_MESSAGE_SIZE];
    let len = handshake.write_message(&[], &mut response)?;
    response.truncate(len);

    // Store the session
    let session = Session {
        peer_id: peer_id.to_string(),
        pattern: pattern.to_uppercase(),
        is_initiator: false,
        state: SessionState::Handshaking(handshake),
        remote_static_key: None,
    };
    SESSIONS.insert(peer_id.to_string(), session);

    Ok(response)
}

/// Continue the handshake with an incoming message
pub fn continue_handshake(peer_id: &str, message: &[u8]) -> Result<Option<Vec<u8>>, NoiseError> {
    SESSIONS
        .with_session_mut(peer_id, |session| {
            let handshake = match &mut session.state {
                SessionState::Handshaking(hs) => hs,
                SessionState::Transport(_) => return Err(NoiseError::HandshakeAlreadyComplete),
            };

            // Read incoming message
            let mut payload = vec![0u8; MAX_MESSAGE_SIZE];
            let _payload_len = handshake.read_message(message, &mut payload)?;

            // Check if handshake is complete
            if handshake.is_handshake_finished() {
                // Get remote static key before transitioning
                let remote_static = handshake.get_remote_static().map(|k| k.to_vec());

                // Transition to transport mode
                let transport = handshake.clone().into_transport_mode()?;
                session.remote_static_key = remote_static;
                session.state = SessionState::Transport(transport);
                return Ok(None);
            }

            // Generate response if needed
            if !handshake.is_my_turn() {
                return Ok(None);
            }

            let mut response = vec![0u8; MAX_MESSAGE_SIZE];
            let len = handshake.write_message(&[], &mut response)?;
            response.truncate(len);

            // Check again after writing
            if handshake.is_handshake_finished() {
                let remote_static = handshake.get_remote_static().map(|k| k.to_vec());
                let transport = handshake.clone().into_transport_mode()?;
                session.remote_static_key = remote_static;
                session.state = SessionState::Transport(transport);
            }

            Ok(Some(response))
        })
        .ok_or_else(|| NoiseError::SessionNotFound(peer_id.to_string()))?
}

/// Encrypt a message for a peer (requires completed handshake)
pub fn encrypt(peer_id: &str, plaintext: &[u8]) -> Result<Vec<u8>, NoiseError> {
    if plaintext.len() > MAX_MESSAGE_SIZE - 16 {
        return Err(NoiseError::MessageTooLarge(plaintext.len()));
    }

    SESSIONS
        .with_session_mut(peer_id, |session| {
            let transport = match &mut session.state {
                SessionState::Transport(t) => t,
                SessionState::Handshaking(_) => return Err(NoiseError::HandshakeNotComplete),
            };

            let mut ciphertext = vec![0u8; plaintext.len() + 16]; // 16 bytes for auth tag
            let len = transport.write_message(plaintext, &mut ciphertext)?;
            ciphertext.truncate(len);

            Ok(ciphertext)
        })
        .ok_or_else(|| NoiseError::SessionNotFound(peer_id.to_string()))?
}

/// Decrypt a message from a peer (requires completed handshake)
pub fn decrypt(peer_id: &str, ciphertext: &[u8]) -> Result<Vec<u8>, NoiseError> {
    if ciphertext.len() > MAX_MESSAGE_SIZE {
        return Err(NoiseError::MessageTooLarge(ciphertext.len()));
    }

    SESSIONS
        .with_session_mut(peer_id, |session| {
            let transport = match &mut session.state {
                SessionState::Transport(t) => t,
                SessionState::Handshaking(_) => return Err(NoiseError::HandshakeNotComplete),
            };

            let mut plaintext = vec![0u8; ciphertext.len()];
            let len = transport
                .read_message(ciphertext, &mut plaintext)
                .map_err(|_| NoiseError::DecryptionFailed)?;
            plaintext.truncate(len);

            Ok(plaintext)
        })
        .ok_or_else(|| NoiseError::SessionNotFound(peer_id.to_string()))?
}

/// Close a session with a peer
pub fn close_session(peer_id: &str) -> bool {
    SESSIONS.remove(peer_id).is_some()
}

/// Check if a session is established with a peer
pub fn has_session(peer_id: &str) -> bool {
    SESSIONS.with_session(peer_id, |s| s.is_transport_ready()).unwrap_or(false)
}

/// Get the remote static public key for a peer
pub fn get_remote_static_key(peer_id: &str) -> Option<Vec<u8>> {
    SESSIONS.with_session(peer_id, |s| s.remote_static_key.clone()).flatten()
}

/// List all peers with active sessions
pub fn list_sessions() -> Vec<String> {
    SESSIONS.list_peers()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_xx_handshake() {
        // This would require two separate instances, so we just test initialization
        let result = initiate_handshake("test_peer", "XX", None);
        assert!(result.is_ok());
        assert!(SESSIONS.contains("test_peer"));
        close_session("test_peer");
    }

    #[test]
    fn test_invalid_pattern() {
        let result = initiate_handshake("peer", "INVALID", None);
        assert!(matches!(result, Err(NoiseError::InvalidPattern(_))));
    }
}
