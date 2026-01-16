import type { BitchatMessage } from '@/types';

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

interface MessageBubbleProps {
  message: BitchatMessage;
  isOwn: boolean;
  status?: MessageStatus;
}

/**
 * Format timestamp for display
 * Shows time for today, date+time for older messages
 */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Show date for older messages
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isYesterday) {
    return `Yesterday ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Message status icon component
 */
function StatusIcon({ status }: { status: MessageStatus }) {
  switch (status) {
    case 'sending':
      return (
        <svg className="w-3 h-3 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" fill="none" />
        </svg>
      );
    case 'sent':
      // Single checkmark
      return (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 20 20">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l4 4 6-8" />
        </svg>
      );
    case 'delivered':
      // Double checkmark
      return (
        <svg className="w-4 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 20">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 10l4 4 6-8" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10l4 4 6-8" />
        </svg>
      );
    case 'read':
      // Double checkmark filled/blue
      return (
        <svg className="w-4 h-3 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 20">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 10l4 4 6-8" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10l4 4 6-8" />
        </svg>
      );
    case 'failed':
      return (
        <svg className="w-3 h-3 text-red-400" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      );
    default:
      return null;
  }
}

/**
 * Encryption indicator icon
 */
function EncryptionIcon({ encrypted, verified }: { encrypted: boolean; verified: boolean }) {
  if (!encrypted) return null;

  return (
    <svg
      className={`w-3 h-3 ${verified ? 'text-green-400' : ''}`}
      fill="currentColor"
      viewBox="0 0 20 20"
      aria-label={verified ? 'Verified & Encrypted' : 'Encrypted'}
    >
      <title>{verified ? 'Verified & Encrypted' : 'Encrypted'}</title>
      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
    </svg>
  );
}

export default function MessageBubble({ message, isOwn, status = 'sent' }: MessageBubbleProps) {
  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[70%] rounded-lg px-4 py-2 ${
          isOwn
            ? 'bg-indigo-600 text-white'
            : 'bg-gray-700 text-white'
        }`}
      >
        {/* Sender nickname for received messages */}
        {!isOwn && message.senderNickname && (
          <p className="text-xs text-indigo-300 font-medium mb-1">
            {message.senderNickname}
          </p>
        )}

        {/* Message content */}
        <p className="break-words whitespace-pre-wrap">{message.content}</p>

        {/* Footer: timestamp, encryption, and status */}
        <div className={`flex items-center justify-end mt-1 space-x-1 text-xs ${
          isOwn ? 'text-indigo-200' : 'text-gray-400'
        }`}>
          <span>{formatTimestamp(message.timestamp)}</span>
          <EncryptionIcon encrypted={message.encrypted} verified={message.verified} />
          {isOwn && <StatusIcon status={status} />}
        </div>
      </div>
    </div>
  );
}
