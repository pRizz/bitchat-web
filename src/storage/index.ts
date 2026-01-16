/**
 * Storage module index
 *
 * Exports all storage functionality:
 * - Database: Core IndexedDB operations
 * - MessageStore: Message/conversation persistence
 * - IdentityStore: Identity and peer management
 * - StorageManager: Quota and migration management
 */

// Database exports
export {
  getDatabase,
  closeDatabase,
  deleteDatabase,
  getStorageEstimate,
  requestPersistentStorage,
  isStoragePersistent,
  type StoredMessage,
  type StoredConversation,
  type StoredPeer,
  type StoredSettings,
  type StorageMetadata,
} from './Database';

// Message store exports
export {
  storeMessage,
  storeMessages,
  getMessages,
  getConversations,
  getConversation,
  updateUnreadCount,
  incrementUnread,
  markAsRead,
  updateConversationNickname,
  deleteConversation,
  deleteMessage,
  pruneMessages,
  getMessageCount,
  getTotalMessageCount,
  clearAllMessages,
} from './MessageStore';

// Identity store exports
export {
  initializeIdentity,
  hasIdentity,
  importIdentity,
  exportIdentity,
  deleteIdentity,
  storePeer,
  getPeer,
  getAllPeers,
  getRecentPeers,
  trustPeer,
  setPeerNotes,
  setPeerNickname,
  deletePeer,
  clearAllPeers,
  setSetting,
  getSetting,
  getSettingWithDefault,
  deleteSetting,
  getAllSettings,
  clearAllSettings,
  encryptForStorage,
  decryptFromStorage,
  setEncryptedSetting,
  getEncryptedSetting,
} from './IdentityStore';

// Storage manager exports
export {
  StorageManager,
  initializeStorage,
  runMigrations,
  manageQuota,
  wipeAllData,
  getStorageStats,
} from './StorageManager';
