import type { EncryptionStatus } from '@/types';

interface ChatHeaderProps {
  peerId: string | null;
  peerNickname?: string;
  encryptionStatus?: EncryptionStatus;
  isTyping?: boolean;
  onBackClick?: () => void;
  title?: string;
}

/**
 * Format pubkey for display (truncated)
 */
function formatPubkey(pubkey: string): string {
  if (pubkey.length <= 12) return pubkey;
  return pubkey.slice(0, 8) + '...' + pubkey.slice(-4);
}

/**
 * Encryption status badge component
 */
function EncryptionBadge({ status }: { status: EncryptionStatus }) {
  const config = {
    none: { text: 'Not Encrypted', color: 'text-gray-400', icon: null },
    handshaking: { text: 'Establishing...', color: 'text-yellow-400', icon: 'spinner' },
    secured: { text: 'E2E Encrypted', color: 'text-green-400', icon: 'lock' },
    verified: { text: 'Verified', color: 'text-green-400', icon: 'shield' },
  }[status];

  return (
    <span className={`text-xs ${config.color} flex items-center`}>
      {config.icon === 'spinner' && (
        <svg className="w-3 h-3 mr-1 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {config.icon === 'lock' && (
        <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
        </svg>
      )}
      {config.icon === 'shield' && (
        <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      )}
      {config.text}
    </span>
  );
}

export default function ChatHeader({
  peerId,
  peerNickname,
  encryptionStatus = 'secured',
  isTyping = false,
  onBackClick,
  title = 'Private Messages'
}: ChatHeaderProps) {
  // No active peer - show default header
  if (!peerId) {
    return (
      <header className="h-14 bg-gray-800 border-b border-gray-700 flex items-center px-4">
        <h1 className="text-lg font-semibold">{title}</h1>
      </header>
    );
  }

  // Active peer header
  return (
    <header className="h-14 bg-gray-800 border-b border-gray-700 flex items-center px-4">
      {/* Back button (mobile) */}
      {onBackClick && (
        <button
          onClick={onBackClick}
          className="mr-3 p-1 text-gray-400 hover:text-white transition-colors md:hidden"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* Peer info */}
      <div className="flex-1 min-w-0">
        <h1 className="text-lg font-semibold truncate">
          {peerNickname || formatPubkey(peerId)}
        </h1>
        <div className="flex items-center space-x-2">
          {isTyping ? (
            <span className="text-xs text-indigo-400 flex items-center">
              <span className="flex space-x-0.5 mr-1">
                <span className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
              typing...
            </span>
          ) : (
            <p className="text-xs text-gray-400 truncate">{formatPubkey(peerId)}</p>
          )}
        </div>
      </div>

      {/* Encryption status */}
      <EncryptionBadge status={encryptionStatus} />
    </header>
  );
}
