import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useChatStore, useConversationList } from '@/store/useChatStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useRelayStore } from '@/store/useRelayStore';
import { privateChatService } from '@/services/PrivateChatService';
import {
  MessageBubble,
  MessageInput,
  TypingIndicator,
  ConversationList,
  ChatHeader
} from '@/components/chat';

export default function PrivateTab() {
  const { peerId } = useParams<{ peerId?: string }>();
  const navigate = useNavigate();

  const { identity, initialize, initialized } = useSettingsStore();
  const { connect } = useRelayStore();
  const conversations = useConversationList();
  const { setActivePeer, getOrCreateConversation } = useChatStore();

  const [error, setError] = useState<string | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);

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
    setPeerTyping(false); // Reset typing indicator on peer change
  }, [peerId, setActivePeer]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages]);

  const handleSend = async (message: string) => {
    if (!peerId) return;

    setError(null);

    try {
      await privateChatService.sendMessage(peerId, message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
      throw err; // Re-throw so MessageInput knows it failed
    }
  };

  const handleNewChat = (pubkey: string) => {
    const validPubkey = privateChatService.validatePubkey(pubkey);
    if (validPubkey) {
      getOrCreateConversation(validPubkey);
      navigate(`/private/${validPubkey}`);
    } else {
      setError('Invalid pubkey or npub');
    }
  };

  const handleSelectConversation = (selectedPeerId: string) => {
    navigate(`/private/${selectedPeerId}`);
  };

  const handleTypingChange = (_isTyping: boolean) => {
    // TODO: Send typing indicator to peer when NIP-XX is implemented
  };

  return (
    <div className="flex-1 flex">
      {/* Conversation List Sidebar */}
      <ConversationList
        conversations={conversations}
        activePeerId={peerId || null}
        onSelect={handleSelectConversation}
        onNewChat={handleNewChat}
      />

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <ChatHeader
          peerId={peerId || null}
          peerNickname={activeConversation?.peerNickname}
          encryptionStatus="secured"
          isTyping={peerTyping}
        />

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4">
          {!peerId ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p className="text-lg mb-2">Select a conversation</p>
              <p className="text-sm">
                Or start a new one by entering a Nostr public key
              </p>
            </div>
          ) : activeConversation?.messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <p className="text-lg mb-2">No messages yet</p>
              <p className="text-sm">
                Send a message to start the conversation
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeConversation?.messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isOwn={msg.senderPubkey === identity?.publicKeyHex}
                  status="sent"
                />
              ))}
              {peerTyping && (
                <TypingIndicator peerName={activeConversation?.peerNickname} />
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Error display */}
        {error && (
          <div className="px-4 py-2 bg-red-900/50 text-red-300 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Message input */}
        {peerId && (
          <MessageInput
            onSend={handleSend}
            onTypingChange={handleTypingChange}
          />
        )}
      </div>
    </div>
  );
}
