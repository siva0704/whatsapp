import { useState } from 'react';
import {
  Bot,
  Check,
  Copy,
  Download,
  Plus,
  Send,
  Terminal,
  Trash2,
  Webhook,
} from 'lucide-react';
import type {
  AutoReplyRule,
  Chat,
  Contact,
  EmulatorSettings,
  MessageType,
  WebhookLogEntry,
} from '../../shared/types';
import { formatTime } from '../utils/format';

type QaTab = 'simulate' | 'bots' | 'webhooks' | 'api';

interface QaConsolePanelProps {
  contacts: Contact[];
  chats: Chat[];
  selectedChatId: string | null;
  autoReplyRules: AutoReplyRule[];
  webhookLogs: WebhookLogEntry[];
  settings: EmulatorSettings;
  onSimulateInbound: (payload: {
    chatId?: string;
    fromPhone?: string;
    fromName?: string;
    senderId?: string;
    body: string;
    type: MessageType;
  }) => Promise<void>;
  onSimulateTyping: (chatId: string, isTyping: boolean, mode: 'typing' | 'recording') => Promise<void>;
  onSaveRule: (rule: Partial<AutoReplyRule> & { name: string; pattern: string; reply: string }) => Promise<void>;
  onDeleteRule: (id: string) => Promise<void>;
  onClearWebhookLogs: () => Promise<void>;
}

