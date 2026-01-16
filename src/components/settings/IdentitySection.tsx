import type { NostrIdentity } from '@/types';

interface IdentitySectionProps {
  identity: NostrIdentity | null;
  nickname: string;
  onNicknameChange: (nickname: string) => void;
  onExport: () => void;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-2 text-gray-400 hover:text-white transition-colors"
      title={`Copy ${label}`}
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    </button>
  );
}

export default function IdentitySection({
  identity,
  nickname,
  onNicknameChange,
  onExport,
}: IdentitySectionProps) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">Identity</h2>

      <div className="space-y-4">
        {/* Nickname */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">Nickname</label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => onNicknameChange(e.target.value)}
            placeholder="Enter a nickname..."
            className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            maxLength={32}
          />
          <p className="text-xs text-gray-500 mt-1">
            Displayed to other users when you send messages
          </p>
        </div>

        {/* Public Key (hex) */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">Public Key (hex)</label>
          <div className="flex items-center space-x-2">
            <code className="flex-1 bg-gray-800 p-3 rounded-lg text-xs text-gray-300 break-all font-mono">
              {identity?.publicKeyHex || 'Loading...'}
            </code>
            {identity && (
              <CopyButton text={identity.publicKeyHex} label="public key" />
            )}
          </div>
        </div>

        {/* Nostr Address (npub) */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">Nostr Address (npub)</label>
          <div className="flex items-center space-x-2">
            <code className="flex-1 bg-gray-800 p-3 rounded-lg text-xs text-gray-300 break-all font-mono">
              {identity?.npub || 'Loading...'}
            </code>
            {identity && (
              <CopyButton text={identity.npub} label="npub" />
            )}
          </div>
        </div>

        {/* Export button */}
        <button
          onClick={onExport}
          className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors text-sm flex items-center space-x-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          <span>Export Keys (Backup)</span>
        </button>
      </div>
    </section>
  );
}
