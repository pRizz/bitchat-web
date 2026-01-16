//! Tauri commands for Nostr operations

use std::sync::Arc;

use parking_lot::RwLock;
use tauri::State;

use crate::nostr::{
    DecryptedMessage, EventData, IdentityInfo, NostrClient, NostrError, RelayInfo,
    SubscriptionFilter,
};

/// Global Nostr client state
pub struct NostrState(pub Arc<RwLock<NostrClient>>);

impl Default for NostrState {
    fn default() -> Self {
        Self(Arc::new(RwLock::new(NostrClient::new())))
    }
}

// =============================================================================
// Identity Commands
// =============================================================================

/// Initialize with existing secret key
#[tauri::command]
pub async fn nostr_init(
    state: State<'_, NostrState>,
    secret_key: String,
) -> Result<IdentityInfo, NostrError> {
    let mut client = state.0.write();
    client.initialize(&secret_key).await
}

/// Generate a new identity
#[tauri::command]
pub async fn nostr_generate_identity(
    state: State<'_, NostrState>,
) -> Result<(IdentityInfo, String), NostrError> {
    let mut client = state.0.write();
    client.generate_identity().await
}

// =============================================================================
// Relay Commands
// =============================================================================

/// Connect to relays
#[tauri::command]
pub async fn nostr_connect(
    state: State<'_, NostrState>,
    relay_urls: Vec<String>,
) -> Result<(), NostrError> {
    let client = state.0.read();
    client.connect(relay_urls).await
}

/// Disconnect from all relays
#[tauri::command]
pub async fn nostr_disconnect(state: State<'_, NostrState>) -> Result<(), NostrError> {
    let client = state.0.read();
    client.disconnect().await
}

/// Get relay info
#[tauri::command]
pub fn nostr_get_relays(state: State<'_, NostrState>) -> Vec<RelayInfo> {
    let client = state.0.read();
    client.get_relays()
}

// =============================================================================
// Subscription Commands
// =============================================================================

/// Subscribe to events
#[tauri::command]
pub async fn nostr_subscribe(
    state: State<'_, NostrState>,
    filters: Vec<SubscriptionFilter>,
) -> Result<String, NostrError> {
    let client = state.0.read();
    client.subscribe(filters).await
}

/// Unsubscribe
#[tauri::command]
pub async fn nostr_unsubscribe(
    state: State<'_, NostrState>,
    sub_id: String,
) -> Result<(), NostrError> {
    let client = state.0.read();
    client.unsubscribe(&sub_id).await
}

// =============================================================================
// Messaging Commands
// =============================================================================

/// Send a private message (NIP-17 gift-wrapped)
#[tauri::command]
pub async fn nostr_send_private_message(
    state: State<'_, NostrState>,
    recipient_pubkey: String,
    content: String,
) -> Result<String, NostrError> {
    let client = state.0.read();
    client.send_private_message(&recipient_pubkey, &content).await
}

/// Decrypt a received private message
#[tauri::command]
pub async fn nostr_decrypt_private_message(
    state: State<'_, NostrState>,
    event: EventData,
) -> Result<DecryptedMessage, NostrError> {
    let client = state.0.read();
    client.decrypt_private_message(&event).await
}

/// Send a location-based message (ephemeral, geohash-tagged)
#[tauri::command]
pub async fn nostr_send_location_message(
    state: State<'_, NostrState>,
    content: String,
    geohash: String,
    nickname: Option<String>,
) -> Result<String, NostrError> {
    let client = state.0.read();
    client
        .send_location_message(&content, &geohash, nickname.as_deref())
        .await
}

// =============================================================================
// Event Listener Commands
// =============================================================================

/// Start listening for events
#[tauri::command]
pub async fn nostr_start_listening(state: State<'_, NostrState>) -> Result<(), NostrError> {
    let client = state.0.read();
    client.start_listening().await
}
