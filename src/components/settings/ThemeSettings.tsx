import type { Theme } from '@/store/useSettingsStore';

interface ThemeSettingsProps {
  theme: Theme;
  onChange: (theme: Theme) => void;
}

const THEMES: { value: Theme; label: string; icon: string }[] = [
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'system', label: 'System', icon: 'desktop' },
];

function ThemeIcon({ icon }: { icon: string }) {
  switch (icon) {
    case 'moon':
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      );
    case 'sun':
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      );
    case 'desktop':
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      );
    default:
      return null;
  }
}

export default function ThemeSettings({ theme, onChange }: ThemeSettingsProps) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">Appearance</h2>

      <div className="flex space-x-2">
        {THEMES.map((t) => (
          <button
            key={t.value}
            onClick={() => onChange(t.value)}
            className={`flex-1 flex flex-col items-center p-4 rounded-lg transition-colors ${
              theme === t.value
                ? 'bg-indigo-600/20 border border-indigo-500'
                : 'bg-gray-800 border border-transparent hover:bg-gray-700'
            }`}
          >
            <div className={`mb-2 ${theme === t.value ? 'text-indigo-400' : 'text-gray-400'}`}>
              <ThemeIcon icon={t.icon} />
            </div>
            <span className={`text-sm ${theme === t.value ? 'text-indigo-300' : 'text-gray-300'}`}>
              {t.label}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
