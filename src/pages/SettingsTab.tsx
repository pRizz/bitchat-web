import { useState, useEffect } from 'react';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useRelayStore } from '@/store/useRelayStore';

export default function SettingsTab() {
  const { identity, nickname, setNickname, initialize, initialized, exportIdentity, deleteIdentity } = useSettingsStore();
  const { relays, connect, addRelay, removeRelay } = useRelayStore();

  const [newRelayUrl, setNewRelayUrl] = useState('');
  const [showExport, setShowExport] = useState(false);
  const [exportData, setExportData] = useState('');
  const [showPanicConfirm, setShowPanicConfirm] = useState(false);

  // Initialize on mount
  useEffect(() => {
    if (!initialized) {
      initialize().then(() => {
        const storedRelays = useSettingsStore.getState().relays;
        connect(storedRelays);
      });
    }
  }, [initialized, initialize, connect]);

  const handleExport = async () => {
    try {
      const data = await exportIdentity();
      setExportData(data);
      setShowExport(true);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const handleAddRelay = () => {
    if (newRelayUrl && newRelayUrl.startsWith('wss://')) {
      addRelay(newRelayUrl);
      useSettingsStore.getState().addRelay(newRelayUrl);
      setNewRelayUrl('');
    }
  };

  const handleRemoveRelay = (url: string) => {
    removeRelay(url);
    useSettingsStore.getState().removeRelay(url);
  };

  const handlePanic = async () => {
    await deleteIdentity();
    setShowPanicConfirm(false);
    window.location.reload();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <header className="h-14 bg-gray-800 border-b border-gray-700 flex items-center px-4">
        <h1 className="text-lg font-semibold">Settings</h1>
      </header>

      <div className="p-6 space-y-8 max-w-2xl">
        {/* Identity Section */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Identity</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Nickname</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Enter a nickname..."
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                maxLength={32}
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Public Key (hex)</label>
              <div className="flex items-center space-x-2">
                <code className="flex-1 bg-gray-800 p-3 rounded-lg text-xs text-gray-300 break-all">
                  {identity?.publicKeyHex || 'Loading...'}
                </code>
                {identity && (
                  <button
                    onClick={() => copyToClipboard(identity.publicKeyHex)}
                    className="p-2 text-gray-400 hover:text-white"
                    title="Copy"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Nostr Address (npub)</label>
              <div className="flex items-center space-x-2">
                <code className="flex-1 bg-gray-800 p-3 rounded-lg text-xs text-gray-300 break-all">
                  {identity?.npub || 'Loading...'}
                </code>
                {identity && (
                  <button
                    onClick={() => copyToClipboard(identity.npub)}
                    className="p-2 text-gray-400 hover:text-white"
                    title="Copy"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Relays Section */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Nostr Relays</h2>

          <div className="space-y-2">
            {relays.map((relay) => (
              <div key={relay.url} className="flex items-center justify-between bg-gray-800 p-3 rounded-lg">
                <span className="text-sm truncate flex-1">{relay.url}</span>
                <div className="flex items-center space-x-2">
                  <span className={`text-xs ${
                    relay.status === 'connected' ? 'text-green-400' :
                    relay.status === 'connecting' ? 'text-yellow-400' :
                    relay.status === 'error' ? 'text-red-400' :
                    'text-gray-400'
                  }`}>
                    {relay.status}
                  </span>
                  <button
                    onClick={() => handleRemoveRelay(relay.url)}
                    className="p-1 text-gray-400 hover:text-red-400"
                    title="Remove"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex space-x-2">
            <input
              type="text"
              value={newRelayUrl}
              onChange={(e) => setNewRelayUrl(e.target.value)}
              placeholder="wss://relay.example.com"
              className="flex-1 bg-gray-700 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={handleAddRelay}
              disabled={!newRelayUrl.startsWith('wss://')}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors text-sm"
            >
              Add
            </button>
          </div>
        </section>

        {/* Security Section */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Security</h2>

          <div className="space-y-4">
            <button
              onClick={handleExport}
              className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Export Keys (Backup)
            </button>
          </div>

          {showExport && (
            <div className="mt-4 p-4 bg-gray-800 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-yellow-400">Keep this secret!</span>
                <button
                  onClick={() => setShowExport(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <code className="block text-xs text-gray-300 break-all bg-gray-900 p-2 rounded">
                {exportData}
              </code>
              <button
                onClick={() => copyToClipboard(exportData)}
                className="mt-2 text-sm text-indigo-400 hover:text-indigo-300"
              >
                Copy to clipboard
              </button>
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-gray-700">
            {!showPanicConfirm ? (
              <button
                onClick={() => setShowPanicConfirm(true)}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Panic: Delete All Keys
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-red-400 text-sm">Are you sure? This cannot be undone!</p>
                <div className="flex space-x-2">
                  <button
                    onClick={handlePanic}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    Yes, Delete Everything
                  </button>
                  <button
                    onClick={() => setShowPanicConfirm(false)}
                    className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <p className="text-xs text-gray-500 mt-2">
              This will permanently delete your identity and all encryption keys.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
