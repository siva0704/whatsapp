import { useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Check,
  Copy,
  Download,
  Play,
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
  InteractivePayload,
  LocationPayload,
  MessageTemplate,
  MessageType,
  OrderPayload,
  PhoneNumberConfig,
  WebhookLogEntry,
} from '../../shared/types';
import { ApiRequestError } from '../services/api';
import { formatTime } from '../utils/format';

type QaTab = 'scenarios' | 'simulate' | 'bots' | 'webhooks' | 'api';

type InboundPresetType =
  | 'text'
  | 'interactive_button'
  | 'interactive_list'
  | 'location'
  | 'order'
  | 'sticker'
  | 'video'
  | 'voice'
  | 'image'
  | 'document';

interface ScenarioStepLog {
  step: string;
  ok: boolean;
  detail: string;
}

interface QaConsolePanelProps {
  contacts: Contact[];
  chats: Chat[];
  templates: MessageTemplate[];
  phoneNumbers: PhoneNumberConfig[];
  selectedChatId: string | null;
  autoReplyRules: AutoReplyRule[];
  webhookLogs: WebhookLogEntry[];
  settings: EmulatorSettings;
  onSelectChat: (chatId: string) => void;
  onSwitchVariant: (variant: 'personal' | 'business') => Promise<void>;
  onSimulateInbound: (payload: {
    chatId?: string;
    phoneNumberId?: string;
    fromPhone?: string;
    fromName?: string;
    senderId?: string;
    body?: string;
    type: MessageType;
    location?: LocationPayload;
    interactive?: InteractivePayload;
    order?: OrderPayload;
  }) => Promise<void>;
  onSendMessage: (payload: {
    chatId?: string;
    body?: string;
    type?: MessageType;
    templateId?: string;
    templateVariables?: string[];
    interactive?: InteractivePayload;
    simulateErrorCode?: number;
  }) => Promise<void>;
  onSimulateTyping: (chatId: string, isTyping: boolean, mode: 'typing' | 'recording') => Promise<void>;
  onSaveRule: (rule: Partial<AutoReplyRule> & { name: string; pattern: string; reply: string }) => Promise<void>;
  onDeleteRule: (id: string) => Promise<void>;
  onClearWebhookLogs: () => Promise<void>;
}

