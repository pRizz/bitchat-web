const APP_VERSION = '0.1.0';
const BUILD_DATE = '2026-01-16';

interface AboutSectionProps {
  onPanic: () => void;
  showPanicConfirm: boolean;
  onPanicConfirmChange: (show: boolean) => void;
}

export default function AboutSection({
  onPanic,
  showPanicConfirm,
  onPanicConfirmChange,
}: AboutSectionProps) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">About</h2>

      <div className="bg-gray-800 rounded-lg p-4 space-y-3">
        <div className="flex justify-between">
          <span className="text-gray-400">Version</span>
          <span className="text-white font-mono">{APP_VERSION}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Build Date</span>
          <span className="text-white font-mono">{BUILD_DATE}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Platform</span>
          <span className="text-white">Web (PWA)</span>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <a
          href="https://github.com/pRizz/bitchat-web"
          target="_blank"
          rel="noopener noreferrer"
          className="block text-sm text-indigo-400 hover:text-indigo-300"
        >
          View Source on GitHub
        </a>
        <a
          href="https://bitchat.app"
          target="_blank"
          rel="noopener noreferrer"
          className="block text-sm text-indigo-400 hover:text-indigo-300"
        >
          BitChat Website
        </a>
      </div>

      {/* Danger Zone */}
      <div className="mt-8 pt-6 border-t border-gray-700">
        <h3 className="text-sm font-semibold text-red-400 mb-4">Danger Zone</h3>

        {!showPanicConfirm ? (
          <button
            onClick={() => onPanicConfirmChange(true)}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>Panic: Delete All Data</span>
          </button>
        ) : (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
            <p className="text-red-300 text-sm mb-4">
              This will permanently delete your identity, all encryption keys, and all messages.
              This action cannot be undone!
            </p>
            <div className="flex space-x-2">
              <button
                onClick={onPanic}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Yes, Delete Everything
              </button>
              <button
                onClick={() => onPanicConfirmChange(false)}
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
