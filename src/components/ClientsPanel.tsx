import { useMemo, useState } from 'react';
import {
  MessageSquare,
  Search,
  Send,
  ShieldBan,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type {
  BulkSeedRequest,
  ClientPersonality,
  ClientResponseSimulationRequest,
  Contact,
  OptInStatus,
} from '../../shared/types';
import { Avatar } from './Avatar';

interface ClientsPanelProps {
  contacts: Contact[];
  onBulkSeed: (req: BulkSeedRequest) => Promise<{ seededCount: number }>;
  onOpenChat: (contact: Contact) => void;
  onUpdateContact: (
    contactId: string,
    patch: Partial<Pick<Contact, 'personality' | 'disabled' | 'invalidNumber' | 'tags'>>
  ) => Promise<void>;
  onSetOptIn: (contactId: string, status: OptInStatus) => Promise<void>;
  onSimulateResponse: (req: ClientResponseSimulationRequest) => Promise<void>;
}

const PERSONALITY_LABELS: Record<ClientPersonality, string> = {
  engaged: 'Engaged replier',
  button_clicker: 'Button clicker',
  catalog_browser: 'Catalog browser',
  quick_opt_out: 'Quick opt-out (STOP)',
  custom_keyword: 'Custom keyword',
  silent: 'Silent (receipts only)',
};

export function ClientsPanel({
  contacts,
  onBulkSeed,
  onOpenChat,
  onUpdateContact,
  onSetOptIn,
  onSimulateResponse,
}: ClientsPanelProps) {
  const [search, setSearch] = useState('');
  const [segmentFilter, setSegmentFilter] = useState('all');
  const [optInFilter, setOptInFilter] = useState<'all' | OptInStatus>('all');
  const [personalityFilter, setPersonalityFilter] = useState<'all' | ClientPersonality>('all');
  const [visibleCount, setVisibleCount] = useState(40);

  // Bulk Seed Form State
  const [showSeedForm, setShowSeedForm] = useState(false);
  const [seedCount, setSeedCount] = useState(50);
  const [seedSegments, setSeedSegments] = useState('');
  const [seedInvalidPct, setSeedInvalidPct] = useState(7);
  const [seedOptOutPct, setSeedOptOutPct] = useState(6);
  const [clearPrev, setClearPrev] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const clientContacts = useMemo(() => contacts.filter((c) => !c.isBot), [contacts]);

  const allSegments = useMemo(() => {
    const set = new Set<string>();
    for (const c of clientContacts) {
      for (const t of c.tags || []) set.add(t);
    }
    return Array.from(set).sort();
  }, [clientContacts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clientContacts.filter((c) => {
      if (segmentFilter !== 'all' && !(c.tags || []).includes(segmentFilter)) return false;
      if (optInFilter !== 'all' && c.optInStatus !== optInFilter) return false;
      if (personalityFilter !== 'all' && (c.personality || 'silent') !== personalityFilter) return false;
      if (q) {
        const hay = `${c.name} ${c.phone} ${c.country || ''} ${(c.tags || []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [clientContacts, search, segmentFilter, optInFilter, personalityFilter]);

  const stats = useMemo(() => {
    let optedIn = 0;
    let optedOut = 0;
    let invalidOrDisabled = 0;
    for (const c of clientContacts) {
      if (c.optInStatus === 'opted_in') optedIn++;
      else if (c.optInStatus === 'opted_out') optedOut++;
      if (c.invalidNumber || c.disabled || c.blocked) invalidOrDisabled++;
    }
    return { total: clientContacts.length, optedIn, optedOut, invalidOrDisabled };
  }, [clientContacts]);

  const runSeed = async (e: React.FormEvent) => {
    e.preventDefault();
    setSeeding(true);
    try {
      const segs = seedSegments
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const res = await onBulkSeed({
        count: seedCount,
        seed: Date.now() % 1000000,
        segments: segs.length > 0 ? segs : undefined,
        invalidPct: seedInvalidPct,
        optOutPct: seedOptOutPct,
        clearPreviousSeeded: clearPrev,
      });
      setNotice(`Seeded ${res.seededCount} simulated client numbers.`);
      setShowSeedForm(false);
      setTimeout(() => setNotice(null), 3500);
    } finally {
      setSeeding(false);
    }
  };

  const quickSeedPreset = async (count: number) => {
    setSeeding(true);
    try {
      const res = await onBulkSeed({
        count,
        seed: 202604 + count,
        invalidPct: 5,
        optOutPct: 6,
      });
      setNotice(`Added ${res.seededCount} simulated client numbers.`);
      setTimeout(() => setNotice(null), 3500);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <section
      aria-label="Simulated client numbers"
      className="flex-1 h-full min-w-0 bg-white dark:bg-[#111b21] flex flex-col overflow-hidden"
    >
      {/* Top Bar */}
      <header className="px-4 md:px-6 py-3.5 pt-safe bg-[#f0f2f5] dark:bg-[#202c33] border-b border-[#d1d7db] dark:border-[#2a3942] flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <h1 className="text-[19px] font-bold tracking-tight text-[#111b21] dark:text-[#e9edef] truncate">
            Simulated Client Numbers
          </h1>
          <p className="text-[12.5px] text-[#667781] dark:text-[#8696a0] font-mono tabular-nums mt-0.5">
            {stats.total} clients · {stats.optedIn} opted in · {stats.optedOut} opted out · {stats.invalidOrDisabled} invalid/disabled
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={seeding}
            onClick={() => void quickSeedPreset(25)}
            className="min-h-[40px] px-3 py-2 rounded-lg border border-[#d1d7db] dark:border-[#374248] bg-white dark:bg-[#111b21] text-[12.5px] font-semibold text-[#111b21] dark:text-[#e9edef] hover:border-[#00a884] whitespace-nowrap shrink-0 transition-colors"
          >
            +25 Clients
          </button>
          <button
            type="button"
            onClick={() => setShowSeedForm((v) => !v)}
            className="min-h-[40px] px-3.5 py-2 rounded-lg bg-[#00a884] text-white text-[13px] font-semibold hover:bg-[#008f72] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Bulk Seed
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto wa-scroll p-4 md:p-6 space-y-4">
        {notice && (
          <div className="px-3.5 py-2.5 rounded-lg bg-[#e7fce3] dark:bg-[#0a332c] text-[#008069] dark:text-[#25d366] text-[13px] font-medium flex items-center justify-between">
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Dismiss notice"
              className="p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Collapsible Bulk Seed Builder */}
        {showSeedForm && (
          <form
            onSubmit={runSeed}
            data-testid="bulk-seed-form"
            className="p-4 rounded-xl border border-[#d1d7db] dark:border-[#2a3942] bg-[#f7f8fa] dark:bg-[#182229] space-y-3"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-[14.5px] font-semibold text-[#111b21] dark:text-[#e9edef]">
                Generate Simulated Personal WhatsApp Clients
              </h2>
              <button
                type="button"
                onClick={() => setShowSeedForm(false)}
                aria-label="Close bulk seed form"
                className="p-1 text-[#667781] hover:text-[#111b21] dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label htmlFor="seed-count" className="block text-[12px] text-[#667781] dark:text-[#8696a0] mb-1">
                  Number of clients
                </label>
                <input
                  id="seed-count"
                  type="number"
                  min={1}
                  max={500}
                  value={seedCount}
                  onChange={(e) => setSeedCount(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-lg bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[13.5px] font-mono tabular-nums"
                />
              </div>

              <div>
                <label htmlFor="seed-segments" className="block text-[12px] text-[#667781] dark:text-[#8696a0] mb-1">
                  Segments (comma-separated)
                </label>
                <input
                  id="seed-segments"
                  type="text"
                  value={seedSegments}
                  onChange={(e) => setSeedSegments(e.target.value)}
                  placeholder="Comma-separated segments (optional)"
                  className="w-full h-10 px-3 rounded-lg bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[13.5px]"
                />
              </div>

              <div>
                <label htmlFor="seed-invalid-pct" className="block text-[12px] text-[#667781] dark:text-[#8696a0] mb-1">
                  Invalid numbers % (#131030)
                </label>
                <input
                  id="seed-invalid-pct"
                  type="number"
                  min={0}
                  max={100}
                  value={seedInvalidPct}
                  onChange={(e) => setSeedInvalidPct(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-lg bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[13.5px] font-mono tabular-nums"
                />
              </div>

              <div>
                <label htmlFor="seed-optout-pct" className="block text-[12px] text-[#667781] dark:text-[#8696a0] mb-1">
                  Opted-out % (#131049)
                </label>
                <input
                  id="seed-optout-pct"
                  type="number"
                  min={0}
                  max={100}
                  value={seedOptOutPct}
                  onChange={(e) => setSeedOptOutPct(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-lg bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[13.5px] font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <label className="flex items-center gap-2 text-[13px] text-[#54656f] dark:text-[#aebac1] cursor-pointer">
                <input
                  type="checkbox"
                  checked={clearPrev}
                  onChange={(e) => setClearPrev(e.target.checked)}
                  className="accent-[#00a884]"
                />
                Replace previously seeded clients
              </label>

              <button
                type="submit"
                disabled={seeding}
                className="min-h-[40px] px-4 py-2 rounded-lg bg-[#00a884] text-white text-[13px] font-semibold hover:bg-[#008f72] disabled:opacity-60 whitespace-nowrap"
              >
                {seeding ? 'Seeding...' : `Seed ${seedCount} Clients`}
              </button>
            </div>
          </form>
        )}

        {/* Filter Toolbar */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
          <div className="relative md:col-span-5 flex items-center">
            <Search className="w-4 h-4 text-[#667781] absolute left-3 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search client numbers"
              placeholder="Search name, E.164 phone, country, or segment"
              className="w-full h-10 pl-9 pr-3 rounded-lg bg-[#f0f2f5] dark:bg-[#202c33] text-[13.5px] text-[#111b21] dark:text-[#e9edef] placeholder:text-[#667781] focus:outline-none focus:ring-2 focus:ring-[#00a884]/40"
            />
          </div>

          <div className="md:col-span-2">
            <select
              value={segmentFilter}
              onChange={(e) => setSegmentFilter(e.target.value)}
              aria-label="Filter by segment"
              className="w-full h-10 px-2.5 rounded-lg bg-[#f0f2f5] dark:bg-[#202c33] text-[13px] text-[#111b21] dark:text-[#e9edef]"
            >
              <option value="all">All segments</option>
              {allSegments.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <select
              value={optInFilter}
              onChange={(e) => setOptInFilter(e.target.value as 'all' | OptInStatus)}
              aria-label="Filter by opt-in status"
              className="w-full h-10 px-2.5 rounded-lg bg-[#f0f2f5] dark:bg-[#202c33] text-[13px] text-[#111b21] dark:text-[#e9edef]"
            >
              <option value="all">All opt-in</option>
              <option value="opted_in">Opted in</option>
              <option value="opted_out">Opted out</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <select
              value={personalityFilter}
              onChange={(e) =>
                setPersonalityFilter(e.target.value as 'all' | ClientPersonality)
              }
              aria-label="Filter by client personality"
              className="w-full h-10 px-2.5 rounded-lg bg-[#f0f2f5] dark:bg-[#202c33] text-[13px] text-[#111b21] dark:text-[#e9edef]"
            >
              <option value="all">All personalities</option>
              {(Object.keys(PERSONALITY_LABELS) as ClientPersonality[]).map((p) => (
                <option key={p} value={p}>
                  {PERSONALITY_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Client List / Table */}
        {filtered.length === 0 ? (
          <div className="py-16 text-center space-y-2.5 border border-[#e9edef] dark:border-[#2a3942] rounded-xl px-4">
            <Users className="w-8 h-8 mx-auto text-[#8696a0]" />
            <p className="text-[14px] text-[#667781] dark:text-[#8696a0]">
              {clientContacts.length === 0
                ? 'No client numbers added yet.'
                : 'No client numbers match the current filter.'}
            </p>
            {clientContacts.length === 0 ? (
              <button
                type="button"
                onClick={() => setShowSeedForm(true)}
                className="px-4 py-2 rounded-lg bg-[#00a884] text-white text-[13px] font-semibold hover:bg-[#008f72]"
              >
                Add or seed clients
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setSegmentFilter('all');
                  setOptInFilter('all');
                  setPersonalityFilter('all');
                }}
                className="px-4 py-2 rounded-lg bg-[#00a884] text-white text-[13px] font-semibold hover:bg-[#008f72]"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="border border-[#e9edef] dark:border-[#2a3942] rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-[#f7f8fa] dark:bg-[#182229] border-b border-[#e9edef] dark:border-[#2a3942] flex items-center justify-between text-[12px] text-[#667781] dark:text-[#8696a0] font-mono tabular-nums">
              <span>
                Showing {Math.min(visibleCount, filtered.length)} of {filtered.length} matching clients
              </span>
              <span>Single Business Sender Mode</span>
            </div>

            <div className="divide-y divide-[#e9edef] dark:divide-[#222d34]" data-testid="clients-list">
              {filtered.slice(0, visibleCount).map((client) => {
                const isOptedOut = client.optInStatus === 'opted_out';
                const statusLabel = client.invalidNumber
                  ? 'Invalid (#131030)'
                  : client.disabled
                    ? 'Disabled (#131026)'
                    : client.blocked
                      ? 'Blocked'
                      : isOptedOut
                        ? 'Opted out'
                        : 'Opted in';
                const statusTone =
                  client.invalidNumber || client.disabled || client.blocked || isOptedOut
                    ? 'text-[#ea0038]'
                    : 'text-[#008069] dark:text-[#25d366]';

                return (
                  <div
                    key={client.id}
                    className="px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:bg-[#f5f6f6] dark:hover:bg-[#182229] transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar
                        name={client.name}
                        avatarUrl={client.avatarUrl}
                        color={client.avatarColor}
                        size="md"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="text-[14.5px] font-semibold text-[#111b21] dark:text-[#e9edef] truncate">
                            {client.name}
                          </span>
                          <span className="text-[12.5px] font-mono tabular-nums text-[#54656f] dark:text-[#aebac1]">
                            {client.phone}
                          </span>
                        </div>
                        <div className="text-[12px] text-[#667781] dark:text-[#8696a0] flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                          <span>{client.country || 'US'}</span>
                          <span aria-hidden="true">·</span>
                          <span>{(client.tags || ['general']).join(', ')}</span>
                          <span aria-hidden="true">·</span>
                          <span className={`font-medium ${statusTone}`}>{statusLabel}</span>
                          {client.timezone && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono text-[11px]">{client.timezone}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <select
                        value={client.personality || 'silent'}
                        onChange={(e) =>
                          void onUpdateContact(client.id, {
                            personality: e.target.value as ClientPersonality,
                          })
                        }
                        aria-label={`Personality for ${client.name}`}
                        className="h-9 px-2 rounded-md bg-[#f0f2f5] dark:bg-[#202c33] border border-transparent focus:border-[#00a884] text-[12px] text-[#111b21] dark:text-[#e9edef]"
                      >
                        {(Object.keys(PERSONALITY_LABELS) as ClientPersonality[]).map((p) => (
                          <option key={p} value={p}>
                            {PERSONALITY_LABELS[p]}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() =>
                          void onSetOptIn(
                            client.id,
                            isOptedOut ? 'opted_in' : 'opted_out'
                          )
                        }
                        aria-label={
                          isOptedOut ? `Opt in ${client.name}` : `Opt out ${client.name}`
                        }
                        className="min-h-[36px] px-2.5 py-1.5 rounded-md border border-[#d1d7db] dark:border-[#374248] text-[12px] font-medium text-[#54656f] dark:text-[#aebac1] hover:border-[#00a884] inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        {isOptedOut ? (
                          <>
                            <ShieldCheck className="w-3.5 h-3.5 text-[#00a884]" /> Opt In
                          </>
                        ) : (
                          <>
                            <ShieldBan className="w-3.5 h-3.5 text-[#ea0038]" /> Opt Out
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          void onSimulateResponse({
                            contactIds: [client.id],
                            action: 'reply',
                            text: 'Hi! Received your campaign message — tell me more.',
                          })
                        }
                        aria-label={`Simulate reply from ${client.name}`}
                        className="min-h-[36px] px-2.5 py-1.5 rounded-md border border-[#d1d7db] dark:border-[#374248] text-[12px] font-medium text-[#54656f] dark:text-[#aebac1] hover:border-[#00a884] inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        <Send className="w-3.5 h-3.5" /> Reply
                      </button>

                      <button
                        type="button"
                        onClick={() => onOpenChat(client)}
                        aria-label={`Open chat with ${client.name}`}
                        className="min-h-[36px] px-3 py-1.5 rounded-md bg-[#00a884] text-white text-[12px] font-semibold hover:bg-[#008f72] inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        <MessageSquare className="w-3.5 h-3.5" /> Chat
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {filtered.length > visibleCount && (
              <div className="p-3 text-center border-t border-[#e9edef] dark:border-[#2a3942]">
                <button
                  type="button"
                  onClick={() => setVisibleCount((n) => n + 50)}
                  className="px-4 py-2 rounded-lg border border-[#d1d7db] dark:border-[#374248] text-[13px] font-semibold text-[#008069] dark:text-[#25d366] hover:bg-[#f0f2f5] dark:hover:bg-[#202c33]"
                >
                  Load more ({filtered.length - visibleCount} remaining)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
