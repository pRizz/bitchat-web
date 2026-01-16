//! BitChat Tauri application library.
//!
//! Provides native functionality including Noise Protocol encryption.

use tauri::Manager;

mod crypto;

// Re-export crypto types for potential use
pub use crypto::noise;

/// Tauri command: Get local Noise public key
#[tauri::command]
fn noise_get_public_key() -> Vec<u8> {
    crypto::get_local_public_key()
}

/// Tauri command: Initiate a Noise handshake with a peer
///
/// # Arguments
/// * `peer_id` - Unique identifier for the peer
/// * `pattern` - Noise pattern: "XX", "IK", or "NK"
/// * `remote_static` - Remote static key (required for IK/NK patterns)
#[tauri::command]
async fn noise_initiate_handshake(
    peer_id: String,
    pattern: String,
    remote_static: Option<Vec<u8>>,
) -> Result<Vec<u8>, String> {
    crypto::initiate_handshake(&peer_id, &pattern, remote_static.as_deref())
        .map_err(|e| e.to_string())
}

/// Tauri command: Respond to a Noise handshake from a peer
///
/// # Arguments
/// * `peer_id` - Unique identifier for the peer
/// * `pattern` - Noise pattern: "XX", "IK", or "NK"
/// * `message` - The handshake message from the initiator
#[tauri::command]
async fn noise_respond_handshake(
    peer_id: String,
    pattern: String,
    message: Vec<u8>,
) -> Result<Vec<u8>, String> {
    crypto::respond_handshake(&peer_id, &pattern, &message)
        .map_err(|e| e.to_string())
}

/// Tauri command: Continue a Noise handshake
///
/// # Arguments
/// * `peer_id` - Unique identifier for the peer
/// * `message` - The handshake message from the peer
///
/// # Returns
/// * `Some(message)` - Response message to send
/// * `None` - Handshake complete, no response needed
#[tauri::command]
async fn noise_continue_handshake(
    peer_id: String,
    message: Vec<u8>,
) -> Result<Option<Vec<u8>>, String> {
    crypto::continue_handshake(&peer_id, &message)
        .map_err(|e| e.to_string())
}

/// Tauri command: Encrypt a message for a peer
///
/// Requires an established Noise session (handshake complete).
#[tauri::command]
async fn noise_encrypt(peer_id: String, plaintext: Vec<u8>) -> Result<Vec<u8>, String> {
    crypto::encrypt(&peer_id, &plaintext)
        .map_err(|e| e.to_string())
}

/// Tauri command: Decrypt a message from a peer
///
/// Requires an established Noise session (handshake complete).
#[tauri::command]
async fn noise_decrypt(peer_id: String, ciphertext: Vec<u8>) -> Result<Vec<u8>, String> {
    crypto::decrypt(&peer_id, &ciphertext)
        .map_err(|e| e.to_string())
}

/// Tauri command: Close a session with a peer
#[tauri::command]
async fn noise_close_session(peer_id: String) -> bool {
    crypto::close_session(&peer_id)
}

/// Tauri command: Check if a session exists with a peer
#[tauri::command]
fn noise_has_session(peer_id: String) -> bool {
    crypto::has_session(&peer_id)
}

/// Tauri command: Get the remote static key for a peer
#[tauri::command]
fn noise_get_remote_static(peer_id: String) -> Option<Vec<u8>> {
    crypto::get_remote_static_key(&peer_id)
}

/// Tauri command: List all peers with active sessions
#[tauri::command]
fn noise_list_sessions() -> Vec<String> {
    crypto::list_sessions()
}

/// Tauri command: Basic greeting (for testing)
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to BitChat.", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
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
            noise_get_public_key,
            noise_initiate_handshake,
            noise_respond_handshake,
            noise_continue_handshake,
            noise_encrypt,
            noise_decrypt,
            noise_close_session,
            noise_has_session,
            noise_get_remote_static,
            noise_list_sessions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
