import { useState } from 'react';
import type { BitchatMessage } from '@/types';

interface Conversation {
  peerId: string;
  peerNickname?: string;
  messages: BitchatMessage[];
  unreadCount: number;
  lastMessageAt: number;
}

interface ConversationListProps {
  conversations: Conversation[];
  activePeerId: string | null;
  onSelect: (peerId: string) => void;
  onNewChat: (pubkey: string) => void;
}

/**
 * Format pubkey for display (truncated)
 */
function formatPubkey(pubkey: string): string {
  if (pubkey.length <= 12) return pubkey;
  return pubkey.slice(0, 8) + '...' + pubkey.slice(-4);
}

/**
 * Format relative time for conversation list
 */
function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return '';

  const now = Date.now();
  const messageTime = timestamp * 1000;
  const diff = now - messageTime;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;

  const date = new Date(messageTime);
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * New chat input modal component
 */
function NewChatModal({
  onSubmit,
  onCancel
}: {
  onSubmit: (pubkey: string) => void;
  onCancel: () => void;
}) {
  const [pubkey, setPubkey] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    const trimmed = pubkey.trim();
    if (!trimmed) {
      setError('Please enter a pubkey');
      return;
    }
    onSubmit(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className="p-4 bg-gray-700 border-b border-gray-600">
      <input
        type="text"
        value={pubkey}
        onChange={(e) => {
          setPubkey(e.target.value);
          setError('');
        }}
        onKeyDown={handleKeyDown}
        placeholder="Enter npub or hex pubkey..."
        autoFocus
        className="w-full bg-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-2"
      />
      {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
      <div className="flex space-x-2">
        <button
          onClick={handleSubmit}
          className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded text-sm transition-colors"
        >
          Start
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1 text-gray-400 hover:text-white text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * Single conversation item in the list
 */
function ConversationItem({
  conversation,
  isActive,
  onClick
}: {
  conversation: Conversation;
  isActive: boolean;
  onClick: () => void;
}) {
  const lastMessage = conversation.messages[conversation.messages.length - 1];

  return (
    <button
      onClick={onClick}
      className={`w-full p-4 text-left hover:bg-gray-700 transition-colors border-b border-gray-700/50 ${
        isActive ? 'bg-gray-700' : ''
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium truncate flex-1 mr-2">
          {conversation.peerNickname || formatPubkey(conversation.peerId)}
        </span>
        <div className="flex items-center space-x-2">
          {lastMessage && (
            <span className="text-xs text-gray-500">
              {formatRelativeTime(lastMessage.timestamp)}
            </span>
          )}
          {conversation.unreadCount > 0 && (
            <span className="bg-indigo-600 text-white text-xs px-2 py-0.5 rounded-full min-w-[20px] text-center">
              {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
            </span>
          )}
        </div>
      </div>
      {lastMessage && (
        <p className={`text-xs truncate ${
          conversation.unreadCount > 0 ? 'text-gray-300' : 'text-gray-500'
        }`}>
          {lastMessage.content}
        </p>
      )}
    </button>
  );
}

export default function ConversationList({
  conversations,
  activePeerId,
  onSelect,
  onNewChat
}: ConversationListProps) {
  const [showNewChat, setShowNewChat] = useState(false);

  const handleNewChat = (pubkey: string) => {
    onNewChat(pubkey);
    setShowNewChat(false);
  };

  return (
    <div className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
      {/* New conversation button */}
      <div className="p-4 border-b border-gray-700">
        <button
          onClick={() => setShowNewChat(true)}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors text-sm flex items-center justify-center space-x-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>New Conversation</span>
        </button>
      </div>

      {/* New chat modal */}
      {showNewChat && (
        <NewChatModal
          onSubmit={handleNewChat}
          onCancel={() => setShowNewChat(false)}
        />
      )}

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p>No conversations yet</p>
            <p className="text-xs mt-1">Start one by entering a pubkey</p>
          </div>
        ) : (
          conversations.map((conv) => (
            <ConversationItem
              key={conv.peerId}
              conversation={conv}
              isActive={activePeerId === conv.peerId}
              onClick={() => onSelect(conv.peerId)}
            />
          ))
        )}
      </div>
    </div>
  );
}
