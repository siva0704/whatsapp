import { useMemo, useState } from 'react';
import {
  Clock,
  MessageSquare,
  Play,
  Radio,
  Search,
  Send,
} from 'lucide-react';
import type {
  BroadcastCreateRequest,
  BroadcastJob,
  BroadcastRecipientStatus,
  Contact,
  MessageTemplate,
  PhoneNumberConfig,
} from '../../shared/types';
import { ApiRequestError } from '../services/api';
import { formatTime } from '../utils/format';

interface BroadcastsPanelProps {
  broadcasts: BroadcastJob[];
  contacts: Contact[];
  templates: MessageTemplate[];
  phoneNumbers: PhoneNumberConfig[];
  activePhoneNumberId: string;
  onCreateBroadcast: (req: BroadcastCreateRequest) => Promise<BroadcastJob>;
  onDispatchBroadcastNow: (id: string) => Promise<void>;
  onOpenChatByContactId: (contactId: string) => void;
}

export function BroadcastsPanel({
  broadcasts,
  contacts,
  templates,
  phoneNumbers,
  activePhoneNumberId,
  onCreateBroadcast,
  onDispatchBroadcastNow,
  onOpenChatByContactId,
}: BroadcastsPanelProps) {
  const approvedTemplates = useMemo(
    () => templates.filter((t) => t.status === 'APPROVED'),
    [templates]
  );

  const clientContacts = useMemo(() => contacts.filter((c) => !c.isBot), [contacts]);

  const allSegments = useMemo(() => {
    const s = new Set<string>();
    for (const c of clientContacts) {
      for (const t of c.tags || []) s.add(t);
    }
    return Array.from(s).sort();
  }, [clientContacts]);

  // Composer State
  const [name, setName] = useState('');
  const [senderPhoneId, setSenderPhoneId] = useState(activePhoneNumberId);
  const [templateId, setTemplateId] = useState(approvedTemplates[0]?.id || '');
  const [var1, setVar1] = useState('');
  const [var2, setVar2] = useState('');
  const [var3, setVar3] = useState('');
  const [selectorMode, setSelectorMode] = useState<'all' | 'segments' | 'phones'>('all');
  const [selectedSegment, setSelectedSegment] = useState(allSegments[0] || '');
  const [customPhones, setCustomPhones] = useState('');
  const [throughput, setThroughput] = useState(40);
  const [concurrency, setConcurrency] = useState(10);
  const [scheduleMode, setScheduleMode] = useState<'now' | 'delay5' | 'delay15'>('now');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Drill-Down State
  const [selectedJobId, setSelectedJobId] = useState<string | null>(broadcasts[0]?.id || null);
  const [recipientStatusFilter, setRecipientStatusFilter] = useState<
    'all' | BroadcastRecipientStatus
  >('all');
  const [recipientSearch, setRecipientSearch] = useState('');

  const selectedTemplate =
    approvedTemplates.find((t) => t.id === templateId) || approvedTemplates[0];

  const matchedCount = useMemo(() => {
    if (selectorMode === 'all') return clientContacts.length;
    if (selectorMode === 'segments') {
      return clientContacts.filter((c) => (c.tags || []).includes(selectedSegment)).length;
    }
    const phones = customPhones
      .split(/[\s,;]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    return phones.length;
  }, [selectorMode, clientContacts, selectedSegment, customPhones]);

  const activeJob = useMemo(() => {
    if (selectedJobId) {
      const found = broadcasts.find((b) => b.id === selectedJobId);
      if (found) return found;
    }
    return broadcasts[0] || null;
  }, [broadcasts, selectedJobId]);

  const filteredRecipients = useMemo(() => {
    if (!activeJob) return [];
    const q = recipientSearch.trim().toLowerCase();
    return activeJob.recipients.filter((r) => {
      if (recipientStatusFilter !== 'all' && r.status !== recipientStatusFilter) return false;
      if (q) {
        const hay = `${r.name} ${r.phone} ${r.errorCode || ''} ${r.errorDetails || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [activeJob, recipientStatusFilter, recipientSearch]);

  const handleLaunch = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!selectedTemplate) {
      setFormError('Approve at least one template in Business Tools before broadcasting.');
      return;
    }
    setSubmitting(true);
    try {
      const selector: BroadcastCreateRequest['selector'] =
        selectorMode === 'all'
          ? { mode: 'all' }
          : selectorMode === 'segments'
            ? { mode: 'segments', segments: [selectedSegment] }
            : {
                mode: 'phones',
                phones: customPhones
                  .split(/[\s,;]+/)
                  .map((p) => p.trim())
                  .filter(Boolean),
              };

      const job = await onCreateBroadcast({
        name: name.trim() || `Broadcast · ${selectedTemplate.name}`,
        phoneNumberId: senderPhoneId || activePhoneNumberId,
        selector,
        type: 'template',
        templateId: selectedTemplate.id,
        templateVariables: [var1, var2, var3].filter((v) => typeof v === 'string' && v.trim().length > 0),
        throughputPerSec: throughput,
        concurrency,
        delaySeconds: scheduleMode === 'delay5' ? 5 : scheduleMode === 'delay15' ? 15 : undefined,
      });
      setSelectedJobId(job.id);
    } catch (err) {
      if (err instanceof ApiRequestError && err.metaError) {
        setFormError(`#${err.metaError.code} ${err.metaError.title}: ${err.metaError.message}`);
      } else {
        setFormError(err instanceof Error ? err.message : 'Failed to launch broadcast');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const renderedPreview = useMemo(() => {
    if (!selectedTemplate) return '';
    return selectedTemplate.bodyText
      .replace(/\{\{1\}\}/g, var1 || '{{1}}')
      .replace(/\{\{2\}\}/g, var2 || '{{2}}')
      .replace(/\{\{3\}\}/g, var3 || '{{3}}');
  }, [selectedTemplate, var1, var2, var3]);

  return (
    <section
      aria-label="Broadcast campaigns"
      className="flex-1 h-full min-w-0 bg-white dark:bg-[#111b21] flex flex-col overflow-hidden"
    >
      <header className="px-4 md:px-6 py-3.5 pt-safe bg-[#f0f2f5] dark:bg-[#202c33] border-b border-[#d1d7db] dark:border-[#2a3942] flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div>
          <h1 className="text-[19px] font-bold tracking-tight text-[#111b21] dark:text-[#e9edef]">
            Broadcast Campaigns
          </h1>
          <p className="text-[12.5px] text-[#667781] dark:text-[#8696a0] font-mono tabular-nums mt-0.5">
            {broadcasts.length} campaigns · {clientContacts.length} total client recipients available
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto wa-scroll p-4 md:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT: BROADCAST COMPOSER */}
          <form
            onSubmit={handleLaunch}
            className="lg:col-span-5 p-4 rounded-xl border border-[#e9edef] dark:border-[#2a3942] bg-[#f7f8fa] dark:bg-[#182229] space-y-3.5"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-[#111b21] dark:text-[#e9edef]">
                Compose Outbound Broadcast
              </h2>
              <span className="text-[12px] font-mono tabular-nums text-[#008069] dark:text-[#25d366]">
                {matchedCount} matched
              </span>
            </div>

            {formError && (
              <div className="p-2.5 rounded-lg bg-[#ea0038]/10 text-[#b91c1c] dark:text-[#fca5a5] text-[12.5px]">
                {formError}
              </div>
            )}

            <div>
              <label htmlFor="bcast-name" className="block text-[12px] text-[#667781] dark:text-[#8696a0] mb-1">
                Campaign name
              </label>
              <input
                id="bcast-name"
                type="text"
                placeholder="Campaign name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[13.5px]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="bcast-sender" className="block text-[12px] text-[#667781] dark:text-[#8696a0] mb-1">
                  Business sender line
                </label>
                <select
                  id="bcast-sender"
                  value={senderPhoneId}
                  onChange={(e) => setSenderPhoneId(e.target.value)}
                  className="w-full h-10 px-2.5 rounded-lg bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[13px]"
                >
                  {phoneNumbers.length === 0 ? (
                    <option value="">No sender number configured</option>
                  ) : (
                    phoneNumbers.map((pn) => (
                      <option key={pn.id} value={pn.id}>
                        {pn.displayName} ({pn.phoneNumber})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label htmlFor="bcast-template" className="block text-[12px] text-[#667781] dark:text-[#8696a0] mb-1">
                  Approved template
                </label>
                <select
                  id="bcast-template"
                  value={selectedTemplate?.id || ''}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="w-full h-10 px-2.5 rounded-lg bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[13px]"
                >
                  {approvedTemplates.length === 0 ? (
                    <option value="">No approved templates yet</option>
                  ) : (
                    approvedTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.category})
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            {/* Template Variables */}
            <div className="space-y-2">
              <div className="text-[12px] text-[#667781] dark:text-[#8696a0]">
                Variables (supports <span className="font-mono">{'{{first_name}}'}</span>,{' '}
                <span className="font-mono">{'{{country}}'}</span>,{' '}
                <span className="font-mono">{'{{segment}}'}</span>)
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  aria-label="Template variable 1"
                  value={var1}
                  onChange={(e) => setVar1(e.target.value)}
                  placeholder="{{1}}"
                  className="h-9 px-2.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[12.5px] font-mono"
                />
                <input
                  type="text"
                  aria-label="Template variable 2"
                  value={var2}
                  onChange={(e) => setVar2(e.target.value)}
                  placeholder="{{2}}"
                  className="h-9 px-2.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[12.5px] font-mono"
                />
                <input
                  type="text"
                  aria-label="Template variable 3"
                  value={var3}
                  onChange={(e) => setVar3(e.target.value)}
                  placeholder="{{3}}"
                  className="h-9 px-2.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[12.5px] font-mono"
                />
              </div>
              {selectedTemplate?.headerImageUrl && (
                <div className="relative aspect-[16/9] w-full rounded-lg overflow-hidden bg-slate-900 shadow-xs mb-1.5">
                  <img
                    src={selectedTemplate.headerImageUrl}
                    alt="Template Header Banner"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              {renderedPreview && (
                <div className="p-2.5 rounded-lg bg-[#d9fdd3]/60 dark:bg-[#005c4b]/40 text-[12.5px] text-[#111b21] dark:text-[#e9edef] leading-relaxed">
                  {renderedPreview}
                </div>
              )}
            </div>

            {/* Recipient Selector */}
            <div className="space-y-2">
              <div className="text-[12px] text-[#667781] dark:text-[#8696a0]">
                Target audience
              </div>
              <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[#e9edef] dark:bg-[#202c33]">
                {(
                  [
                    { id: 'all', label: 'All Clients' },
                    { id: 'segments', label: 'By Segment' },
                    { id: 'phones', label: 'Phone List' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectorMode(opt.id)}
                    className={`min-h-[34px] py-1.5 rounded-md text-[12px] font-semibold whitespace-nowrap transition-colors ${
                      selectorMode === opt.id
                        ? 'bg-white dark:bg-[#111b21] text-[#008069] dark:text-[#25d366] shadow-xs'
                        : 'text-[#54656f] dark:text-[#aebac1]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {selectorMode === 'segments' && (
                <select
                  value={selectedSegment}
                  onChange={(e) => setSelectedSegment(e.target.value)}
                  aria-label="Target segment"
                  className="w-full h-10 px-3 rounded-lg bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[13px]"
                >
                  {allSegments.length === 0 ? (
                    <option value="">No segments available</option>
                  ) : (
                    allSegments.map((seg) => (
                      <option key={seg} value={seg}>
                        {seg}
                      </option>
                    ))
                  )}
                </select>
              )}

              {selectorMode === 'phones' && (
                <textarea
                  rows={2}
                  value={customPhones}
                  onChange={(e) => setCustomPhones(e.target.value)}
                  placeholder="Comma-separated E.164 phone numbers"
                  aria-label="Custom phone list"
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[12.5px] font-mono resize-none"
                />
              )}
            </div>

            {/* Queue Throughput & Schedule */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label htmlFor="bcast-tput" className="block text-[11.5px] text-[#667781] dark:text-[#8696a0] mb-1">
                  Rate (msg/s)
                </label>
                <input
                  id="bcast-tput"
                  type="number"
                  min={1}
                  max={500}
                  value={throughput}
                  onChange={(e) => setThroughput(Number(e.target.value))}
                  className="w-full h-9 px-2.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[12.5px] font-mono tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="bcast-conc" className="block text-[11.5px] text-[#667781] dark:text-[#8696a0] mb-1">
                  Concurrency
                </label>
                <input
                  id="bcast-conc"
                  type="number"
                  min={1}
                  max={50}
                  value={concurrency}
                  onChange={(e) => setConcurrency(Number(e.target.value))}
                  className="w-full h-9 px-2.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[12.5px] font-mono tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="bcast-sched" className="block text-[11.5px] text-[#667781] dark:text-[#8696a0] mb-1">
                  Schedule
                </label>
                <select
                  id="bcast-sched"
                  value={scheduleMode}
                  onChange={(e) =>
                    setScheduleMode(e.target.value as 'now' | 'delay5' | 'delay15')
                  }
                  className="w-full h-9 px-2 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[12px]"
                >
                  <option value="now">Immediate</option>
                  <option value="delay5">In 5 sec</option>
                  <option value="delay15">In 15 sec</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || matchedCount === 0}
              className="w-full min-h-[42px] py-2.5 rounded-lg bg-[#00a884] text-white text-[13.5px] font-semibold hover:bg-[#008f72] disabled:opacity-50 inline-flex items-center justify-center gap-2 transition-colors"
            >
              {scheduleMode === 'now' ? (
                <>
                  <Send className="w-4 h-4" />
                  {submitting ? 'Launching...' : `Launch Broadcast (${matchedCount})`}
                </>
              ) : (
                <>
                  <Clock className="w-4 h-4" />
                  {submitting ? 'Scheduling...' : `Schedule Broadcast (${matchedCount})`}
                </>
              )}
            </button>
          </form>

          {/* RIGHT: CAMPAIGN MONITOR & PER-RECIPIENT DRILL-DOWN */}
          <div className="lg:col-span-7 space-y-4 min-w-0">
            {broadcasts.length === 0 ? (
              <div className="p-10 text-center border border-[#e9edef] dark:border-[#2a3942] rounded-xl space-y-2">
                <Radio className="w-8 h-8 mx-auto text-[#8696a0]" />
                <p className="text-[14.5px] font-semibold text-[#111b21] dark:text-[#e9edef]">
                  No broadcasts launched yet
                </p>
                <p className="text-[13px] text-[#667781] dark:text-[#8696a0] max-w-md mx-auto">
                  Compose a campaign on the left or send <span className="font-mono">POST /api/broadcasts</span> from your test runner to watch live delivery, read receipts, replies, and Meta error codes stream in.
                </p>
              </div>
            ) : (
              <>
                {/* Recent Campaign Selector Strip */}
                <div className="space-y-2" data-testid="broadcast-jobs-list">
                  {broadcasts.slice(0, 6).map((job) => {
                    const selected = activeJob?.id === job.id;
                    const done = job.totalRecipients - job.counts.queued;
                    const pct =
                      job.totalRecipients > 0
                        ? Math.round((done / job.totalRecipients) * 100)
                        : 0;
                    return (
                      <div
                        key={job.id}
                        className={`p-3.5 rounded-xl border transition-colors ${
                          selected
                            ? 'border-[#00a884] bg-[#f7f8fa] dark:bg-[#182229]'
                            : 'border-[#e9edef] dark:border-[#2a3942] bg-white dark:bg-[#111b21]'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedJobId(job.id)}
                            className="text-left min-w-0 flex-1"
                          >
                            <div className="text-[14px] font-semibold text-[#111b21] dark:text-[#e9edef] truncate">
                              {job.name}
                            </div>
                            <div className="text-[12px] text-[#667781] dark:text-[#8696a0] font-mono tabular-nums mt-0.5">
                              {job.status} · {job.templateName || job.payloadType} · {formatTime(job.createdAt)} · {job.totalRecipients} recipients
                            </div>
                          </button>

                          {job.status === 'scheduled' && (
                            <button
                              type="button"
                              onClick={() => void onDispatchBroadcastNow(job.id)}
                              className="min-h-[34px] px-3 py-1 rounded-md bg-[#00a884] text-white text-[12px] font-semibold hover:bg-[#008f72] inline-flex items-center gap-1 whitespace-nowrap"
                            >
                              <Play className="w-3.5 h-3.5" /> Dispatch Now
                            </button>
                          )}
                        </div>

                        {/* Progress Bar */}
                        <div className="mt-2.5 h-1.5 w-full rounded-full bg-[#e9edef] dark:bg-[#2a3942] overflow-hidden">
                          <div
                            className="h-full bg-[#00a884] transition-all duration-200"
                            style={{ width: `${pct}%` }}
                          />
                        </div>

                        {/* Tabular Counts */}
                        <div className="mt-2 grid grid-cols-3 sm:grid-cols-6 gap-2 text-[12px] font-mono tabular-nums">
                          <div>
                            <span className="text-[#667781] dark:text-[#8696a0]">Queued </span>
                            <span className="font-semibold">{job.counts.queued}</span>
                          </div>
                          <div>
                            <span className="text-[#667781] dark:text-[#8696a0]">Sent </span>
                            <span className="font-semibold">{job.counts.sent}</span>
                          </div>
                          <div>
                            <span className="text-[#667781] dark:text-[#8696a0]">Deliv </span>
                            <span className="font-semibold text-[#008069] dark:text-[#25d366]">
                              {job.counts.delivered}
                            </span>
                          </div>
                          <div>
                            <span className="text-[#667781] dark:text-[#8696a0]">Read </span>
                            <span className="font-semibold text-[#0284c7] dark:text-[#53bdeb]">
                              {job.counts.read}
                            </span>
                          </div>
                          <div>
                            <span className="text-[#667781] dark:text-[#8696a0]">Replies </span>
                            <span className="font-semibold">{job.counts.replied}</span>
                          </div>
                          <div>
                            <span className="text-[#667781] dark:text-[#8696a0]">Failed </span>
                            <span className="font-semibold text-[#ea0038]">
                              {job.counts.failed}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Per-Recipient Drill-Down Table */}
                {activeJob && (
                  <div
                    data-testid="broadcast-drilldown"
                    className="border border-[#e9edef] dark:border-[#2a3942] rounded-xl overflow-hidden"
                  >
                    <div className="p-3.5 bg-[#f7f8fa] dark:bg-[#182229] border-b border-[#e9edef] dark:border-[#2a3942] flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-[14px] font-semibold text-[#111b21] dark:text-[#e9edef]">
                          Recipient Delivery Log · {activeJob.name}
                        </h3>
                        <p className="text-[12px] text-[#667781] dark:text-[#8696a0] font-mono tabular-nums">
                          ID: {activeJob.id} · {activeJob.throughputPerSec} msg/s · concurrency {activeJob.concurrency}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="relative flex items-center">
                          <Search className="w-3.5 h-3.5 text-[#667781] absolute left-2.5 pointer-events-none" />
                          <input
                            type="text"
                            value={recipientSearch}
                            onChange={(e) => setRecipientSearch(e.target.value)}
                            aria-label="Search broadcast recipients"
                            placeholder="Filter phone or error..."
                            className="h-8 pl-8 pr-2.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[12px] w-40"
                          />
                        </div>
                        <select
                          value={recipientStatusFilter}
                          onChange={(e) =>
                            setRecipientStatusFilter(
                              e.target.value as 'all' | BroadcastRecipientStatus
                            )
                          }
                          aria-label="Filter recipient status"
                          className="h-8 px-2 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[12px]"
                        >
                          <option value="all">All ({activeJob.recipients.length})</option>
                          <option value="queued">Queued ({activeJob.counts.queued})</option>
                          <option value="sent">Sent ({activeJob.counts.sent})</option>
                          <option value="delivered">Delivered ({activeJob.counts.delivered})</option>
                          <option value="read">Read ({activeJob.counts.read})</option>
                          <option value="failed">Failed ({activeJob.counts.failed})</option>
                        </select>
                      </div>
                    </div>

                    <div className="overflow-x-auto max-h-[420px] wa-scroll">
                      <table className="w-full text-left border-collapse text-[12.5px]">
                        <thead className="sticky top-0 bg-white dark:bg-[#111b21] border-b border-[#e9edef] dark:border-[#2a3942] text-[#667781] dark:text-[#8696a0]">
                          <tr>
                            <th className="py-2 px-3 font-semibold">Client</th>
                            <th className="py-2 px-3 font-semibold">Status</th>
                            <th className="py-2 px-3 font-semibold">Details / Reply</th>
                            <th className="py-2 px-3 font-semibold text-right">Thread</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#f0f2f5] dark:divide-[#202c33]">
                          {filteredRecipients.slice(0, 120).map((rec) => (
                            <tr
                              key={rec.contactId}
                              className="hover:bg-[#f5f6f6] dark:hover:bg-[#182229]"
                            >
                              <td className="py-2 px-3">
                                <div className="font-medium text-[#111b21] dark:text-[#e9edef]">
                                  {rec.name}
                                </div>
                                <div className="text-[11.5px] font-mono tabular-nums text-[#667781] dark:text-[#8696a0]">
                                  {rec.phone}
                                </div>
                              </td>
                              <td className="py-2 px-3 whitespace-nowrap font-mono font-semibold">
                                <span
                                  className={
                                    rec.status === 'failed'
                                      ? 'text-[#ea0038]'
                                      : rec.status === 'read'
                                        ? 'text-[#0284c7] dark:text-[#53bdeb]'
                                        : rec.status === 'delivered'
                                          ? 'text-[#008069] dark:text-[#25d366]'
                                          : 'text-[#667781] dark:text-[#8696a0]'
                                  }
                                >
                                  {rec.status}
                                </span>
                              </td>
                              <td className="py-2 px-3 max-w-[260px]">
                                {rec.errorCode ? (
                                  <div className="text-[#ea0038] text-[12px]">
                                    <span className="font-mono font-semibold">#{rec.errorCode}</span>{' '}
                                    {rec.errorDetails || rec.errorTitle}
                                  </div>
                                ) : rec.replyPreview ? (
                                  <div className="text-[#008069] dark:text-[#25d366] text-[12px] truncate">
                                    Replied: &ldquo;{rec.replyPreview}&rdquo;
                                  </div>
                                ) : (
                                  <span className="text-[#8696a0] font-mono text-[11.5px]">
                                    {rec.messageId ? rec.messageId.slice(0, 18) : '—'}
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => onOpenChatByContactId(rec.contactId)}
                                  aria-label={`Open chat with ${rec.name}`}
                                  className="px-2.5 py-1 rounded border border-[#d1d7db] dark:border-[#374248] text-[11.5px] font-medium hover:border-[#00a884] inline-flex items-center gap-1 whitespace-nowrap"
                                >
                                  <MessageSquare className="w-3 h-3" /> Open
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
