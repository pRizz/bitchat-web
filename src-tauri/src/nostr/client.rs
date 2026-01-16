//! Nostr client implementation

use std::collections::HashMap;
use std::sync::Arc;

use nostr::nips::nip17;
use nostr::{Event, Keys, Kind, PublicKey, SecretKey, Tag, Timestamp};
use nostr_sdk::{Client, Options, RelayPoolNotification};
use parking_lot::RwLock;
use tokio::sync::mpsc;
use tracing::{debug, error, info, warn};

use super::error::NostrError;
use super::types::*;

/// Callback type for relay status changes
pub type RelayStatusCallback = Box<dyn Fn(String, RelayStatus) + Send + Sync>;

/// Callback type for received events
pub type EventCallback = Box<dyn Fn(EventData) + Send + Sync>;

/// Nostr client wrapper with managed state
pub struct NostrClient {
    client: Option<Client>,
    keys: Option<Keys>,
    relays: Arc<RwLock<HashMap<String, RelayInfo>>>,
    on_relay_status: Arc<RwLock<Option<RelayStatusCallback>>>,
    on_event: Arc<RwLock<Option<EventCallback>>>,
}

impl NostrClient {
    /// Create a new Nostr client
    pub fn new() -> Self {
        Self {
            client: None,
            keys: None,
            relays: Arc::new(RwLock::new(HashMap::new())),
            on_relay_status: Arc::new(RwLock::new(None)),
            on_event: Arc::new(RwLock::new(None)),
        }
    }

    /// Initialize with a secret key (hex or nsec)
    pub async fn initialize(&mut self, secret_key: &str) -> Result<IdentityInfo, NostrError> {
        let keys = if secret_key.starts_with("nsec") {
            Keys::parse(secret_key).map_err(|_| NostrError::InvalidPrivateKey)?
        } else {
            let sk = SecretKey::from_hex(secret_key).map_err(|_| NostrError::InvalidPrivateKey)?;
            Keys::new(sk)
        };

        let opts = Options::new()
            .wait_for_send(true)
            .connection_timeout(Some(std::time::Duration::from_secs(10)));

        let client = Client::with_opts(&keys, opts);

        let identity = IdentityInfo {
            public_key_hex: keys.public_key().to_hex(),
            npub: keys.public_key().to_bech32().unwrap_or_default(),
        };

        self.keys = Some(keys);
        self.client = Some(client);

        info!("Nostr client initialized with pubkey: {}", identity.public_key_hex);
        Ok(identity)
    }

    /// Generate a new identity
    pub async fn generate_identity(&mut self) -> Result<(IdentityInfo, String), NostrError> {
        let keys = Keys::generate();
        let nsec = keys.secret_key().to_bech32().unwrap_or_default();

        let opts = Options::new()
            .wait_for_send(true)
            .connection_timeout(Some(std::time::Duration::from_secs(10)));

        let client = Client::with_opts(&keys, opts);

        let identity = IdentityInfo {
            public_key_hex: keys.public_key().to_hex(),
            npub: keys.public_key().to_bech32().unwrap_or_default(),
        };

        self.keys = Some(keys);
        self.client = Some(client);

        info!("Generated new identity: {}", identity.public_key_hex);
        Ok((identity, nsec))
    }

    /// Connect to relays
    pub async fn connect(&self, relay_urls: Vec<String>) -> Result<(), NostrError> {
        let client = self.client.as_ref().ok_or(NostrError::NotInitialized)?;

        for url in &relay_urls {
            {
                let mut relays = self.relays.write();
                relays.insert(
                    url.clone(),
                    RelayInfo {
                        url: url.clone(),
                        status: RelayStatus::Connecting,
                        error: None,
                    },
                );
            }
            self.notify_relay_status(url.clone(), RelayStatus::Connecting);
        }

        // Add relays to client
        for url in &relay_urls {
            if let Err(e) = client.add_relay(url).await {
                warn!("Failed to add relay {}: {}", url, e);
                let mut relays = self.relays.write();
                if let Some(info) = relays.get_mut(url) {
                    info.status = RelayStatus::Error;
                    info.error = Some(e.to_string());
                }
                self.notify_relay_status(url.clone(), RelayStatus::Error);
            }
        }

        // Connect
        client.connect().await;

        // Update status for connected relays
        for url in &relay_urls {
            let mut relays = self.relays.write();
            if let Some(info) = relays.get_mut(url) {
                if info.status == RelayStatus::Connecting {
                    info.status = RelayStatus::Connected;
                    self.notify_relay_status(url.clone(), RelayStatus::Connected);
                }
            }
        }

        info!("Connected to {} relays", relay_urls.len());
        Ok(())
    }

    /// Disconnect from all relays
    pub async fn disconnect(&self) -> Result<(), NostrError> {
        let client = self.client.as_ref().ok_or(NostrError::NotInitialized)?;
        client.disconnect().await?;

        let mut relays = self.relays.write();
        for (url, info) in relays.iter_mut() {
            info.status = RelayStatus::Disconnected;
            self.notify_relay_status(url.clone(), RelayStatus::Disconnected);
        }

        info!("Disconnected from all relays");
        Ok(())
    }

    /// Get relay info
    pub fn get_relays(&self) -> Vec<RelayInfo> {
        self.relays.read().values().cloned().collect()
    }

