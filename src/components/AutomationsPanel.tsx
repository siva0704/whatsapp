import { useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Gauge,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Zap,
} from 'lucide-react';
import type {
  AutoReplyRule,
  BusinessAutomation,
  Contact,
  FailureInjectionConfig,
  RateLimitConfig,
  RateLimitSnapshot,
} from '../../shared/types';

interface AutomationsPanelProps {
  automation: BusinessAutomation;
  autoReplyRules: AutoReplyRule[];
  contacts: Contact[];
  failureInjection: FailureInjectionConfig;
  rateLimits: RateLimitConfig;
  rateLimitUsage: RateLimitSnapshot;
  onUpdateAutomation: (patch: Partial<BusinessAutomation>) => Promise<void>;
  onSaveRule: (
    rule: Partial<AutoReplyRule> & { name: string; pattern: string; reply: string }
  ) => Promise<void>;
  onDeleteRule: (id: string) => Promise<void>;
  onUpdateFailureInjection: (patch: Partial<FailureInjectionConfig>) => Promise<void>;
  onUpdateRateLimits: (patch: Partial<RateLimitConfig>) => Promise<void>;
  onResetRateLimits: () => Promise<void>;
}

export function AutomationsPanel({
  automation,
  autoReplyRules,
  contacts,
  failureInjection,
  rateLimits,
  rateLimitUsage,
  onUpdateAutomation,
  onSaveRule,
  onDeleteRule,
  onUpdateFailureInjection,
  onUpdateRateLimits,
  onResetRateLimits,
}: AutomationsPanelProps) {
  const [greetingMsg, setGreetingMsg] = useState(automation.greetingMessage);
  const [awayMsg, setAwayMsg] = useState(automation.awayMessage);
  const [ruleName, setRuleName] = useState('');
  const [ruleMatchType, setRuleMatchType] = useState<'contains' | 'exact' | 'regex'>('contains');
  const [rulePattern, setRulePattern] = useState('');
  const [ruleReply, setRuleReply] = useState('');
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const flashSaved = (msg: string) => {
    setSavedNotice(msg);
    setTimeout(() => setSavedNotice(null), 2000);
  };

  const personalityCounts = contacts
    .filter((c) => !c.isBot)
    .reduce<Record<string, number>>((acc, c) => {
      const key = c.personality || 'silent';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

  return (
    <section
      aria-label="Automations and protocol controls"
      className="flex-1 h-full min-w-0 bg-white dark:bg-[#111b21] flex flex-col overflow-hidden"
    >
      <header className="px-4 md:px-6 py-3.5 pt-safe bg-[#f0f2f5] dark:bg-[#202c33] border-b border-[#d1d7db] dark:border-[#2a3942] flex items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-[19px] font-bold tracking-tight text-[#111b21] dark:text-[#e9edef]">
            Automations &amp; Protocol Controls
          </h1>
          <p className="text-[12.5px] text-[#667781] dark:text-[#8696a0] mt-0.5">
            Configure sender auto-responders, simulated failure injection, and Meta rate-limit thresholds
          </p>
        </div>
        {savedNotice && (
          <span className="text-[12.5px] font-semibold text-[#008069] dark:text-[#25d366] shrink-0">
            {savedNotice}
          </span>
        )}
      </header>

      <div className="flex-1 overflow-y-auto wa-scroll p-4 md:p-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* FAILURE INJECTION CONTROLS */}
          <div className="p-4 rounded-xl border border-[#e9edef] dark:border-[#2a3942] bg-[#f7f8fa] dark:bg-[#182229] space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[#ea0038]" />
                <h2 className="text-[15px] font-semibold text-[#111b21] dark:text-[#e9edef]">
                  Failure Injection
                </h2>
              </div>
              <label className="flex items-center gap-2 text-[13px] font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={failureInjection.enabled}
                  onChange={(e) => {
                    void onUpdateFailureInjection({ enabled: e.target.checked });
                    flashSaved('Failure injection updated');
                  }}
                  aria-label="Enable failure injection"
                  className="accent-[#00a884]"
                />
                <span>{failureInjection.enabled ? 'Enabled' : 'Disabled'}</span>
              </label>
            </div>

            <p className="text-[12.5px] text-[#667781] dark:text-[#8696a0]">
              Inject deterministic Meta Cloud API failure percentages into outbound sends and broadcasts to verify retry and dead-letter handling.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="fi-invalid" className="block text-[12px] text-[#667781] dark:text-[#8696a0] mb-1">
                  Invalid number % (#131030)
                </label>
                <input
                  id="fi-invalid"
                  type="number"
                  min={0}
                  max={100}
                  value={failureInjection.invalidNumberPct}
                  onChange={(e) =>
                    void onUpdateFailureInjection({ invalidNumberPct: Number(e.target.value) })
                  }
                  className="w-full h-9 px-2.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[13px] font-mono tabular-nums"
                />
              </div>

              <div>
                <label htmlFor="fi-optout" className="block text-[12px] text-[#667781] dark:text-[#8696a0] mb-1">
                  Opt-out % (#131049)
                </label>
                <input
                  id="fi-optout"
                  type="number"
                  min={0}
                  max={100}
                  value={failureInjection.optOutPct}
                  onChange={(e) =>
                    void onUpdateFailureInjection({ optOutPct: Number(e.target.value) })
                  }
                  className="w-full h-9 px-2.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[13px] font-mono tabular-nums"
                />
              </div>

              <div>
                <label htmlFor="fi-window" className="block text-[12px] text-[#667781] dark:text-[#8696a0] mb-1">
                  Out-of-window % (#131047)
                </label>
                <input
                  id="fi-window"
                  type="number"
                  min={0}
                  max={100}
                  value={failureInjection.outOfWindowPct}
                  onChange={(e) =>
                    void onUpdateFailureInjection({ outOfWindowPct: Number(e.target.value) })
                  }
                  className="w-full h-9 px-2.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[13px] font-mono tabular-nums"
                />
              </div>

              <div>
                <label htmlFor="fi-disabled" className="block text-[12px] text-[#667781] dark:text-[#8696a0] mb-1">
                  Disabled / Undeliv. % (#131026)
                </label>
                <input
                  id="fi-disabled"
                  type="number"
                  min={0}
                  max={100}
                  value={failureInjection.disabledPct}
                  onChange={(e) =>
                    void onUpdateFailureInjection({ disabledPct: Number(e.target.value) })
                  }
                  className="w-full h-9 px-2.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[13px] font-mono tabular-nums"
                />
              </div>
            </div>
          </div>

          {/* RATE-LIMIT SIMULATION CONTROLS */}
          <div className="p-4 rounded-xl border border-[#e9edef] dark:border-[#2a3942] bg-[#f7f8fa] dark:bg-[#182229] space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-[#00a884]" />
                <h2 className="text-[15px] font-semibold text-[#111b21] dark:text-[#e9edef]">
                  Rate-Limit Simulation
                </h2>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-[13px] font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rateLimits.enabled}
                    onChange={(e) => {
                      void onUpdateRateLimits({ enabled: e.target.checked });
                      flashSaved('Rate limits updated');
                    }}
                    aria-label="Enable rate limit simulation"
                    className="accent-[#00a884]"
                  />
                  <span>{rateLimits.enabled ? 'Enforced' : 'Bypassed'}</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    void onResetRateLimits();
                    flashSaved('Rate counters reset');
                  }}
                  className="px-2.5 py-1 rounded border border-[#d1d7db] dark:border-[#374248] text-[12px] font-medium inline-flex items-center gap-1 hover:border-[#00a884]"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Reset
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="rl-sec" className="block text-[12px] text-[#667781] dark:text-[#8696a0] mb-1">
                  Per-number msgs/sec (#130429)
                </label>
                <input
                  id="rl-sec"
                  type="number"
                  min={0}
                  value={rateLimits.messagesPerSecond}
                  onChange={(e) =>
                    void onUpdateRateLimits({ messagesPerSecond: Number(e.target.value) })
                  }
                  className="w-full h-9 px-2.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[13px] font-mono tabular-nums"
                />
              </div>

              <div>
                <label htmlFor="rl-min" className="block text-[12px] text-[#667781] dark:text-[#8696a0] mb-1">
                  Per-number msgs/min (#130429)
                </label>
                <input
                  id="rl-min"
                  type="number"
                  min={0}
                  value={rateLimits.messagesPerMinute}
                  onChange={(e) =>
                    void onUpdateRateLimits({ messagesPerMinute: Number(e.target.value) })
                  }
                  className="w-full h-9 px-2.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[13px] font-mono tabular-nums"
                />
              </div>

              <div>
                <label htmlFor="rl-pair" className="block text-[12px] text-[#667781] dark:text-[#8696a0] mb-1">
                  Per-recipient pair/min (#131056)
                </label>
                <input
                  id="rl-pair"
                  type="number"
                  min={0}
                  value={rateLimits.pairMessagesPerMinute}
                  onChange={(e) =>
                    void onUpdateRateLimits({ pairMessagesPerMinute: Number(e.target.value) })
                  }
                  className="w-full h-9 px-2.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[13px] font-mono tabular-nums"
                />
              </div>

              <div>
                <label htmlFor="rl-daily" className="block text-[12px] text-[#667781] dark:text-[#8696a0] mb-1">
                  Daily template cap (#130429)
                </label>
                <input
                  id="rl-daily"
                  type="number"
                  min={0}
                  value={rateLimits.dailyTemplateLimit}
                  onChange={(e) =>
                    void onUpdateRateLimits({ dailyTemplateLimit: Number(e.target.value) })
                  }
                  className="w-full h-9 px-2.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[13px] font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="pt-1 text-[12px] font-mono tabular-nums text-[#54656f] dark:text-[#aebac1] flex flex-wrap gap-x-4 gap-y-1">
              <span>
                Daily templates: {rateLimitUsage.dailyTemplatesSent} / {rateLimits.dailyTemplateLimit}
              </span>
              <span>Throttled total: {rateLimitUsage.totalThrottled}</span>
            </div>
          </div>
        </div>

        {/* BUSINESS GREETING/AWAY + CLIENT PERSONALITY DISTRIBUTION */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="p-4 rounded-xl border border-[#e9edef] dark:border-[#2a3942] space-y-3.5">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#00a884]" />
              <h2 className="text-[15px] font-semibold text-[#111b21] dark:text-[#e9edef]">
                Business Sender Greeting &amp; Away Rules
              </h2>
            </div>

            <div className="space-y-2">
              <label className="flex items-center justify-between text-[13px] font-medium cursor-pointer">
                <span>Greeting message (first inbound per chat)</span>
                <input
                  type="checkbox"
                  checked={automation.greetingEnabled}
                  onChange={(e) =>
                    void onUpdateAutomation({ greetingEnabled: e.target.checked })
                  }
                  className="accent-[#00a884]"
                />
              </label>
              <textarea
                rows={2}
                value={greetingMsg}
                onChange={(e) => setGreetingMsg(e.target.value)}
                aria-label="Greeting message"
                className="w-full px-3 py-2 rounded-lg bg-[#f0f2f5] dark:bg-[#202c33] text-[13px] resize-none"
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-center justify-between text-[13px] font-medium cursor-pointer">
                <span>Away auto-reply</span>
                <input
                  type="checkbox"
                  checked={automation.awayEnabled}
                  onChange={(e) =>
                    void onUpdateAutomation({ awayEnabled: e.target.checked })
                  }
                  className="accent-[#00a884]"
                />
              </label>
              <textarea
                rows={2}
                value={awayMsg}
                onChange={(e) => setAwayMsg(e.target.value)}
                aria-label="Away message"
                className="w-full px-3 py-2 rounded-lg bg-[#f0f2f5] dark:bg-[#202c33] text-[13px] resize-none"
              />
            </div>

            <button
              type="button"
              onClick={async () => {
                await onUpdateAutomation({
                  greetingMessage: greetingMsg,
                  awayMessage: awayMsg,
                });
                flashSaved('Business messages saved');
              }}
              className="min-h-[38px] px-4 py-2 rounded-lg bg-[#00a884] text-white text-[13px] font-semibold hover:bg-[#008f72] inline-flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" /> Save Sender Messages
            </button>
          </div>

          {/* AUTO-REPLY BOT RULES */}
          <div className="p-4 rounded-xl border border-[#e9edef] dark:border-[#2a3942] space-y-3.5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-[#00a884] shrink-0" />
                <h2 className="text-[15px] font-semibold text-[#111b21] dark:text-[#e9edef]">
                  Pattern Auto-Reply Rules ({autoReplyRules.length})
                </h2>
              </div>
              <p className="text-[11.5px] font-mono text-[#667781] dark:text-[#8696a0]">
                Client cohorts: {Object.entries(personalityCounts)
                  .map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`)
                  .slice(0, 3)
                  .join(' · ') || 'none'}
              </p>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!ruleName.trim() || !rulePattern.trim() || !ruleReply.trim()) return;
                await onSaveRule({
                  name: ruleName.trim(),
                  matchType: ruleMatchType,
                  pattern: rulePattern.trim(),
                  reply: ruleReply.trim(),
                  delayMs: 550,
                });
                setRuleName('');
                setRulePattern('');
                setRuleReply('');
                flashSaved('Auto-reply rule added');
              }}
              className="grid grid-cols-1 sm:grid-cols-12 gap-2"
            >
              <input
                type="text"
                required
                placeholder="Rule name"
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                className="sm:col-span-4 h-9 px-2.5 rounded-md bg-[#f0f2f5] dark:bg-[#202c33] text-[12.5px]"
              />
              <select
                value={ruleMatchType}
                onChange={(e) =>
                  setRuleMatchType(e.target.value as 'contains' | 'exact' | 'regex')
                }
                aria-label="New rule match type"
                className="sm:col-span-3 h-9 px-2 rounded-md bg-[#f0f2f5] dark:bg-[#202c33] text-[12.5px]"
              >
                <option value="contains">Contains</option>
                <option value="exact">Exact</option>
                <option value="regex">Regex</option>
              </select>
              <input
                type="text"
                required
                placeholder="Pattern"
                value={rulePattern}
                onChange={(e) => setRulePattern(e.target.value)}
                className="sm:col-span-5 h-9 px-2.5 rounded-md bg-[#f0f2f5] dark:bg-[#202c33] text-[12.5px] font-mono"
              />
              <input
                type="text"
                required
                placeholder="Simulated client reply when matched..."
                value={ruleReply}
                onChange={(e) => setRuleReply(e.target.value)}
                className="sm:col-span-9 h-9 px-2.5 rounded-md bg-[#f0f2f5] dark:bg-[#202c33] text-[12.5px]"
              />
              <button
                type="submit"
                className="sm:col-span-3 h-9 px-3 rounded-md bg-[#00a884] text-white text-[12.5px] font-semibold hover:bg-[#008f72] inline-flex items-center justify-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </form>

            <div className="divide-y divide-[#e9edef] dark:divide-[#222d34] max-h-[260px] overflow-y-auto wa-scroll">
              {autoReplyRules.map((rule) => (
                <div key={rule.id} className="py-2.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <label className="flex items-center gap-2 text-[13.5px] font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={(e) =>
                          void onSaveRule({ ...rule, enabled: e.target.checked })
                        }
                        className="accent-[#00a884]"
                      />
                      <span className="truncate">{rule.name}</span>
                    </label>
                    <div className="text-[11.5px] font-mono text-[#008069] dark:text-[#25d366] mt-0.5">
                      {rule.matchType}: &quot;{rule.pattern}&quot; · {rule.delayMs}ms
                    </div>
                    <p className="text-[12.5px] text-[#54656f] dark:text-[#aebac1] mt-0.5">
                      {rule.reply}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void onDeleteRule(rule.id)}
                    aria-label={`Delete rule ${rule.name}`}
                    className="p-1.5 text-[#8696a0] hover:text-[#ea0038] shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
