//! Nostr error types

use thiserror::Error;

#[derive(Error, Debug)]
pub enum NostrError {
    #[error("Not connected to any relays")]
    NotConnected,

    #[error("Invalid public key: {0}")]
    InvalidPublicKey(String),

    #[error("Invalid private key")]
    InvalidPrivateKey,

    #[error("Encryption failed: {0}")]
    EncryptionFailed(String),

    #[error("Decryption failed: {0}")]
    DecryptionFailed(String),

    #[error("Relay error: {0}")]
    RelayError(String),

    #[error("Client not initialized")]
    NotInitialized,

    #[error("SDK error: {0}")]
    SdkError(String),
}

impl From<nostr_sdk::client::Error> for NostrError {
    fn from(err: nostr_sdk::client::Error) -> Self {
        NostrError::SdkError(err.to_string())
    }
}

impl From<nostr::key::Error> for NostrError {
    fn from(err: nostr::key::Error) -> Self {
        NostrError::InvalidPrivateKey
    }
}

impl serde::Serialize for NostrError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
