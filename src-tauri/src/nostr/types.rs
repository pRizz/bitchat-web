//! Nostr types for frontend communication

use serde::{Deserialize, Serialize};

/// Relay connection status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RelayStatus {
    Connecting,
    Connected,
    Disconnected,
    Error,
}

/// Relay information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelayInfo {
    pub url: String,
    pub status: RelayStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Nostr event data for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventData {
    pub id: String,
    pub pubkey: String,
    pub created_at: u64,
    pub kind: u16,
    pub tags: Vec<Vec<String>>,
    pub content: String,
    pub sig: String,
}

/// Decrypted private message
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecryptedMessage {
    pub content: String,
    pub sender_pubkey: String,
    pub timestamp: u64,
}

/// Subscription filter
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SubscriptionFilter {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ids: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub authors: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kinds: Option<Vec<u16>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub since: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub until: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<usize>,
    /// Geohash tag filter
    #[serde(rename = "#g", skip_serializing_if = "Option::is_none")]
    pub geohash: Option<Vec<String>>,
    /// Pubkey tag filter
    #[serde(rename = "#p", skip_serializing_if = "Option::is_none")]
    pub pubkey_tags: Option<Vec<String>>,
}

/// Identity information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdentityInfo {
    pub public_key_hex: String,
    pub npub: String,
}

impl From<nostr::Event> for EventData {
    fn from(event: nostr::Event) -> Self {
        Self {
            id: event.id.to_hex(),
            pubkey: event.pubkey.to_hex(),
            created_at: event.created_at.as_u64(),
            kind: event.kind.as_u16(),
            tags: event
                .tags
                .iter()
                .map(|t| t.as_slice().iter().map(|s| s.to_string()).collect())
                .collect(),
            content: event.content.clone(),
            sig: event.sig.to_string(),
        }
    }
}

impl TryFrom<&SubscriptionFilter> for nostr::Filter {
    type Error = super::NostrError;

    fn try_from(filter: &SubscriptionFilter) -> Result<Self, Self::Error> {
        let mut f = nostr::Filter::new();

        if let Some(ids) = &filter.ids {
            for id in ids {
                if let Ok(event_id) = nostr::EventId::from_hex(id) {
                    f = f.id(event_id);
                }
            }
        }

        if let Some(authors) = &filter.authors {
            for author in authors {
                if let Ok(pubkey) = nostr::PublicKey::from_hex(author) {
                    f = f.author(pubkey);
                }
            }
        }

        if let Some(kinds) = &filter.kinds {
            for kind in kinds {
                f = f.kind(nostr::Kind::from(*kind));
            }
        }

        if let Some(since) = filter.since {
            f = f.since(nostr::Timestamp::from(since));
        }

        if let Some(until) = filter.until {
            f = f.until(nostr::Timestamp::from(until));
        }

        if let Some(limit) = filter.limit {
            f = f.limit(limit);
        }

        if let Some(geohashes) = &filter.geohash {
            for g in geohashes {
                f = f.custom_tag(nostr::SingleLetterTag::lowercase(nostr::Alphabet::G), vec![g.clone()]);
            }
        }

        if let Some(pubkeys) = &filter.pubkey_tags {
            for p in pubkeys {
                if let Ok(pubkey) = nostr::PublicKey::from_hex(p) {
                    f = f.pubkey(pubkey);
                }
            }
        }

        Ok(f)
    }
}
