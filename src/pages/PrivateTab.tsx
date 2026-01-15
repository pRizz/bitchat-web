import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useChatStore, useConversationList } from '@/store/useChatStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useRelayStore } from '@/store/useRelayStore';
import { privateChatService } from '@/services/PrivateChatService';
import type { BitchatMessage } from '@/types';

export default function PrivateTab() {
  const { peerId } = useParams<{ peerId?: string }>();
  const navigate = useNavigate();

  const { identity, initialize, initialized } = useSettingsStore();
  const { connect } = useRelayStore();
  const conversations = useConversationList();
  const { setActivePeer, getOrCreateConversation } = useChatStore();

  const [message, setMessage] = useState('');
  const [newChatPubkey, setNewChatPubkey] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get active conversation
  const activeConversation = peerId ? useChatStore.getState().getConversation(peerId) : undefined;

  // Initialize and start listening
  useEffect(() => {
    const init = async () => {
      if (!initialized) {
        await initialize();
        const storedRelays = useSettingsStore.getState().relays;
        await connect(storedRelays);
      }
      privateChatService.startListening();
    };
    init();

    return () => {
      privateChatService.stopListening();
    };
  }, [initialized, initialize, connect]);

  // Set active peer when route changes
  useEffect(() => {
    setActivePeer(peerId || null);
  }, [peerId, setActivePeer]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages]);

  const handleSend = async () => {
    if (!message.trim() || !peerId || sending) return;

    setSending(true);
    setError(null);

    try {
      await privateChatService.sendMessage(peerId, message.trim());
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const handleNewChat = () => {
    const pubkey = privateChatService.validatePubkey(newChatPubkey.trim());
    if (pubkey) {
      getOrCreateConversation(pubkey);
      setNewChatPubkey('');
      setShowNewChat(false);
      navigate(`/private/${pubkey}`);
    } else {
      setError('Invalid pubkey or npub');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatPubkey = (pubkey: string) => {
    return pubkey.slice(0, 8) + '...' + pubkey.slice(-4);
  };

  return (
    <div className="flex-1 flex">
      {/* Conversation List Sidebar */}
      <div className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <button
            onClick={() => setShowNewChat(true)}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors text-sm"
          >
            + New Conversation
          </button>
        </div>

        {/* New Chat Modal */}
        {showNewChat && (
          <div className="p-4 bg-gray-700 border-b border-gray-600">
            <input
              type="text"
              value={newChatPubkey}
              onChange={(e) => setNewChatPubkey(e.target.value)}
              placeholder="Enter npub or hex pubkey..."
              className="w-full bg-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-2"
            />
            <div className="flex space-x-2">
              <button
                onClick={handleNewChat}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded text-sm"
              >
                Start
              </button>
              <button
                onClick={() => setShowNewChat(false)}
                className="px-3 py-1 text-gray-400 hover:text-white text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              No conversations yet
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.peerId}
                onClick={() => navigate(`/private/${conv.peerId}`)}
                className={`w-full p-4 text-left hover:bg-gray-700 transition-colors ${
                  peerId === conv.peerId ? 'bg-gray-700' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium truncate">
                    {conv.peerNickname || formatPubkey(conv.peerId)}
                  </span>
                  {conv.unreadCount > 0 && (
                    <span className="bg-indigo-600 text-white text-xs px-2 py-0.5 rounded-full">
                      {conv.unreadCount}
                    </span>
                  )}
                </div>
                {conv.messages.length > 0 && (
                  <p className="text-xs text-gray-400 truncate mt-1">
                    {conv.messages[conv.messages.length - 1].content}
                  </p>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-14 bg-gray-800 border-b border-gray-700 flex items-center px-4">
          {peerId ? (
            <>
              <div className="flex-1">
                <h1 className="text-lg font-semibold">
                  {activeConversation?.peerNickname || formatPubkey(peerId)}
                </h1>
                <p className="text-xs text-gray-400">{formatPubkey(peerId)}</p>
              </div>
              <span className="text-xs text-green-400 flex items-center">
                <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                E2E Encrypted
              </span>
            </>
          ) : (
            <h1 className="text-lg font-semibold">Private Messages</h1>
          )}
        </header>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4">
          {!peerId ? (
            <div className="text-center text-gray-500 mt-8">
              <p className="text-lg mb-2">Select a conversation</p>
              <p className="text-sm">
                Or start a new one by entering a Nostr public key
              </p>
            </div>
          ) : activeConversation?.messages.length === 0 ? (
            <div className="text-center text-gray-500 mt-8">
              <p className="text-lg mb-2">No messages yet</p>
              <p className="text-sm">
                Send a message to start the conversation
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {activeConversation?.messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isOwn={msg.senderPubkey === identity?.publicKeyHex}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Error display */}
        {error && (
          <div className="px-4 py-2 bg-red-900/50 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Message input */}
        {peerId && (
          <div className="p-4 bg-gray-800 border-t border-gray-700">
            <div className="flex space-x-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type a message..."
                disabled={sending}
                className="flex-1 bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={!message.trim() || sending}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors"
              >
                {sending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Message bubble component
function MessageBubble({
  message,
  isOwn,
}: {
  message: BitchatMessage;
  isOwn: boolean;
}) {
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[70%] rounded-lg px-4 py-2 ${
          isOwn
            ? 'bg-indigo-600 text-white'
            : 'bg-gray-700 text-white'
        }`}
      >
        {!isOwn && message.senderNickname && (
          <p className="text-xs text-gray-300 mb-1">{message.senderNickname}</p>
        )}
        <p className="break-words">{message.content}</p>
        <div className={`flex items-center justify-end mt-1 space-x-1 ${
          isOwn ? 'text-indigo-200' : 'text-gray-400'
        }`}>
          <span className="text-xs">{formatTime(message.timestamp)}</span>
          {message.encrypted && (
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}
