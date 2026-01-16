import { useState } from 'react';
import type { NostrRelay } from '@/types';

interface RelayManagerProps {
  relays: NostrRelay[];
  onAddRelay: (url: string) => void;
  onRemoveRelay: (url: string) => void;
}

function RelayStatusBadge({ status }: { status: NostrRelay['status'] }) {
  const config = {
    connected: { text: 'Connected', color: 'text-green-400' },
    connecting: { text: 'Connecting', color: 'text-yellow-400' },
    disconnected: { text: 'Disconnected', color: 'text-gray-400' },
    error: { text: 'Error', color: 'text-red-400' },
  }[status];

  return <span className={`text-xs ${config.color}`}>{config.text}</span>;
}

export default function RelayManager({
  relays,
  onAddRelay,
  onRemoveRelay,
}: RelayManagerProps) {
  const [newRelayUrl, setNewRelayUrl] = useState('');
  const [error, setError] = useState('');

  const handleAdd = () => {
    const url = newRelayUrl.trim();
    if (!url) return;

    if (!url.startsWith('wss://')) {
      setError('Relay URL must start with wss://');
      return;
    }

    if (relays.some((r) => r.url === url)) {
      setError('Relay already added');
      return;
    }

    onAddRelay(url);
    setNewRelayUrl('');
    setError('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">Nostr Relays</h2>
      <p className="text-sm text-gray-400 mb-4">
        Relays are servers that store and forward your encrypted messages.
      </p>

      {/* Relay list */}
      <div className="space-y-2 mb-4">
        {relays.length === 0 ? (
          <div className="text-gray-500 text-sm p-4 bg-gray-800 rounded-lg text-center">
            No relays configured
          </div>
        ) : (
          relays.map((relay) => (
            <div
              key={relay.url}
              className="flex items-center justify-between bg-gray-800 p-3 rounded-lg"
            >
              <span className="text-sm truncate flex-1 font-mono">{relay.url}</span>
              <div className="flex items-center space-x-3 ml-2">
                <RelayStatusBadge status={relay.status} />
                <button
                  onClick={() => onRemoveRelay(relay.url)}
                  className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                  title="Remove relay"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add new relay */}
      <div className="space-y-2">
        <div className="flex space-x-2">
          <input
            type="text"
            value={newRelayUrl}
            onChange={(e) => {
              setNewRelayUrl(e.target.value);
              setError('');
            }}
            onKeyDown={handleKeyDown}
            placeholder="wss://relay.example.com"
            className="flex-1 bg-gray-700 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
          />
          <button
            onClick={handleAdd}
            disabled={!newRelayUrl.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors text-sm"
          >
            Add
          </button>
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
      </div>
    </section>
  );
}
