//! Nostr protocol implementation for BitChat
//!
//! Provides relay management, event handling, and encrypted messaging.

mod client;
mod error;
mod types;

pub use client::NostrClient;
pub use error::NostrError;
pub use types::*;