export function QaConsolePanel({
  contacts,
  chats,
  selectedChatId,
  autoReplyRules,
  webhookLogs,
  settings,
  onSimulateInbound,
  onSimulateTyping,
  onSaveRule,
  onDeleteRule,
  onClearWebhookLogs,
}: QaConsolePanelProps) {
  const [tab, setTab] = useState<QaTab>('simulate');

  // Inbound Simulator state
  const [targetMode, setTargetMode] = useState<'existing' | 'new'>('existing');
  const [selectedContactId, setSelectedContactId] = useState(contacts[0]?.id || '');
  const [newPhone, setNewPhone] = useState('+14155550177');
  const [newName, setNewName] = useState('External QA Peer');
  const [msgType, setMsgType] = useState<MessageType>('text');
  const [inboundBody, setInboundBody] = useState('');
  const [sentNotice, setSentNotice] = useState(false);

  // Bot Rule form state
  const [ruleName, setRuleName] = useState('');
  const [ruleMatchType, setRuleMatchType] = useState<'contains' | 'exact' | 'regex'>('contains');
  const [rulePattern, setRulePattern] = useState('');
  const [ruleReply, setRuleReply] = useState('');
  const [ruleDelay, setRuleDelay] = useState(650);

  // Webhook log expansion
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const activeChat = chats.find((c) => c.id === selectedChatId) || chats[0];

  const handleInjectInbound = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inboundBody.trim() || (msgType === 'voice' ? 'Voice message (0:09)' : '');
    if (!text) return;

    if (targetMode === 'existing') {
      const contact = contacts.find((c) => c.id === selectedContactId) || contacts[0];
      await onSimulateInbound({
        senderId: contact?.id,
        fromPhone: contact?.phone,
        fromName: contact?.name,
        body: text,
        type: msgType,
      });
    } else {
      if (!newPhone.trim()) return;
      await onSimulateInbound({
        fromPhone: newPhone.trim(),
        fromName: newName.trim() || newPhone.trim(),
        body: text,
        type: msgType,
      });
    }
    setInboundBody('');
    setSentNotice(true);
    setTimeout(() => setSentNotice(false), 1800);
  };

  const copySnippet = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      // Clipboard may be blocked in headless contexts
    }
  };

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const curlOutbound = `curl -X POST ${baseUrl}/v19.0/wa-sim-phone-001/messages \\
  -H "Authorization: Bearer wa-sim-local-dev-token" \\
  -H "Content-Type: application/json" \\
  -d '{"messaging_product":"whatsapp","to":"+14155550142","type":"text","text":{"body":"status"}}'`;

  const curlInbound = `curl -X POST ${baseUrl}/api/messages/receive \\
  -H "Authorization: Bearer wa-sim-local-dev-token" \\
  -H "Content-Type: application/json" \\
  -d '{"fromPhone":"+14155550188","fromName":"Priya Patel","body":"Hello from CI test"}'`;

  return (
    <aside
      aria-label="QA Test Console"
      className="w-full md:w-[395px] lg:w-[430px] shrink-0 h-full bg-white dark:bg-[#111b21] border-r border-[#e9edef] dark:border-[#222d34] flex flex-col"
    >
      <header className="h-[60px] px-4 bg-[#f0f2f5] dark:bg-[#202c33] border-b border-[#d1d7db] dark:border-[#2a3942] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <Terminal className="w-5 h-5 text-[#00a884]" />
          <h1 className="text-[17px] font-bold text-[#111b21] dark:text-[#e9edef]">
            QA Test Console
          </h1>
        </div>
        <span className="text-[11.5px] font-mono text-[#667781] dark:text-[#8696a0]">
          {settings.variant}
        </span>
      </header>

      {/* Sub-navigation Tabs */}
      <div
        role="tablist"
        className="px-3 py-2 bg-[#f7f8fa] dark:bg-[#182229] border-b border-[#e9edef] dark:border-[#2a3942] grid grid-cols-4 gap-1 shrink-0"
      >
        {(
          [
            { id: 'simulate', label: 'Inbound' },
            { id: 'bots', label: `Bots (${autoReplyRules.length})` },
            { id: 'webhooks', label: `Hooks (${webhookLogs.length})` },
            { id: 'api', label: 'API' },
          ] as { id: QaTab; label: string }[]
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`py-1.5 px-2 rounded-md text-[12px] font-semibold whitespace-nowrap transition-colors ${
              tab === t.id
                ? 'bg-white dark:bg-[#2a3942] text-[#008069] dark:text-[#25d366] shadow-xs'
                : 'text-[#54656f] dark:text-[#8696a0] hover:text-[#111b21] dark:hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto wa-scroll p-4 space-y-4">
        {/* TAB 1: SIMULATE INBOUND & TYPING */}
        {tab === 'simulate' && (
          <>
            <form
              onSubmit={handleInjectInbound}
              className="p-3.5 rounded-lg border border-[#e9edef] dark:border-[#2a3942] bg-[#f7f8fa] dark:bg-[#182229] space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-[13.5px] font-semibold">Simulate inbound message</span>
                {sentNotice && (
                  <span className="text-[12px] font-semibold text-[#00a884]">Injected</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setTargetMode('existing')}
                  className={`py-1.5 rounded-md text-[12.5px] font-medium border ${
                    targetMode === 'existing'
                      ? 'bg-white dark:bg-[#2a3942] border-[#00a884] text-[#008069] dark:text-[#25d366]'
                      : 'border-transparent text-[#667781] dark:text-[#8696a0]'
                  }`}
                >
                  Existing contact
                </button>
                <button
                  type="button"
                  onClick={() => setTargetMode('new')}
                  className={`py-1.5 rounded-md text-[12.5px] font-medium border ${
                    targetMode === 'new'
                      ? 'bg-white dark:bg-[#2a3942] border-[#00a884] text-[#008069] dark:text-[#25d366]'
                      : 'border-transparent text-[#667781] dark:text-[#8696a0]'
                  }`}
                >
                  New phone number
                </button>
              </div>

              {targetMode === 'existing' ? (
                <div>
                  <label className="block text-[11.5px] text-[#667781] dark:text-[#8696a0] mb-1">
                    Sender contact
                  </label>
                  <select
                    value={selectedContactId}
                    onChange={(e) => setSelectedContactId(e.target.value)}
                    aria-label="Inbound sender contact"
                    className="w-full px-3 py-2 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[13.5px]"
                  >
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.phone})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11.5px] text-[#667781] dark:text-[#8696a0] mb-1">
                      Phone
                    </label>
                    <input
                      type="text"
                      required
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[13px] font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11.5px] text-[#667781] dark:text-[#8696a0] mb-1">
                      Name
                    </label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[13px]"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11.5px] text-[#667781] dark:text-[#8696a0] mb-1">
                  Message type
                </label>
                <select
                  value={msgType}
                  onChange={(e) => setMsgType(e.target.value as MessageType)}
                  aria-label="Inbound message type"
                  className="w-full px-3 py-1.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[13px]"
                >
                  <option value="text">Text message</option>
                  <option value="voice">Voice note (0:09)</option>
                  <option value="image">Image with caption</option>
                  <option value="document">PDF document</option>
                </select>
              </div>

              <div>
                <label className="block text-[11.5px] text-[#667781] dark:text-[#8696a0] mb-1">
                  Payload text / caption
                </label>
                <textarea
                  rows={2}
                  required={msgType !== 'voice'}
                  placeholder="e.g. Where is my order #ORD-4821?"
                  value={inboundBody}
                  onChange={(e) => setInboundBody(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[13.5px] resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 rounded-md bg-[#00a884] text-white text-[13.5px] font-semibold hover:bg-[#008f72] flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" /> Send inbound message
              </button>
            </form>

            {/* Presence Controls for Active Chat */}
            {activeChat && (
              <div className="p-3.5 rounded-lg border border-[#e9edef] dark:border-[#2a3942] space-y-2.5">
                <div className="text-[13px] font-semibold">
                  Presence events ({activeChat.name})
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => void onSimulateTyping(activeChat.id, true, 'typing')}
                    className="py-1.5 px-2 rounded-md bg-[#f0f2f5] dark:bg-[#202c33] text-[12px] font-medium hover:bg-[#e5e8ec] dark:hover:bg-[#2a3942]"
                  >
                    Typing...
                  </button>
                  <button
                    type="button"
                    onClick={() => void onSimulateTyping(activeChat.id, true, 'recording')}
                    className="py-1.5 px-2 rounded-md bg-[#f0f2f5] dark:bg-[#202c33] text-[12px] font-medium hover:bg-[#e5e8ec] dark:hover:bg-[#2a3942]"
                  >
                    Recording
                  </button>
                  <button
                    type="button"
                    onClick={() => void onSimulateTyping(activeChat.id, false, 'typing')}
                    className="py-1.5 px-2 rounded-md border border-[#d1d7db] dark:border-[#374248] text-[12px] font-medium"
                  >
                    Idle
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* TAB 2: AUTO-REPLY BOT RULES */}
        {tab === 'bots' && (
          <>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!ruleName.trim() || !rulePattern.trim() || !ruleReply.trim()) return;
                await onSaveRule({
                  name: ruleName.trim(),
                  matchType: ruleMatchType,
                  pattern: rulePattern.trim(),
                  reply: ruleReply.trim(),
                  delayMs: Number(ruleDelay) || 600,
                });
                setRuleName('');
                setRulePattern('');
                setRuleReply('');
              }}
              className="p-3.5 rounded-lg border border-[#e9edef] dark:border-[#2a3942] bg-[#f7f8fa] dark:bg-[#182229] space-y-2.5"
            >
              <div className="text-[13px] font-semibold flex items-center gap-1.5">
                <Bot className="w-4 h-4 text-[#00a884]" /> Add auto-reply rule
              </div>
              <input
                type="text"
                required
                placeholder="Rule name (e.g. OTP Echo)"
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                className="w-full px-3 py-1.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[13px]"
              />
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={ruleMatchType}
                  onChange={(e) =>
                    setRuleMatchType(e.target.value as 'contains' | 'exact' | 'regex')
                  }
                  aria-label="Rule match type"
                  className="px-2 py-1.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[12.5px]"
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
                  className="col-span-2 px-2.5 py-1.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[13px] font-mono"
                />
              </div>
              <textarea
                rows={2}
                required
                placeholder="Automated reply text"
                value={ruleReply}
                onChange={(e) => setRuleReply(e.target.value)}
                className="w-full px-3 py-1.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[13px] resize-none"
              />
              <div className="flex items-center justify-between gap-2">
                <label className="text-[12px] text-[#667781] dark:text-[#8696a0]">
                  Delay (ms):
                </label>
                <input
                  type="number"
                  min={100}
                  step={100}
                  value={ruleDelay}
                  onChange={(e) => setRuleDelay(Number(e.target.value))}
                  className="w-24 px-2 py-1 rounded bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[12.5px] font-mono tabular-nums"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 rounded-md bg-[#00a884] text-white text-[13px] font-semibold hover:bg-[#008f72] flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Save rule
              </button>
            </form>

            <div className="space-y-2.5">
              {autoReplyRules.map((rule) => (
                <div
                  key={rule.id}
                  className="p-3 rounded-lg border border-[#e9edef] dark:border-[#2a3942] space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-[13.5px] font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={(e) =>
                          void onSaveRule({ ...rule, enabled: e.target.checked })
                        }
                        className="accent-[#00a884]"
                      />
                      <span>{rule.name}</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => void onDeleteRule(rule.id)}
                      aria-label={`Delete rule ${rule.name}`}
                      className="p-1 text-[#8696a0] hover:text-[#ea0038]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="text-[11.5px] font-mono text-[#008069] dark:text-[#25d366]">
                    {rule.matchType}: "{rule.pattern}" · {rule.delayMs}ms
                  </div>
                  <p className="text-[12.5px] text-[#54656f] dark:text-[#aebac1]">
                    {rule.reply}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* TAB 3: WEBHOOK DELIVERY LOGS */}
        {tab === 'webhooks' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[12.5px] text-[#667781] dark:text-[#8696a0] truncate pr-2">
                Target: <span className="font-mono">{settings.webhookUrl || 'local log only'}</span>
              </div>
              {webhookLogs.length > 0 && (
                <button
                  type="button"
                  onClick={() => void onClearWebhookLogs()}
                  className="text-[12px] font-semibold text-[#ea0038] hover:underline shrink-0"
                >
                  Clear
                </button>
              )}
            </div>

            {webhookLogs.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <Webhook className="w-7 h-7 mx-auto text-[#8696a0]" />
                <p className="text-[13px] text-[#667781] dark:text-[#8696a0]">
                  No webhook events recorded yet. Send or receive a message to inspect payloads.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {webhookLogs.map((entry) => {
                  const open = expandedLogId === entry.id;
                  return (
                    <div
                      key={entry.id}
                      className="rounded-lg border border-[#e9edef] dark:border-[#2a3942] overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedLogId(open ? null : entry.id)}
                        className="w-full px-3 py-2.5 text-left hover:bg-[#f5f6f6] dark:hover:bg-[#202c33] flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-[12.5px] font-mono font-semibold text-[#111b21] dark:text-[#e9edef] truncate">
                            {entry.event}
                          </div>
                          <div className="text-[11px] font-mono tabular-nums text-[#667781] dark:text-[#8696a0]">
                            {formatTime(entry.timestamp)} ·{' '}
                            {entry.statusCode ? `HTTP ${entry.statusCode}` : 'Local'} ·{' '}
                            {entry.durationMs}ms
                          </div>
                        </div>
                        <span
                          className={`text-[11px] font-semibold shrink-0 ${
                            entry.ok ? 'text-[#00a884]' : 'text-[#ea0038]'
                          }`}
                        >
                          {entry.ok ? 'OK' : 'FAIL'}
                        </span>
                      </button>

                      {open && (
                        <div className="px-3 pb-3 pt-1 bg-[#f7f8fa] dark:bg-[#0b141a] border-t border-[#e9edef] dark:border-[#2a3942]">
                          {entry.error && (
                            <p className="text-[11.5px] text-[#ea0038] mb-1.5 font-mono">
                              {entry.error}
                            </p>
                          )}
                          <pre className="text-[11px] font-mono overflow-x-auto text-[#3b4a54] dark:text-[#aebac1] max-h-48">
                            {JSON.stringify(entry.payload, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: API & INTEGRATION SNIPPETS */}
        {tab === 'api' && (
          <div className="space-y-4">
            <p className="text-[13px] text-[#54656f] dark:text-[#aebac1] leading-relaxed">
              Point any WhatsApp Cloud API client or automated test suite to{' '}
              <code className="font-mono text-[#008069] dark:text-[#25d366]">{baseUrl}</code>.
              WebSocket live stream is available at{' '}
              <code className="font-mono">/ws</code>.
            </p>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold">Cloud API Send (Drop-In)</span>
                <button
                  type="button"
                  onClick={() => void copySnippet('outbound', curlOutbound)}
                  className="inline-flex items-center gap-1 text-[11.5px] text-[#00a884] font-semibold"
                >
                  {copiedKey === 'outbound' ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copy
                    </>
                  )}
                </button>
              </div>
              <pre className="p-2.5 rounded-lg bg-[#111b21] text-[#d1d7db] text-[11px] font-mono overflow-x-auto leading-relaxed">
                {curlOutbound}
              </pre>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold">Simulate Inbound Message</span>
                <button
                  type="button"
                  onClick={() => void copySnippet('inbound', curlInbound)}
                  className="inline-flex items-center gap-1 text-[11.5px] text-[#00a884] font-semibold"
                >
                  {copiedKey === 'inbound' ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copy
                    </>
                  )}
                </button>
              </div>
              <pre className="p-2.5 rounded-lg bg-[#111b21] text-[#d1d7db] text-[11px] font-mono overflow-x-auto leading-relaxed">
                {curlInbound}
              </pre>
            </div>

            <div className="p-3 rounded-lg border border-[#e9edef] dark:border-[#2a3942] space-y-1.5 text-[12px] font-mono">
              <div className="font-sans text-[12.5px] font-semibold mb-1 flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5 text-[#00a884]" /> Endpoints
              </div>
              <div>POST /api/messages/send</div>
              <div>POST /api/messages/receive</div>
              <div>POST /api/messages/:id/receipt</div>
              <div>POST /api/chats/:id/typing</div>
              <div>POST /api/chats/:id/read</div>
              <div>POST /api/reset</div>
              <div>GET &nbsp;/api/webhooks/logs</div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
