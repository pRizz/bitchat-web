//! BitChat Tauri backend
//!
//! Provides Nostr protocol support with relay management,
//! encrypted messaging, and event subscriptions.

mod commands;
mod nostr;

use commands::NostrState;
use tauri::Manager;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

/// Initialize logging
fn init_logging() {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
            "bitchat=debug,nostr_sdk=info,warn".into()
        }))
        .with(tracing_subscriber::fmt::layer())
        .init();
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to BitChat.", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_logging();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(NostrState::default())
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            // Identity
            commands::nostr_init,
            commands::nostr_generate_identity,
            // Relays
            commands::nostr_connect,
            commands::nostr_disconnect,
            commands::nostr_get_relays,
            // Subscriptions
            commands::nostr_subscribe,
            commands::nostr_unsubscribe,
            // Messaging
            commands::nostr_send_private_message,
            commands::nostr_decrypt_private_message,
            commands::nostr_send_location_message,
            // Events
            commands::nostr_start_listening,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
