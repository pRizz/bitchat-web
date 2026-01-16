interface PrivacySettingsProps {
  showReadReceipts: boolean;
  showTypingIndicators: boolean;
  sharePresence: boolean;
  onChange: (settings: {
    showReadReceipts?: boolean;
    showTypingIndicators?: boolean;
    sharePresence?: boolean;
  }) => void;
}

function Toggle({
  enabled,
  onChange,
  label,
  description,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex-1 mr-4">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-gray-400">{description}</p>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          enabled ? 'bg-indigo-600' : 'bg-gray-600'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

export default function PrivacySettings({
  showReadReceipts,
  showTypingIndicators,
  sharePresence,
  onChange,
}: PrivacySettingsProps) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">Privacy</h2>
      <p className="text-sm text-gray-400 mb-4">
        Control what information you share with other users.
      </p>

      <div className="bg-gray-800 rounded-lg divide-y divide-gray-700">
        <div className="px-4">
          <Toggle
            enabled={showReadReceipts}
            onChange={(v) => onChange({ showReadReceipts: v })}
            label="Read Receipts"
            description="Let others know when you've read their messages"
          />
        </div>
        <div className="px-4">
          <Toggle
            enabled={showTypingIndicators}
            onChange={(v) => onChange({ showTypingIndicators: v })}
            label="Typing Indicators"
            description="Show when you're typing a message"
          />
        </div>
        <div className="px-4">
          <Toggle
            enabled={sharePresence}
            onChange={(v) => onChange({ sharePresence: v })}
            label="Online Status"
            description="Share your online/offline status with contacts"
          />
        </div>
      </div>
    </section>
  );
}
