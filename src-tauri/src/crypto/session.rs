//! Session management for Noise Protocol connections.
//!
//! Manages the lifecycle of encrypted sessions with peers,
//! including handshake state and transport state.

use parking_lot::RwLock;
use snow::{HandshakeState, TransportState};
use std::collections::HashMap;
use std::sync::Arc;

/// Session state enum representing the lifecycle of a Noise session
pub enum SessionState {
    /// Handshake in progress
    Handshaking(HandshakeState),
    /// Transport established, ready for encrypted communication
    Transport(TransportState),
}

/// A single session with a peer
pub struct Session {
    pub peer_id: String,
    pub pattern: String,
    pub is_initiator: bool,
    pub state: SessionState,
    pub remote_static_key: Option<Vec<u8>>,
}

impl Session {
    /// Check if handshake is complete
    pub fn is_transport_ready(&self) -> bool {
        matches!(self.state, SessionState::Transport(_))
    }

    /// Get the remote static public key (available after handshake)
    pub fn get_remote_static(&self) -> Option<&[u8]> {
        self.remote_static_key.as_deref()
    }
}

/// Thread-safe session manager
pub struct SessionManager {
    sessions: RwLock<HashMap<String, Session>>,
}

impl SessionManager {
    /// Create a new session manager
    pub fn new() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
        }
    }

    /// Store a new session
    pub fn insert(&self, peer_id: String, session: Session) {
        self.sessions.write().insert(peer_id, session);
    }

    /// Get a mutable reference to a session for modification
    pub fn with_session_mut<F, R>(&self, peer_id: &str, f: F) -> Option<R>
    where
        F: FnOnce(&mut Session) -> R,
    {
        self.sessions.write().get_mut(peer_id).map(f)
    }

    /// Get a reference to a session for reading
    pub fn with_session<F, R>(&self, peer_id: &str, f: F) -> Option<R>
    where
        F: FnOnce(&Session) -> R,
    {
        self.sessions.read().get(peer_id).map(f)
    }

    /// Remove a session
    pub fn remove(&self, peer_id: &str) -> Option<Session> {
        self.sessions.write().remove(peer_id)
    }

    /// Check if a session exists
    pub fn contains(&self, peer_id: &str) -> bool {
        self.sessions.read().contains_key(peer_id)
    }

    /// Get list of all peer IDs with active sessions
    pub fn list_peers(&self) -> Vec<String> {
        self.sessions.read().keys().cloned().collect()
    }

    /// Clear all sessions
    pub fn clear(&self) {
        self.sessions.write().clear();
    }
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Global session manager instance
lazy_static::lazy_static! {
    pub static ref SESSIONS: Arc<SessionManager> = Arc::new(SessionManager::new());
}