export function QaConsolePanel({
  contacts,
  chats,
  templates,
  phoneNumbers,
  selectedChatId,
  autoReplyRules,
  webhookLogs,
  settings,
  onSelectChat,
  onSwitchVariant,
  onSimulateInbound,
  onSendMessage,
  onSimulateTyping,
  onSaveRule,
  onDeleteRule,
  onClearWebhookLogs,
}: QaConsolePanelProps) {
  const [tab, setTab] = useState<QaTab>('scenarios');

  // Scenario Runner state
  const [runningScenario, setRunningScenario] = useState<string | null>(null);
  const [scenarioLogs, setScenarioLogs] = useState<ScenarioStepLog[]>([]);

  // Inbound Simulator state
  const [targetMode, setTargetMode] = useState<'existing' | 'new'>('existing');
  const [selectedContactId, setSelectedContactId] = useState(contacts[0]?.id || '');
  const [newPhone, setNewPhone] = useState('+14155550177');
  const [newName, setNewName] = useState('External QA Peer');
  const [presetType, setPresetType] = useState<InboundPresetType>('text');
  const [inboundBody, setInboundBody] = useState('');
  const [interactiveId, setInteractiveId] = useState('btn_confirm');
  const [interactiveTitle, setInteractiveTitle] = useState('Confirm Order');
  const [sentNotice, setSentNotice] = useState<string | null>(null);
  const [inboundError, setInboundError] = useState<string | null>(null);

  // Bot Rule form state
  const [ruleName, setRuleName] = useState('');
  const [ruleMatchType, setRuleMatchType] = useState<'contains' | 'exact' | 'regex'>('contains');
  const [rulePattern, setRulePattern] = useState('');
  const [ruleReply, setRuleReply] = useState('');
  const [ruleDelay, setRuleDelay] = useState(650);

  // Webhook log expansion + filter
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [webhookPhoneFilter, setWebhookPhoneFilter] = useState<string>('all');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const activeChat = chats.find((c) => c.id === selectedChatId) || chats[0];
  const approvedTemplate = templates.find((t) => t.status === 'APPROVED');

  const appendLog = (entry: ScenarioStepLog) => {
    setScenarioLogs((prev) => [...prev, entry]);
  };

  // Scenario 1: Opt-In / Opt-Out Full Lifecycle
  const runOptInScenario = async () => {
    setRunningScenario('optin');
    setScenarioLogs([]);
    try {
      await onSwitchVariant('business');
      const targetChat = chats.find((c) => c.id === 'chat-alex') || activeChat;
      const targetContact = contacts.find((c) => c.id === targetChat?.contactId) || contacts[0];
      if (!targetChat || !targetContact) throw new Error('No direct chat found');
      onSelectChat(targetChat.id);

      appendLog({ step: '1. Inbound STOP keyword', ok: true, detail: `${targetContact.name} sends "STOP"` });
      await onSimulateInbound({
        senderId: targetContact.id,
        fromPhone: targetContact.phone,
        fromName: targetContact.name,
        body: 'STOP',
        type: 'text',
      });

      if (approvedTemplate) {
        try {
          await onSendMessage({
            chatId: targetChat.id,
            type: 'template',
            templateId: approvedTemplate.id,
            templateVariables: approvedTemplate.sampleValues,
          });
          appendLog({ step: '2. Business template while opted out', ok: false, detail: 'Expected #131049 rejection' });
        } catch (err) {
          const code = err instanceof ApiRequestError ? err.metaError?.code : undefined;
          appendLog({
            step: '2. Business template blocked',
            ok: code === 131049,
            detail: code ? `Rejected with Meta #${code} (Opted Out)` : String(err),
          });
        }
      }

      await onSendMessage({
        chatId: targetChat.id,
        type: 'text',
        body: 'You have been unsubscribed from automated alerts. Reply START anytime to opt back in.',
      });
      appendLog({ step: '3. Session reply still allowed', ok: true, detail: 'Delivered within 24h window' });

      await onSimulateInbound({
        senderId: targetContact.id,
        fromPhone: targetContact.phone,
        fromName: targetContact.name,
        body: 'START',
        type: 'text',
      });
      appendLog({ step: '4. Inbound START keyword', ok: true, detail: 'Opt-in status restored to opted_in' });

      if (approvedTemplate) {
        await onSendMessage({
          chatId: targetChat.id,
          type: 'template',
          templateId: approvedTemplate.id,
          templateVariables: approvedTemplate.sampleValues,
        });
        appendLog({ step: '5. Template send after re-opt-in', ok: true, detail: `Sent "${approvedTemplate.name}"` });
      }
    } catch (err) {
      appendLog({ step: 'Error', ok: false, detail: err instanceof Error ? err.message : String(err) });
    } finally {
      setRunningScenario(null);
    }
  };

  // Scenario 2: 24-Hour Customer Service Window Enforcement
  const run24hWindowScenario = async () => {
    setRunningScenario('24h');
    setScenarioLogs([]);
    try {
      await onSwitchVariant('business');
      const elenaChat = chats.find((c) => c.id === 'chat-elena') || activeChat;
      if (!elenaChat) throw new Error('No chat available');
      onSelectChat(elenaChat.id);

      try {
        await onSendMessage({
          chatId: elenaChat.id,
          type: 'text',
          body: 'Checking in outside the 24h window',
        });
        appendLog({
          step: '1. Free-form outside 24h',
          ok: false,
          detail: 'Window may already be open — expire window in Contact Info to re-test',
        });
      } catch (err) {
        const code = err instanceof ApiRequestError ? err.metaError?.code : undefined;
        appendLog({
          step: '1. Free-form rejected outside 24h',
          ok: code === 131047,
          detail: code ? `Rejected with Meta #${code} (Re-engagement required)` : String(err),
        });
      }

      if (approvedTemplate) {
        await onSendMessage({
          chatId: elenaChat.id,
          type: 'template',
          templateId: approvedTemplate.id,
          templateVariables: approvedTemplate.sampleValues,
        });
        appendLog({
          step: '2. Approved template sent',
          ok: true,
          detail: `Re-engaged with "${approvedTemplate.name}"`,
        });
      }

      const contact = contacts.find((c) => c.id === elenaChat.contactId);
      if (contact) {
        await onSimulateInbound({
          senderId: contact.id,
          fromPhone: contact.phone,
          fromName: contact.name,
          body: 'Thanks! Please send me the updated invoice link.',
          type: 'text',
        });
        appendLog({ step: '3. Customer replied', ok: true, detail: '24h customer service window re-opened' });

        await onSendMessage({
          chatId: elenaChat.id,
          type: 'text',
          body: 'Window is open again! Here is your link: https://acme-roasters.example/invoice/4821',
        });
        appendLog({ step: '4. Free-form reply with link preview', ok: true, detail: 'Accepted inside 24h window' });
      }
    } catch (err) {
      appendLog({ step: 'Error', ok: false, detail: err instanceof Error ? err.message : String(err) });
    } finally {
      setRunningScenario(null);
    }
  };

  // Scenario 3: Send Rich Template + Interactive Buttons
  const runRichMessageScenario = async () => {
    setRunningScenario('rich');
    setScenarioLogs([]);
    try {
      await onSwitchVariant('business');
      const targetChat = chats.find((c) => c.id === 'chat-alex') || activeChat;
      if (!targetChat) throw new Error('No chat selected');
      onSelectChat(targetChat.id);

      if (approvedTemplate) {
        await onSendMessage({
          chatId: targetChat.id,
          type: 'template',
          templateId: approvedTemplate.id,
          templateVariables: approvedTemplate.sampleValues,
        });
        appendLog({ step: '1. Approved template sent', ok: true, detail: approvedTemplate.name });
      }

      await onSendMessage({
        chatId: targetChat.id,
        type: 'interactive',
        interactive: {
          kind: 'button',
          headerText: 'Delivery Slot Confirmation',
          bodyText: 'Choose your preferred courier window for order #ORD-4821:',
          footerText: 'Acme Coffee Roasters',
          buttons: [
            { id: 'slot_am', title: 'Morning (9am–12pm)' },
            { id: 'slot_pm', title: 'Afternoon (2pm–5pm)' },
          ],
        },
      });
      appendLog({ step: '2. Interactive reply buttons sent', ok: true, detail: 'Tap any button in thread to simulate customer reply' });
    } catch (err) {
      appendLog({ step: 'Error', ok: false, detail: err instanceof Error ? err.message : String(err) });
    } finally {
      setRunningScenario(null);
    }
  };

  // Scenario 4: Simulate Failed Message Error Codes (131026 / 131047 / 131049)
  const runErrorCodeSimulation = async (code: number) => {
    if (!activeChat) return;
    setRunningScenario(`err-${code}`);
    try {
      await onSendMessage({
        chatId: activeChat.id,
        type: 'text',
        body: `[QA Failure Simulation] Triggering Meta error #${code}`,
        simulateErrorCode: code,
      });
      setScenarioLogs([
        {
          step: `Simulated Meta error #${code}`,
          ok: true,
          detail: 'Message marked failed & status webhook dispatched',
        },
      ]);
    } catch (err) {
      setScenarioLogs([
        {
          step: `Error #${code}`,
          ok: false,
          detail: err instanceof Error ? err.message : String(err),
        },
      ]);
    } finally {
      setRunningScenario(null);
    }
  };

  const handleInjectInbound = async (e: React.FormEvent) => {
    e.preventDefault();
    setInboundError(null);

    const contact = contacts.find((c) => c.id === selectedContactId) || contacts[0];
    const baseTarget =
      targetMode === 'existing'
        ? {
            senderId: contact?.id,
            fromPhone: contact?.phone,
            fromName: contact?.name,
          }
        : {
            fromPhone: newPhone.trim(),
            fromName: newName.trim() || newPhone.trim(),
          };

    try {
      if (presetType === 'interactive_button' || presetType === 'interactive_list') {
        await onSimulateInbound({
          ...baseTarget,
          type: 'interactive',
          body: interactiveTitle.trim() || 'Button clicked',
          interactive: {
            kind: presetType === 'interactive_button' ? 'button_reply' : 'list_reply',
            bodyText: interactiveTitle.trim() || 'Button clicked',
            selectedId: interactiveId.trim() || 'btn_1',
            selectedTitle: interactiveTitle.trim() || 'Confirm',
          },
        });
      } else if (presetType === 'location') {
        await onSimulateInbound({
          ...baseTarget,
          type: 'location',
          body: inboundBody.trim() || 'Ferry Building, San Francisco',
          location: {
            latitude: 37.7955,
            longitude: -122.3937,
            name: inboundBody.trim() || 'Ferry Building Marketplace',
            address: '1 Ferry Building, San Francisco, CA',
          },
        });
      } else if (presetType === 'order') {
        await onSimulateInbound({
          ...baseTarget,
          type: 'order',
          body: 'Customer submitted cart order',
          order: {
            orderId: `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
            currency: 'USD',
            totalAmount: '64.00',
            note: inboundBody.trim() || 'Leave at front desk',
            items: [
              {
                productId: 'cat-1',
                sku: 'ACM-ESP-01',
                name: 'Single-Origin Espresso Kit',
                quantity: 1,
                unitPrice: '42.00',
                currency: 'USD',
              },
              {
                productId: 'cat-2',
                sku: 'ACM-COL-12',
                name: 'Cold Brew Concentrate (1L)',
                quantity: 1,
                unitPrice: '22.00',
                currency: 'USD',
              },
            ],
          },
        });
      } else if (presetType === 'sticker') {
        await onSimulateInbound({
          ...baseTarget,
          type: 'sticker',
          body: inboundBody.trim() || '🎉',
        });
      } else {
        const text =
          inboundBody.trim() ||
          (presetType === 'voice'
            ? 'Voice message (0:09)'
            : presetType === 'video'
              ? 'Customer demo clip'
              : '');
        if (!text) return;
        await onSimulateInbound({
          ...baseTarget,
          body: text,
          type: presetType as MessageType,
        });
      }

      setInboundBody('');
      setSentNotice('Injected');
      setTimeout(() => setSentNotice(null), 1800);
    } catch (err) {
      if (err instanceof ApiRequestError && err.metaError) {
        setInboundError(`#${err.metaError.code} ${err.metaError.title}: ${err.metaError.message}`);
      } else {
        setInboundError(err instanceof Error ? err.message : 'Inbound simulation failed');
      }
    }
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

  const filteredWebhookLogs =
    webhookPhoneFilter === 'all'
      ? webhookLogs
      : webhookLogs.filter((l) => l.phoneNumberId === webhookPhoneFilter);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const curlTemplate = `curl -X POST ${baseUrl}/v19.0/${settings.activePhoneNumberId}/messages \\
  -H "Authorization: Bearer wa-sim-local-dev-token" \\
  -H "Content-Type: application/json" \\
  -d '{"messaging_product":"whatsapp","to":"+14155550164","type":"template","template":{"name":"order_shipped_update","language":{"code":"en_US"},"components":[{"type":"body","parameters":[{"type":"text","text":"Elena"},{"type":"text","text":"ORD-9021"}]}]}}'`;

  const curlInbound = `curl -X POST ${baseUrl}/api/messages/receive \\
  -H "Authorization: Bearer wa-sim-local-dev-token" \\
  -H "Content-Type: application/json" \\
  -d '{"fromPhone":"+14155550142","type":"interactive","interactive":{"kind":"button_reply","selectedId":"slot_am","selectedTitle":"Morning (9am-12pm)"}}'`;

  return (
    <aside
      aria-label="QA Test Console"
      className="w-full md:w-[395px] lg:w-[430px] shrink-0 h-full bg-white dark:bg-[#111b21] border-r border-[#e9edef] dark:border-[#222d34] flex flex-col min-w-0"
    >
      <header className="h-[58px] md:h-[60px] px-4 pt-safe bg-[#f0f2f5] dark:bg-[#202c33] border-b border-[#d1d7db] dark:border-[#2a3942] flex items-center justify-between shrink-0">
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
        className="px-2.5 py-2 bg-[#f7f8fa] dark:bg-[#182229] border-b border-[#e9edef] dark:border-[#2a3942] grid grid-cols-5 gap-1 shrink-0"
      >
        {(
          [
            { id: 'scenarios', label: 'Runners' },
            { id: 'simulate', label: 'Inbound' },
            { id: 'bots', label: `Bots` },
            { id: 'webhooks', label: `Hooks` },
            { id: 'api', label: 'API' },
          ] as { id: QaTab; label: string }[]
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`min-h-[34px] py-1.5 px-1.5 rounded-md text-[11.5px] font-semibold whitespace-nowrap transition-colors ${
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
        {/* TAB 0: ONE-CLICK SCENARIO RUNNERS */}
        {tab === 'scenarios' && (
          <div className="space-y-3.5">
            <p className="text-[12.5px] text-[#667781] dark:text-[#8696a0] leading-relaxed">
              Execute deterministic end-to-end compliance &amp; Meta Cloud API scenarios with one click.
            </p>

            <div className="space-y-2.5">
              <div className="p-3 rounded-lg border border-[#e9edef] dark:border-[#2a3942] bg-[#f7f8fa] dark:bg-[#182229] space-y-2">
                <div className="text-[13.5px] font-semibold">1. Opt-In / Opt-Out Lifecycle</div>
                <p className="text-[12px] text-[#667781] dark:text-[#8696a0]">
                  Injects <span className="font-mono">STOP</span> → verifies template blocked (#131049) → confirms session reply works → injects <span className="font-mono">START</span> → verifies template succeeds.
                </p>
                <button
                  type="button"
                  disabled={runningScenario !== null}
                  onClick={() => void runOptInScenario()}
                  className="w-full min-h-[38px] py-2 rounded-md bg-[#00a884] text-white text-[12.5px] font-semibold hover:bg-[#008f72] disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" />
                  {runningScenario === 'optin' ? 'Running...' : 'Run Opt-In / Opt-Out Lifecycle'}
                </button>
              </div>

              <div className="p-3 rounded-lg border border-[#e9edef] dark:border-[#2a3942] bg-[#f7f8fa] dark:bg-[#182229] space-y-2">
                <div className="text-[13.5px] font-semibold">2. 24-Hour Window Enforcement</div>
                <p className="text-[12px] text-[#667781] dark:text-[#8696a0]">
                  Targets Elena (expired 24h) → verifies free-form rejected (#131047) → sends approved template → simulates reply → sends free-form with link preview.
                </p>
                <button
                  type="button"
                  disabled={runningScenario !== null}
                  onClick={() => void run24hWindowScenario()}
                  className="w-full min-h-[38px] py-2 rounded-md bg-[#00a884] text-white text-[12.5px] font-semibold hover:bg-[#008f72] disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" />
                  {runningScenario === '24h' ? 'Running...' : 'Run 24h Window Scenario'}
                </button>
              </div>

              <div className="p-3 rounded-lg border border-[#e9edef] dark:border-[#2a3942] bg-[#f7f8fa] dark:bg-[#182229] space-y-2">
                <div className="text-[13.5px] font-semibold">3. Template &amp; Interactive Card</div>
                <p className="text-[12px] text-[#667781] dark:text-[#8696a0]">
                  Dispatches an approved template plus an interactive reply-button card into the active thread.
                </p>
                <button
                  type="button"
                  disabled={runningScenario !== null}
                  onClick={() => void runRichMessageScenario()}
                  className="w-full min-h-[38px] py-2 rounded-md border border-[#00a884] text-[#008069] dark:text-[#25d366] text-[12.5px] font-semibold hover:bg-[#00a884]/10 disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" />
                  {runningScenario === 'rich' ? 'Running...' : 'Send Template + Interactive'}
                </button>
              </div>

              <div className="p-3 rounded-lg border border-[#e9edef] dark:border-[#2a3942] space-y-2">
                <div className="text-[13px] font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-[#ea0038]" /> Simulate Failed Meta Error Codes
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { code: 131026, label: '131026 Undeliv.' },
                    { code: 131047, label: '131047 24h Exp.' },
                    { code: 131049, label: '131049 Opt-Out' },
                  ].map((item) => (
                    <button
                      key={item.code}
                      type="button"
                      disabled={runningScenario !== null}
                      onClick={() => void runErrorCodeSimulation(item.code)}
                      className="py-2 px-1.5 rounded-md border border-[#ea0038]/40 text-[#ea0038] text-[11px] font-mono font-semibold hover:bg-[#ea0038]/10"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Scenario Execution Log */}
            {scenarioLogs.length > 0 && (
              <div
                data-testid="scenario-results"
                className="p-3 rounded-lg bg-[#111b21] text-[#e9edef] space-y-1.5 font-mono text-[11.5px]"
              >
                <div className="text-[11px] text-[#8696a0] uppercase tracking-wider">
                  Scenario Output
                </div>
                {scenarioLogs.map((log, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className={log.ok ? 'text-[#25d366]' : 'text-[#f87171]'}>
                      {log.ok ? 'PASS' : 'WARN'}
                    </span>
                    <div className="min-w-0">
                      <div className="font-semibold">{log.step}</div>
                      <div className="text-[#aebac1]">{log.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
                  <span className="text-[12px] font-semibold text-[#00a884]">{sentNotice}</span>
                )}
              </div>

              {inboundError && (
                <div className="p-2 rounded bg-[#ea0038]/10 text-[#b91c1c] dark:text-[#fca5a5] text-[12px]">
                  {inboundError}
                </div>
              )}

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
                      Phone (E.164)
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
                  Inbound payload type
                </label>
                <select
                  value={presetType}
                  onChange={(e) => setPresetType(e.target.value as InboundPresetType)}
                  aria-label="Inbound message type"
                  className="w-full px-3 py-1.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[13px]"
                >
                  <option value="text">Text message (supports STOP / START)</option>
                  <option value="interactive_button">Interactive button / Quick-reply click</option>
                  <option value="interactive_list">Interactive list row selection</option>
                  <option value="location">Location pin</option>
                  <option value="order">Customer order cart</option>
                  <option value="sticker">Sticker</option>
                  <option value="video">Video clip</option>
                  <option value="voice">Voice note (0:09)</option>
                  <option value="image">Image with caption</option>
                  <option value="document">PDF document</option>
                </select>
              </div>

              {(presetType === 'interactive_button' || presetType === 'interactive_list') ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11.5px] text-[#667781] dark:text-[#8696a0] mb-1">
                      Payload ID
                    </label>
                    <input
                      type="text"
                      value={interactiveId}
                      onChange={(e) => setInteractiveId(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[12.5px] font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11.5px] text-[#667781] dark:text-[#8696a0] mb-1">
                      Selected Title
                    </label>
                    <input
                      type="text"
                      value={interactiveTitle}
                      onChange={(e) => setInteractiveTitle(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[12.5px]"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-[11.5px] text-[#667781] dark:text-[#8696a0] mb-1">
                    Payload text / caption / note
                  </label>
                  <textarea
                    rows={2}
                    required={presetType === 'text'}
                    placeholder="e.g. STOP, START, or Where is my order #ORD-4821?"
                    value={inboundBody}
                    onChange={(e) => setInboundBody(e.target.value)}
                    className="w-full px-3 py-2 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[13.5px] resize-none"
                  />
                </div>
              )}

              <button
                type="submit"
                className="w-full min-h-[40px] py-2 rounded-md bg-[#00a884] text-white text-[13.5px] font-semibold hover:bg-[#008f72] flex items-center justify-center gap-2"
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
                    className="py-2 px-2 rounded-md bg-[#f0f2f5] dark:bg-[#202c33] text-[12px] font-medium hover:bg-[#e5e8ec] dark:hover:bg-[#2a3942]"
                  >
                    Typing...
                  </button>
                  <button
                    type="button"
                    onClick={() => void onSimulateTyping(activeChat.id, true, 'recording')}
                    className="py-2 px-2 rounded-md bg-[#f0f2f5] dark:bg-[#202c33] text-[12px] font-medium hover:bg-[#e5e8ec] dark:hover:bg-[#2a3942]"
                  >
                    Recording
                  </button>
                  <button
                    type="button"
                    onClick={() => void onSimulateTyping(activeChat.id, false, 'typing')}
                    className="py-2 px-2 rounded-md border border-[#d1d7db] dark:border-[#374248] text-[12px] font-medium"
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
                    {rule.matchType}: &quot;{rule.pattern}&quot; · {rule.delayMs}ms
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
            <div className="flex items-center justify-between gap-2">
              <select
                value={webhookPhoneFilter}
                onChange={(e) => setWebhookPhoneFilter(e.target.value)}
                aria-label="Filter webhook logs by phone number"
                className="flex-1 min-w-0 px-2.5 py-1.5 rounded-md bg-[#f0f2f5] dark:bg-[#202c33] text-[12px] font-mono"
              >
                <option value="all">All numbers ({webhookLogs.length})</option>
                {phoneNumbers.map((pn) => (
                  <option key={pn.id} value={pn.id}>
                    {pn.id}
                  </option>
                ))}
              </select>
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

            {filteredWebhookLogs.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <Webhook className="w-7 h-7 mx-auto text-[#8696a0]" />
                <p className="text-[13px] text-[#667781] dark:text-[#8696a0]">
                  No webhook events recorded yet. Run a scenario or send a message to inspect Meta Cloud API envelopes.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredWebhookLogs.map((entry) => {
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
                          <div className="text-[11px] font-mono tabular-nums text-[#667781] dark:text-[#8696a0] truncate">
                            {formatTime(entry.timestamp)} · {entry.phoneNumberId || 'default'} ·{' '}
                            {entry.statusCode ? `HTTP ${entry.statusCode}` : 'Local'}
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
                        <div className="px-3 pb-3 pt-1.5 bg-[#f7f8fa] dark:bg-[#0b141a] border-t border-[#e9edef] dark:border-[#2a3942] space-y-1.5">
                          {entry.signatureHeader && (
                            <div className="text-[10.5px] font-mono text-[#008069] dark:text-[#25d366] break-all">
                              X-Hub-Signature-256: {entry.signatureHeader}
                            </div>
                          )}
                          {entry.error && (
                            <p className="text-[11.5px] text-[#ea0038] font-mono">{entry.error}</p>
                          )}
                          <pre className="text-[11px] font-mono overflow-x-auto text-[#3b4a54] dark:text-[#aebac1] max-h-52">
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
              Drop-in Meta Cloud API base URL:{' '}
              <code className="font-mono text-[#008069] dark:text-[#25d366]">{baseUrl}</code>.
            </p>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold">Cloud API Template Send</span>
                <button
                  type="button"
                  onClick={() => void copySnippet('outbound', curlTemplate)}
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
                {curlTemplate}
              </pre>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold">Simulate Interactive Reply</span>
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

            <div className="p-3 rounded-lg border border-[#e9edef] dark:border-[#2a3942] space-y-1 text-[11.5px] font-mono">
              <div className="font-sans text-[12.5px] font-semibold mb-1 flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5 text-[#00a884]" /> Key Endpoints
              </div>
              <div>POST /v19.0/:phoneNumberId/messages</div>
              <div>POST /v19.0/:phoneNumberId/media</div>
              <div>GET &nbsp;/v19.0/:mediaId</div>
              <div>POST /api/messages/receive</div>
              <div>POST /api/contacts/:id/opt-in</div>
              <div>POST /api/contacts/:id/block</div>
              <div>GET &nbsp;/api/chats/:chatId/window</div>
              <div>POST /api/templates</div>
              <div>GET &nbsp;/api/conversations/pricing</div>
              <div>GET &nbsp;/api/phone-numbers</div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
