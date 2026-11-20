import { useEffect, useState } from 'react';
import { BriefcaseBusiness, Check, Moon, RotateCcw, Sun, User, Webhook } from 'lucide-react';
import type { EmulatorSettings, EmulatorVariant, SelfAccount } from '../../shared/types';
import { Avatar } from './Avatar';

interface SettingsPanelProps {
  self: SelfAccount;
  settings: EmulatorSettings;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onUpdateConfig: (patch: {
    variant?: EmulatorVariant;
    webhookUrl?: string;
    webhookSecret?: string;
    lifecycleDeliveredMs?: number;
    lifecycleReadMs?: number;
    autoMarkReadOnAutoReply?: boolean;
    self?: Partial<{ name: string; phone: string; about: string }>;
  }) => Promise<void>;
  onResetState: () => Promise<void>;
}

export function SettingsPanel({
  self,
  settings,
  darkMode,
  onToggleDarkMode,
  onUpdateConfig,
  onResetState,
}: SettingsPanelProps) {
  const [name, setName] = useState(self.name);
  const [phone, setPhone] = useState(self.phone);
  const [about, setAbout] = useState(self.about);
  const [webhookUrl, setWebhookUrl] = useState(settings.webhookUrl);
  const [webhookSecret, setWebhookSecret] = useState(settings.webhookSecret);
  const [deliveredMs, setDeliveredMs] = useState(settings.lifecycleDeliveredMs);
  const [readMs, setReadMs] = useState(settings.lifecycleReadMs);
  const [saved, setSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    setName(self.name);
    setPhone(self.phone);
    setAbout(self.about);
    setWebhookUrl(settings.webhookUrl);
    setWebhookSecret(settings.webhookSecret);
    setDeliveredMs(settings.lifecycleDeliveredMs);
    setReadMs(settings.lifecycleReadMs);
  }, [self, settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdateConfig({
      webhookUrl,
      webhookSecret,
      lifecycleDeliveredMs: Number(deliveredMs) || 0,
      lifecycleReadMs: Number(readMs) || 0,
      self: { name, phone, about },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <aside
      aria-label="Settings"
      className="w-full md:w-[375px] lg:w-[405px] shrink-0 h-full bg-white dark:bg-[#111b21] border-r border-[#e9edef] dark:border-[#222d34] flex flex-col"
    >
      <header className="h-[60px] px-4 bg-[#f0f2f5] dark:bg-[#202c33] border-b border-[#d1d7db] dark:border-[#2a3942] flex items-center justify-between shrink-0">
        <h1 className="text-[19px] font-bold text-[#111b21] dark:text-[#e9edef]">Settings</h1>
        {saved && (
          <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#00a884]">
            <Check className="w-3.5 h-3.5" /> Saved
          </span>
        )}
      </header>

      <div className="flex-1 overflow-y-auto wa-scroll p-4 space-y-5">
        {/* Variant Selector */}
        <section className="space-y-2">
          <div className="text-[12.5px] font-semibold text-[#667781] dark:text-[#8696a0]">
            Emulator Variant
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void onUpdateConfig({ variant: 'personal' })}
              className={`p-3 rounded-lg border text-left transition-colors ${
                settings.variant === 'personal'
                  ? 'border-[#00a884] bg-[#e7fce3]/60 dark:bg-[#0a332c]'
                  : 'border-[#e9edef] dark:border-[#2a3942] hover:bg-[#f5f6f6] dark:hover:bg-[#202c33]'
              }`}
            >
              <User className="w-4 h-4 text-[#00a884] mb-1.5" />
              <div className="text-[13.5px] font-semibold">WhatsApp</div>
              <div className="text-[11.5px] text-[#667781] dark:text-[#8696a0]">Personal mode</div>
            </button>

            <button
              type="button"
              onClick={() => void onUpdateConfig({ variant: 'business' })}
              className={`p-3 rounded-lg border text-left transition-colors ${
                settings.variant === 'business'
                  ? 'border-[#00a884] bg-[#e7fce3]/60 dark:bg-[#0a332c]'
                  : 'border-[#e9edef] dark:border-[#2a3942] hover:bg-[#f5f6f6] dark:hover:bg-[#202c33]'
              }`}
            >
              <BriefcaseBusiness className="w-4 h-4 text-[#00a884] mb-1.5" />
              <div className="text-[13.5px] font-semibold">WA Business</div>
              <div className="text-[11.5px] text-[#667781] dark:text-[#8696a0]">
                Catalog, labels & bots
              </div>
            </button>
          </div>
        </section>

        {/* Theme */}
        <section className="flex items-center justify-between py-2.5 border-y border-[#f0f2f5] dark:border-[#202c33]">
          <div className="flex items-center gap-3">
            {darkMode ? <Moon className="w-4 h-4 text-[#00a884]" /> : <Sun className="w-4 h-4 text-[#00a884]" />}
            <div>
              <div className="text-[14px] font-medium">Appearance</div>
              <div className="text-[12px] text-[#667781] dark:text-[#8696a0]">
                {darkMode ? 'Dark theme active' : 'Light theme active'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleDarkMode}
            className="px-3 py-1.5 rounded-lg bg-[#f0f2f5] dark:bg-[#202c33] text-[12.5px] font-semibold hover:bg-[#e5e8ec] dark:hover:bg-[#2a3942]"
          >
            Switch to {darkMode ? 'Light' : 'Dark'}
          </button>
        </section>

        {/* Profile & Integration Settings Form */}
        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar name={self.name} avatarUrl={self.avatarUrl} size="lg" />
            <div className="min-w-0">
              <div className="text-[14.5px] font-semibold truncate">{self.name}</div>
              <div className="text-[12px] font-mono text-[#667781] dark:text-[#8696a0]">
                {self.phone}
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            <div>
              <label className="block text-[12px] font-medium text-[#667781] dark:text-[#8696a0] mb-1">
                Account display name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#f0f2f5] dark:bg-[#202c33] text-[14px]"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#667781] dark:text-[#8696a0] mb-1">
                Emulated phone number
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#f0f2f5] dark:bg-[#202c33] text-[14px] font-mono"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#667781] dark:text-[#8696a0] mb-1">
                About
              </label>
              <input
                type="text"
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#f0f2f5] dark:bg-[#202c33] text-[14px]"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-[#f0f2f5] dark:border-[#202c33] space-y-2.5">
            <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#667781] dark:text-[#8696a0]">
              <Webhook className="w-3.5 h-3.5 text-[#00a884]" />
              <span>Webhook & Lifecycle Timers</span>
            </div>

            <div>
              <label className="block text-[12px] text-[#667781] dark:text-[#8696a0] mb-1">
                Webhook URL (EMULATOR_WEBHOOK_URL)
              </label>
              <input
                type="url"
                placeholder="http://localhost:4000/webhooks/whatsapp"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#f0f2f5] dark:bg-[#202c33] text-[13px] font-mono"
              />
            </div>

            <div>
              <label className="block text-[12px] text-[#667781] dark:text-[#8696a0] mb-1">
                HMAC Signing Secret
              </label>
              <input
                type="text"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#f0f2f5] dark:bg-[#202c33] text-[13px] font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[12px] text-[#667781] dark:text-[#8696a0] mb-1">
                  Delivered delay (ms)
                </label>
                <input
                  type="number"
                  min={0}
                  step={50}
                  value={deliveredMs}
                  onChange={(e) => setDeliveredMs(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-[#f0f2f5] dark:bg-[#202c33] text-[13px] font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[12px] text-[#667781] dark:text-[#8696a0] mb-1">
                  Read delay (ms)
                </label>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={readMs}
                  onChange={(e) => setReadMs(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-[#f0f2f5] dark:bg-[#202c33] text-[13px] font-mono tabular-nums"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-lg bg-[#00a884] text-white text-[14px] font-semibold hover:bg-[#008f72] transition-colors"
          >
            Save settings
          </button>
        </form>

        {/* Deterministic Reset */}
        <section className="pt-3 border-t border-[#f0f2f5] dark:border-[#202c33]">
          {!confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="w-full py-2.5 rounded-lg border border-[#ea0038]/40 text-[#ea0038] text-[13.5px] font-semibold hover:bg-[#ea0038]/5 flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> Reset emulator seed data
            </button>
          ) : (
            <div className="p-3 rounded-lg bg-[#ea0038]/5 border border-[#ea0038]/40 space-y-2">
              <p className="text-[12.5px] text-[#111b21] dark:text-[#e9edef]">
                Reset all messages, contacts, and logs back to initial seed state?
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="px-3 py-1 rounded text-[12.5px] text-[#54656f] dark:text-[#aebac1]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await onResetState();
                    setConfirmReset(false);
                  }}
                  className="px-3 py-1 rounded bg-[#ea0038] text-white text-[12.5px] font-semibold"
                >
                  Reset now
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}
