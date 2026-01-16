import { useState, useEffect } from 'react';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useRelayStore } from '@/store/useRelayStore';
import {
  IdentitySection,
  RelayManager,
  PrivacySettings,
  PerformanceSettings,
  ThemeSettings,
  AboutSection,
} from '@/components/settings';

export default function SettingsTab() {
  const {
    identity,
    nickname,
    theme,
    privacy,
    performanceMode,
    setNickname,
    setTheme,
    setPrivacy,
    setPerformanceMode,
    initialize,
    initialized,
    exportIdentity,
    wipeAllData,
  } = useSettingsStore();

  const { relays, connect, addRelay, removeRelay } = useRelayStore();

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

  const handleAddRelay = (url: string) => {
    addRelay(url);
    useSettingsStore.getState().addRelay(url);
  };

  const handleRemoveRelay = (url: string) => {
    removeRelay(url);
    useSettingsStore.getState().removeRelay(url);
  };

  const handlePanic = async () => {
    await wipeAllData();
    setShowPanicConfirm(false);
    window.location.reload();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <header className="h-14 bg-gray-800 border-b border-gray-700 flex items-center px-4 sticky top-0 z-10">
        <h1 className="text-lg font-semibold">Settings</h1>
      </header>

      <div className="p-6 space-y-8 max-w-2xl">
        {/* Identity Section */}
        <IdentitySection
          identity={identity}
          nickname={nickname}
          onNicknameChange={setNickname}
          onExport={handleExport}
        />

        {/* Export Modal */}
        {showExport && (
          <div className="p-4 bg-gray-800 rounded-lg border border-yellow-600/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-yellow-400 flex items-center">
                <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Keep this secret! Anyone with this key can impersonate you.
              </span>
              <button
                onClick={() => setShowExport(false)}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <code className="block text-xs text-gray-300 break-all bg-gray-900 p-3 rounded font-mono">
              {exportData}
            </code>
            <button
              onClick={() => copyToClipboard(exportData)}
              className="mt-3 text-sm text-indigo-400 hover:text-indigo-300 flex items-center"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy to clipboard
            </button>
          </div>
        )}

        {/* Theme Settings */}
        <ThemeSettings theme={theme} onChange={setTheme} />

        {/* Relay Manager */}
        <RelayManager
          relays={relays}
          onAddRelay={handleAddRelay}
          onRemoveRelay={handleRemoveRelay}
        />

        {/* Privacy Settings */}
        <PrivacySettings
          showReadReceipts={privacy.showReadReceipts}
          showTypingIndicators={privacy.showTypingIndicators}
          sharePresence={privacy.sharePresence}
          onChange={setPrivacy}
        />

        {/* Performance Settings */}
        <PerformanceSettings
          mode={performanceMode}
          onChange={setPerformanceMode}
        />

        {/* About Section */}
        <AboutSection
          onPanic={handlePanic}
          showPanicConfirm={showPanicConfirm}
          onPanicConfirmChange={setShowPanicConfirm}
        />
      </div>
    </div>
  );
}
