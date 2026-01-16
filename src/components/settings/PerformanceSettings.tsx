import type { PerformanceMode } from '@/store/useSettingsStore';

interface PerformanceSettingsProps {
  mode: PerformanceMode;
  onChange: (mode: PerformanceMode) => void;
}

const MODES: { value: PerformanceMode; label: string; description: string; icon: string }[] = [
  {
    value: 'battery_saver',
    label: 'Battery Saver',
    description: 'Reduce background activity, sync less frequently',
    icon: 'battery',
  },
  {
    value: 'balanced',
    label: 'Balanced',
    description: 'Good balance between performance and battery',
    icon: 'scale',
  },
  {
    value: 'performance',
    label: 'Performance',
    description: 'Fastest sync, real-time updates, more battery usage',
    icon: 'bolt',
  },
];

function ModeIcon({ icon }: { icon: string }) {
  switch (icon) {
    case 'battery':
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7h-1V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2v-2h1a1 1 0 001-1V8a1 1 0 00-1-1z" />
        </svg>
      );
    case 'scale':
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
        </svg>
      );
    case 'bolt':
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      );
    default:
      return null;
  }
}

export default function PerformanceSettings({ mode, onChange }: PerformanceSettingsProps) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">Performance</h2>
      <p className="text-sm text-gray-400 mb-4">
        Adjust sync frequency and background activity.
      </p>

      <div className="space-y-2">
        {MODES.map((m) => (
          <button
            key={m.value}
            onClick={() => onChange(m.value)}
            className={`w-full flex items-center p-4 rounded-lg transition-colors text-left ${
              mode === m.value
                ? 'bg-indigo-600/20 border border-indigo-500'
                : 'bg-gray-800 border border-transparent hover:bg-gray-700'
            }`}
          >
            <div className={`mr-4 ${mode === m.value ? 'text-indigo-400' : 'text-gray-400'}`}>
              <ModeIcon icon={m.icon} />
            </div>
            <div className="flex-1">
              <p className={`font-medium ${mode === m.value ? 'text-indigo-300' : 'text-white'}`}>
                {m.label}
              </p>
              <p className="text-xs text-gray-400">{m.description}</p>
            </div>
            {mode === m.value && (
              <svg className="w-5 h-5 text-indigo-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}