    /// Subscribe to events
    pub async fn subscribe(&self, filters: Vec<SubscriptionFilter>) -> Result<String, NostrError> {
        let client = self.client.as_ref().ok_or(NostrError::NotInitialized)?;

        let nostr_filters: Vec<nostr::Filter> = filters
            .iter()
            .filter_map(|f| f.try_into().ok())
            .collect();

        if nostr_filters.is_empty() {
            return Err(NostrError::RelayError("No valid filters".into()));
        }

        let sub_id = client.subscribe(nostr_filters, None).await?;
        debug!("Created subscription: {:?}", sub_id);

        Ok(sub_id.to_string())
    }

    /// Unsubscribe
    pub async fn unsubscribe(&self, sub_id: &str) -> Result<(), NostrError> {
        let client = self.client.as_ref().ok_or(NostrError::NotInitialized)?;

        let id = nostr::SubscriptionId::new(sub_id);
        client.unsubscribe(id).await;

        debug!("Unsubscribed: {}", sub_id);
        Ok(())
    }

    /// Publish an event
    pub async fn publish(&self, event: Event) -> Result<String, NostrError> {
        let client = self.client.as_ref().ok_or(NostrError::NotInitialized)?;

        let output = client.send_event(event.clone()).await?;
        info!("Published event: {}", event.id);

        Ok(event.id.to_hex())
    }

    /// Send a NIP-17 encrypted private message
    pub async fn send_private_message(
        &self,
        recipient_pubkey: &str,
        content: &str,
    ) -> Result<String, NostrError> {
        let client = self.client.as_ref().ok_or(NostrError::NotInitialized)?;
        let keys = self.keys.as_ref().ok_or(NostrError::NotInitialized)?;

        let recipient = PublicKey::from_hex(recipient_pubkey)
            .map_err(|_| NostrError::InvalidPublicKey(recipient_pubkey.into()))?;

        // Create and send gift-wrapped private message (NIP-17)
        let output = client
            .send_private_msg(recipient, content, None)
            .await
            .map_err(|e| NostrError::EncryptionFailed(e.to_string()))?;

        info!("Sent private message to {}", recipient_pubkey);
        Ok(output.id().to_hex())
    }

    /// Decrypt a received NIP-17 gift-wrapped message
    pub async fn decrypt_private_message(
        &self,
        event: &EventData,
    ) -> Result<DecryptedMessage, NostrError> {
        let keys = self.keys.as_ref().ok_or(NostrError::NotInitialized)?;

        // Parse the event
        let nostr_event = Event::from_json(serde_json::to_string(event).unwrap())
            .map_err(|e| NostrError::DecryptionFailed(e.to_string()))?;

        // Unwrap gift wrap (NIP-17)
        let unwrapped = nip17::extract_rumor(keys.secret_key(), &nostr_event)
            .map_err(|e| NostrError::DecryptionFailed(e.to_string()))?;

        Ok(DecryptedMessage {
            content: unwrapped.rumor.content.clone(),
            sender_pubkey: unwrapped.rumor.pubkey.to_hex(),
            timestamp: unwrapped.rumor.created_at.as_u64(),
        })
    }

    /// Create and publish an ephemeral geohash event (kind 20000)
    pub async fn send_location_message(
        &self,
        content: &str,
        geohash: &str,
        nickname: Option<&str>,
    ) -> Result<String, NostrError> {
        let client = self.client.as_ref().ok_or(NostrError::NotInitialized)?;
        let keys = self.keys.as_ref().ok_or(NostrError::NotInitialized)?;

        let mut tags = vec![Tag::custom(
            nostr::TagKind::SingleLetter(nostr::SingleLetterTag::lowercase(nostr::Alphabet::G)),
            vec![geohash.to_string()],
        )];

        if let Some(n) = nickname {
            tags.push(Tag::custom(
                nostr::TagKind::SingleLetter(nostr::SingleLetterTag::lowercase(nostr::Alphabet::N)),
                vec![n.to_string()],
            ));
        }

        let event = nostr::EventBuilder::new(Kind::from(20000), content)
            .tags(tags)
            .sign_with_keys(keys)
            .map_err(|e| NostrError::SdkError(e.to_string()))?;

        let output = client.send_event(event.clone()).await?;
        info!("Sent location message to geohash {}", geohash);

        Ok(event.id.to_hex())
    }

    /// Set relay status callback
    pub fn set_relay_status_callback(&self, callback: RelayStatusCallback) {
        let mut cb = self.on_relay_status.write();
        *cb = Some(callback);
    }

    /// Set event callback
    pub fn set_event_callback(&self, callback: EventCallback) {
        let mut cb = self.on_event.write();
        *cb = Some(callback);
    }

    fn notify_relay_status(&self, url: String, status: RelayStatus) {
        if let Some(cb) = self.on_relay_status.read().as_ref() {
            cb(url, status);
        }
    }

    fn notify_event(&self, event: EventData) {
        if let Some(cb) = self.on_event.read().as_ref() {
            cb(event);
        }
    }

    /// Start listening for events (runs in background)
    pub async fn start_listening(&self) -> Result<(), NostrError> {
        let client = self.client.as_ref().ok_or(NostrError::NotInitialized)?;

        let on_event = self.on_event.clone();

        // Handle notifications in background
        let mut notifications = client.notifications();

        tokio::spawn(async move {
            while let Ok(notification) = notifications.recv().await {
                if let RelayPoolNotification::Event { event, .. } = notification {
                    let event_data = EventData::from(*event);
                    if let Some(cb) = on_event.read().as_ref() {
                        cb(event_data);
                    }
                }
            }
        });

        debug!("Started event listener");
        Ok(())
    }
}

impl Default for NostrClient {
    fn default() -> Self {
        Self::new()
    }
}
