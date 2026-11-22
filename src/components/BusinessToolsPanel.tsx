import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  Clock,
  DollarSign,
  MessageSquareHeart,
  Phone,
  Plus,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Tag,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import type {
  BusinessAutomation,
  BusinessLabel,
  BusinessProfile,
  CatalogItemRef,
  Chat,
  Contact,
  ConversationBillingRecord,
  ConversationCategory,
  MessageTemplate,
  OptInStatus,
  PhoneNumberConfig,
  QuickReply,
  TemplateApprovalStatus,
  TemplateButton,
  TemplateCategory,
} from '../../shared/types';
import { formatChatListDate } from '../utils/format';
import { Avatar } from './Avatar';

type BizSection =
  | 'overview'
  | 'templates'
  | 'compliance'
  | 'phone_numbers'
  | 'pricing'
  | 'profile'
  | 'catalog'
  | 'quick_replies'
  | 'labels'
  | 'automation';

interface BusinessToolsPanelProps {
  profile: BusinessProfile;
  automation: BusinessAutomation;
  catalog: CatalogItemRef[];
  quickReplies: QuickReply[];
  labels: BusinessLabel[];
  templates: MessageTemplate[];
  phoneNumbers: PhoneNumberConfig[];
  activePhoneNumberId: string;
  contacts: Contact[];
  conversations: ConversationBillingRecord[];
  pricingRatesUsd: Record<ConversationCategory, number>;
  chats: Chat[];
  selectedChatId: string | null;
  onUpdateProfile: (patch: Partial<BusinessProfile>) => Promise<void>;
  onUpdateAutomation: (patch: Partial<BusinessAutomation>) => Promise<void>;
  onSaveCatalogItem: (item: Partial<CatalogItemRef> & { name: string; price: string }) => Promise<void>;
  onDeleteCatalogItem: (id: string) => Promise<void>;
  onSendCatalogToChat: (itemId: string) => Promise<void>;
  onSaveQuickReply: (qr: { shortcut: string; message: string }) => Promise<void>;
  onDeleteQuickReply: (id: string) => Promise<void>;
  onSaveLabel: (lbl: { name: string; color: string }) => Promise<void>;
  onDeleteLabel: (id: string) => Promise<void>;
  onSaveTemplate: (
    tpl: Partial<MessageTemplate> & {
      name: string;
      bodyText: string;
      category: TemplateCategory;
    }
  ) => Promise<void>;
  onSetTemplateStatus: (id: string, status: TemplateApprovalStatus) => Promise<void>;
  onDeleteTemplate: (id: string) => Promise<void>;
  onOpenSendTemplateModal: (templateId?: string) => void;
  onSetContactOptIn: (contactId: string, status: OptInStatus) => Promise<void>;
  onSelectActivePhoneNumber: (id: string) => Promise<void>;
  onUpsertPhoneNumber: (input: {
    id?: string;
    phoneNumber: string;
    displayName: string;
    verifiedName?: string;
    webhookUrl?: string;
  }) => Promise<void>;
}

const LABEL_SWATCHES = ['#00a884', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6'];

export function BusinessToolsPanel({
  profile,
  automation,
  catalog,
  quickReplies,
  labels,
  templates,
  phoneNumbers,
  activePhoneNumberId,
  contacts,
  conversations,
  pricingRatesUsd,
  chats,
  selectedChatId,
  onUpdateProfile,
  onUpdateAutomation,
  onSaveCatalogItem,
  onDeleteCatalogItem,
  onSendCatalogToChat,
  onSaveQuickReply,
  onDeleteQuickReply,
  onSaveLabel,
  onDeleteLabel,
  onSaveTemplate,
  onSetTemplateStatus,
  onDeleteTemplate,
  onOpenSendTemplateModal,
  onSetContactOptIn,
  onSelectActivePhoneNumber,
  onUpsertPhoneNumber,
}: BusinessToolsPanelProps) {
  const [section, setSection] = useState<BizSection>('overview');
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  // Profile form state
  const [profForm, setProfForm] = useState<BusinessProfile>(profile);

  // Catalog form state
  const [catName, setCatName] = useState('');
  const [catPrice, setCatPrice] = useState('');
  const [catSku, setCatSku] = useState('');
  const [catDesc, setCatDesc] = useState('');

  // Quick Reply form state
  const [qrShortcut, setQrShortcut] = useState('');
  const [qrMessage, setQrMessage] = useState('');

  // Label form state
  const [lblName, setLblName] = useState('');
  const [lblColor, setLblColor] = useState(LABEL_SWATCHES[0]);

  // Automation form state
  const [autoForm, setAutoForm] = useState<BusinessAutomation>(automation);

  // Template create form state
  const [tplName, setTplName] = useState('');
  const [tplCategory, setTplCategory] = useState<TemplateCategory>('UTILITY');
  const [tplHeader, setTplHeader] = useState('');
  const [tplBody, setTplBody] = useState('');
  const [tplFooter, setTplFooter] = useState('');
  const [tplSampleCsv, setTplSampleCsv] = useState('');
  const [tplBtnType, setTplBtnType] = useState<'NONE' | TemplateButton['type']>('NONE');
  const [tplBtnText, setTplBtnText] = useState('');

  // Phone number form state
  const [pnId, setPnId] = useState('');
  const [pnPhone, setPnPhone] = useState('');
  const [pnName, setPnName] = useState('');
  const [pnWebhook, setPnWebhook] = useState('');
  const [pnError, setPnError] = useState<string | null>(null);

  const flashSaved = (label: string) => {
    setSavedFeedback(label);
    setTimeout(() => setSavedFeedback(null), 2000);
  };

  const openSection = (next: BizSection) => {
    if (next === 'profile') setProfForm(profile);
    if (next === 'automation') setAutoForm(automation);
    setSection(next);
  };

  const pricingStats = useMemo(() => {
    const categories: ConversationCategory[] = ['MARKETING', 'UTILITY', 'AUTHENTICATION', 'SERVICE'];
    const byCat = Object.fromEntries(
      categories.map((cat) => {
        const items = conversations.filter((c) => c.category === cat);
        const total = items.reduce((s, x) => s + x.estimatedCostUsd, 0);
        return [cat, { count: items.length, total: Number(total.toFixed(4)) }];
      })
    ) as Record<ConversationCategory, { count: number; total: number }>;
    const grandTotal = Number(
      conversations.reduce((s, x) => s + x.estimatedCostUsd, 0).toFixed(4)
    );
    return { categories, byCat, grandTotal };
  }, [conversations]);

  const optedOutCount = useMemo(
    () => contacts.filter((c) => c.optInStatus === 'opted_out').length,
    [contacts]
  );

  const titleMap: Record<BizSection, string> = {
    overview: 'Business tools',
    templates: 'Message templates',
    compliance: 'Opt-in compliance',
    phone_numbers: 'WABA phone numbers',
    pricing: 'Conversation pricing',
    profile: 'Business profile',
    catalog: 'Catalog',
    quick_replies: 'Quick replies',
    labels: 'Labels',
    automation: 'Greeting & away',
  };

  return (
    <aside
      aria-label="WhatsApp Business tools"
      className="w-full md:w-[375px] lg:w-[405px] shrink-0 h-full bg-white dark:bg-[#111b21] border-r border-[#e9edef] dark:border-[#222d34] flex flex-col min-w-0"
    >
      <header className="h-[58px] md:h-[60px] px-3.5 md:px-4 pt-safe bg-[#f0f2f5] dark:bg-[#202c33] border-b border-[#d1d7db] dark:border-[#2a3942] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          {section !== 'overview' && (
            <button
              type="button"
              onClick={() => setSection('overview')}
              aria-label="Back to Business tools"
              className="min-w-[40px] min-h-[40px] md:min-w-0 md:min-h-0 md:w-8 md:h-8 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/10"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h1 className="text-[18px] font-bold text-[#111b21] dark:text-[#e9edef] truncate">
            {titleMap[section]}
          </h1>
        </div>
        {savedFeedback && (
          <span className="text-[12px] font-medium text-[#00a884] shrink-0">{savedFeedback}</span>
        )}
      </header>

      <div className="flex-1 overflow-y-auto wa-scroll">
        {/* OVERVIEW MENU */}
        {section === 'overview' && (
          <div className="divide-y divide-[#f0f2f5] dark:divide-[#202c33]">
            <div className="p-4 flex items-center gap-3.5 bg-[#f7f8fa] dark:bg-[#182229]">
              <Avatar name={profile.name} avatarUrl={profile.avatarUrl} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[15.5px] font-semibold text-[#111b21] dark:text-[#e9edef] truncate">
                    {profile.name}
                  </span>
                  {profile.verified && <BadgeCheck className="w-4 h-4 text-[#00a884] shrink-0" />}
                </div>
                <p className="text-[13px] text-[#667781] dark:text-[#8696a0] truncate">
                  {[profile.category, activePhoneNumberId].filter(Boolean).join(' · ') ||
                    'No sender number configured'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => openSection('templates')}
              className="w-full min-h-[60px] px-4 py-3.5 flex items-center gap-4 text-left hover:bg-[#f5f6f6] dark:hover:bg-[#202c33] transition-colors"
            >
              <Sparkles className="w-5 h-5 text-[#00a884] shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-medium text-[#111b21] dark:text-[#e9edef]">
                  Message templates
                </div>
                <div className="text-[12.5px] text-[#667781] dark:text-[#8696a0] truncate">
                  {templates.filter((t) => t.status === 'APPROVED').length} approved ·{' '}
                  {templates.length} total (UTILITY / MARKETING / AUTH)
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => openSection('compliance')}
              className="w-full min-h-[60px] px-4 py-3.5 flex items-center gap-4 text-left hover:bg-[#f5f6f6] dark:hover:bg-[#202c33] transition-colors"
            >
              <ShieldCheck className="w-5 h-5 text-[#00a884] shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-medium text-[#111b21] dark:text-[#e9edef]">
                  Opt-in / opt-out compliance
                </div>
                <div className="text-[12.5px] text-[#667781] dark:text-[#8696a0] truncate">
                  {contacts.length - optedOutCount} eligible · {optedOutCount} opted out (STOP/START)
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => openSection('phone_numbers')}
              className="w-full min-h-[60px] px-4 py-3.5 flex items-center gap-4 text-left hover:bg-[#f5f6f6] dark:hover:bg-[#202c33] transition-colors"
            >
              <Phone className="w-5 h-5 text-[#00a884] shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-medium text-[#111b21] dark:text-[#e9edef]">
                  WABA phone numbers
                </div>
                <div className="text-[12.5px] text-[#667781] dark:text-[#8696a0] truncate">
                  {phoneNumbers.length} numbers · Per-number webhook routing
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => openSection('pricing')}
              className="w-full min-h-[60px] px-4 py-3.5 flex items-center gap-4 text-left hover:bg-[#f5f6f6] dark:hover:bg-[#202c33] transition-colors"
            >
              <DollarSign className="w-5 h-5 text-[#00a884] shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-medium text-[#111b21] dark:text-[#e9edef]">
                  Conversational pricing
                </div>
                <div className="text-[12.5px] font-mono tabular-nums text-[#667781] dark:text-[#8696a0] truncate">
                  {conversations.length} sessions · Est. ${pricingStats.grandTotal.toFixed(4)}
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => openSection('profile')}
              className="w-full min-h-[60px] px-4 py-3.5 flex items-center gap-4 text-left hover:bg-[#f5f6f6] dark:hover:bg-[#202c33] transition-colors"
            >
              <Store className="w-5 h-5 text-[#00a884] shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-medium text-[#111b21] dark:text-[#e9edef]">
                  Business profile
                </div>
                <div className="text-[12.5px] text-[#667781] dark:text-[#8696a0] truncate">
                  Address, hours, website, and verification
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => openSection('catalog')}
              className="w-full min-h-[60px] px-4 py-3.5 flex items-center gap-4 text-left hover:bg-[#f5f6f6] dark:hover:bg-[#202c33] transition-colors"
            >
              <ShoppingBag className="w-5 h-5 text-[#00a884] shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-medium text-[#111b21] dark:text-[#e9edef]">
                  Catalog
                </div>
                <div className="text-[12.5px] text-[#667781] dark:text-[#8696a0]">
                  {catalog.length} products · Single cards &amp; carousels
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => openSection('quick_replies')}
              className="w-full min-h-[60px] px-4 py-3.5 flex items-center gap-4 text-left hover:bg-[#f5f6f6] dark:hover:bg-[#202c33] transition-colors"
            >
              <Zap className="w-5 h-5 text-[#00a884] shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-medium text-[#111b21] dark:text-[#e9edef]">
                  Quick replies
                </div>
                <div className="text-[12.5px] text-[#667781] dark:text-[#8696a0]">
                  {quickReplies.length} shortcuts · Type / in chat composer
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => openSection('labels')}
              className="w-full min-h-[60px] px-4 py-3.5 flex items-center gap-4 text-left hover:bg-[#f5f6f6] dark:hover:bg-[#202c33] transition-colors"
            >
              <Tag className="w-5 h-5 text-[#00a884] shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-medium text-[#111b21] dark:text-[#e9edef]">
                  Labels
                </div>
                <div className="text-[12.5px] text-[#667781] dark:text-[#8696a0]">
                  {labels.length} color-coded conversation tags
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => openSection('automation')}
              className="w-full min-h-[60px] px-4 py-3.5 flex items-center gap-4 text-left hover:bg-[#f5f6f6] dark:hover:bg-[#202c33] transition-colors"
            >
              <MessageSquareHeart className="w-5 h-5 text-[#00a884] shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-medium text-[#111b21] dark:text-[#e9edef]">
                  Greeting &amp; away messages
                </div>
                <div className="text-[12.5px] text-[#667781] dark:text-[#8696a0]">
                  Greeting {automation.greetingEnabled ? 'On' : 'Off'} · Away{' '}
                  {automation.awayEnabled ? 'On' : 'Off'}
                </div>
              </div>
            </button>
          </div>
        )}

        {/* TEMPLATES MANAGER */}
        {section === 'templates' && (
          <div className="p-4 space-y-4">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!tplName.trim() || !tplBody.trim()) return;
                const buttons: TemplateButton[] =
                  tplBtnType !== 'NONE' && tplBtnText.trim()
                    ? [
                        {
                          type: tplBtnType,
                          text: tplBtnText.trim(),
                          url: tplBtnType === 'URL' ? 'https://example.com/track' : undefined,
                          phoneNumber: tplBtnType === 'PHONE_NUMBER' ? '' : undefined,
                          exampleCode:
                            tplBtnType === 'OTP' || tplBtnType === 'COPY_CODE' ? '482910' : undefined,
                        },
                      ]
                    : [];
                await onSaveTemplate({
                  name: tplName.trim().toLowerCase().replace(/\s+/g, '_'),
                  category: tplCategory,
                  headerText: tplHeader.trim() || undefined,
                  bodyText: tplBody.trim(),
                  footerText: tplFooter.trim() || undefined,
                  sampleValues: tplSampleCsv
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                  buttons,
                });
                setTplName('');
                setTplHeader('');
                setTplBody('');
                setTplFooter('');
                setTplSampleCsv('');
                setTplBtnType('NONE');
                setTplBtnText('');
                flashSaved('Created');
              }}
              className="p-3.5 rounded-lg bg-[#f7f8fa] dark:bg-[#202c33] space-y-2.5 border border-[#e9edef] dark:border-[#2a3942]"
            >
              <div className="text-[13px] font-semibold">Create message template</div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="template_name"
                  value={tplName}
                  onChange={(e) => setTplName(e.target.value)}
                  className="px-2.5 py-1.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[13px] font-mono"
                />
                <select
                  value={tplCategory}
                  onChange={(e) => setTplCategory(e.target.value as TemplateCategory)}
                  aria-label="Template category"
                  className="px-2 py-1.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[12.5px]"
                >
                  <option value="UTILITY">UTILITY</option>
                  <option value="MARKETING">MARKETING</option>
                  <option value="AUTHENTICATION">AUTHENTICATION</option>
                </select>
              </div>
              <input
                type="text"
                placeholder="Header text (optional)"
                value={tplHeader}
                onChange={(e) => setTplHeader(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[13px]"
              />
              <textarea
                rows={2}
                required
                placeholder="Body with variables, e.g. Hi {{1}}, your code is {{2}}."
                value={tplBody}
                onChange={(e) => setTplBody(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[13px] resize-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Sample values (csv)"
                  value={tplSampleCsv}
                  onChange={(e) => setTplSampleCsv(e.target.value)}
                  className="px-2.5 py-1.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[12.5px]"
                />
                <input
                  type="text"
                  placeholder="Footer (optional)"
                  value={tplFooter}
                  onChange={(e) => setTplFooter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[12.5px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={tplBtnType}
                  onChange={(e) => setTplBtnType(e.target.value as 'NONE' | TemplateButton['type'])}
                  aria-label="Template button type"
                  className="px-2 py-1.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[12px]"
                >
                  <option value="NONE">No button</option>
                  <option value="QUICK_REPLY">Quick Reply</option>
                  <option value="URL">URL Button</option>
                  <option value="PHONE_NUMBER">Phone Call</option>
                  <option value="COPY_CODE">Copy Coupon</option>
                  <option value="OTP">Auth OTP Copy</option>
                </select>
                {tplBtnType !== 'NONE' && (
                  <input
                    type="text"
                    placeholder="Button label"
                    value={tplBtnText}
                    onChange={(e) => setTplBtnText(e.target.value)}
                    className="px-2.5 py-1.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[12.5px]"
                  />
                )}
              </div>
              <button
                type="submit"
                className="w-full py-2 rounded-md bg-[#00a884] text-white text-[13px] font-semibold hover:bg-[#008f72] flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Submit template (PENDING)
              </button>
            </form>

            <div className="space-y-2.5">
              {templates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="p-3 rounded-lg border border-[#e9edef] dark:border-[#2a3942] space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-mono font-semibold truncate">
                        {tpl.name}
                      </div>
                      <div className="text-[11px] font-mono text-[#667781] dark:text-[#8696a0]">
                        {tpl.category} · {tpl.language} ·{' '}
                        <span
                          className={
                            tpl.status === 'APPROVED'
                              ? 'text-[#00a884] font-semibold'
                              : tpl.status === 'REJECTED'
                                ? 'text-[#ea0038] font-semibold'
                                : 'text-[#b45309] dark:text-[#f59e0b] font-semibold'
                          }
                        >
                          {tpl.status}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void onDeleteTemplate(tpl.id)}
                      aria-label={`Delete template ${tpl.name}`}
                      className="p-1 text-[#8696a0] hover:text-[#ea0038]"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-[12.5px] text-[#3b4a54] dark:text-[#d1d7db] leading-snug">
                    {tpl.bodyText}
                  </p>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {tpl.status !== 'APPROVED' && (
                      <button
                        type="button"
                        onClick={() => void onSetTemplateStatus(tpl.id, 'APPROVED')}
                        className="px-2.5 py-1 rounded bg-[#00a884]/15 text-[#008069] dark:text-[#25d366] text-[11.5px] font-semibold flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" /> Approve
                      </button>
                    )}
                    {tpl.status !== 'REJECTED' && (
                      <button
                        type="button"
                        onClick={() => void onSetTemplateStatus(tpl.id, 'REJECTED')}
                        className="px-2.5 py-1 rounded bg-[#ea0038]/12 text-[#ea0038] text-[11.5px] font-semibold flex items-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" /> Reject
                      </button>
                    )}
                    {tpl.status === 'APPROVED' && selectedChatId && (
                      <button
                        type="button"
                        onClick={() => onOpenSendTemplateModal(tpl.id)}
                        className="ml-auto px-2.5 py-1 rounded border border-[#00a884] text-[#008069] dark:text-[#25d366] text-[11.5px] font-semibold flex items-center gap-1 hover:bg-[#00a884]/10"
                      >
                        <Send className="w-3 h-3" /> Send to chat
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* OPT-IN / OPT-OUT COMPLIANCE */}
        {section === 'compliance' && (
          <div className="p-4 space-y-3">
            <p className="text-[12.5px] text-[#667781] dark:text-[#8696a0] leading-relaxed">
              Contacts sending <span className="font-mono">STOP</span>,{' '}
              <span className="font-mono">UNSUBSCRIBE</span>,{' '}
              <span className="font-mono">OPT-OUT</span>, or{' '}
              <span className="font-mono">STOPALL</span> are opted out and blocked from business-initiated templates (#131049). Sending <span className="font-mono">START</span> /{' '}
              <span className="font-mono">OPT-IN</span> restores eligibility.
            </p>

            <div className="divide-y divide-[#f0f2f5] dark:divide-[#202c33] border border-[#e9edef] dark:border-[#2a3942] rounded-lg">
              {contacts.map((ct) => (
                <div key={ct.id} className="p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold truncate">{ct.name}</div>
                      <div className="text-[11.5px] font-mono text-[#667781] dark:text-[#8696a0]">
                        {ct.phone} · {ct.optInSource} · {formatChatListDate(ct.optInUpdatedAt)}
                      </div>
                    </div>
                    <span
                      className={`text-[11px] font-mono font-bold uppercase shrink-0 ${
                        ct.optInStatus === 'opted_out'
                          ? 'text-[#ea0038]'
                          : ct.optInStatus === 'opted_in'
                            ? 'text-[#00a884]'
                            : 'text-[#667781]'
                      }`}
                    >
                      {ct.optInStatus.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void onSetContactOptIn(ct.id, 'opted_in')}
                      className="flex-1 py-1.5 rounded border border-[#d1d7db] dark:border-[#374248] text-[12px] font-medium hover:bg-[#f5f6f6] dark:hover:bg-[#202c33]"
                    >
                      Opt In
                    </button>
                    <button
                      type="button"
                      onClick={() => void onSetContactOptIn(ct.id, 'opted_out')}
                      className="flex-1 py-1.5 rounded border border-[#d1d7db] dark:border-[#374248] text-[12px] font-medium hover:bg-[#f5f6f6] dark:hover:bg-[#202c33]"
                    >
                      Opt Out
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* WABA PHONE NUMBERS */}
        {section === 'phone_numbers' && (
          <div className="p-4 space-y-4">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setPnError(null);
                try {
                  await onUpsertPhoneNumber({
                    id: pnId.trim() || undefined,
                    phoneNumber: pnPhone.trim(),
                    displayName: pnName.trim(),
                    webhookUrl: pnWebhook.trim(),
                  });
                  setPnId('');
                  setPnPhone('');
                  setPnName('');
                  setPnWebhook('');
                  flashSaved('Saved');
                } catch (err) {
                  setPnError(err instanceof Error ? err.message : 'Invalid phone number');
                }
              }}
              className="p-3.5 rounded-lg bg-[#f7f8fa] dark:bg-[#202c33] space-y-2.5 border border-[#e9edef] dark:border-[#2a3942]"
            >
              <div className="text-[13px] font-semibold">Add / update WABA phone number</div>
              {pnError && <p className="text-[12px] text-[#ea0038]">{pnError}</p>}
              <input
                type="text"
                placeholder="Phone Number ID (optional)"
                value={pnId}
                onChange={(e) => setPnId(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[13px] font-mono"
              />
              <input
                type="text"
                required
                placeholder="E.164 phone number"
                value={pnPhone}
                onChange={(e) => setPnPhone(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[13px] font-mono"
              />
              <input
                type="text"
                required
                placeholder="Display Name"
                value={pnName}
                onChange={(e) => setPnName(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[13px]"
              />
              <input
                type="url"
                placeholder="Per-number Webhook URL override (optional)"
                value={pnWebhook}
                onChange={(e) => setPnWebhook(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-md bg-white dark:bg-[#111b21] border border-[#d1d7db] dark:border-[#374248] text-[12.5px] font-mono"
              />
              <button
                type="submit"
                className="w-full py-2 rounded-md bg-[#00a884] text-white text-[13px] font-semibold hover:bg-[#008f72]"
              >
                Save phone number
              </button>
            </form>

            <div className="space-y-2.5">
              {phoneNumbers.length === 0 && (
                <p className="py-6 text-center text-[13px] text-[#667781] dark:text-[#8696a0]">
                  No WhatsApp Business numbers added yet.
                </p>
              )}
              {phoneNumbers.map((pn) => {
                const isActive = pn.id === activePhoneNumberId;
                return (
                  <div
                    key={pn.id}
                    className={`p-3 rounded-lg border space-y-1.5 ${
                      isActive
                        ? 'border-[#00a884] bg-[#e7fce3]/40 dark:bg-[#0a332c]/40'
                        : 'border-[#e9edef] dark:border-[#2a3942]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[14px] font-semibold truncate">{pn.displayName}</div>
                        <div className="text-[12px] font-mono text-[#667781] dark:text-[#8696a0]">
                          {pn.id} · {pn.phoneNumber}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void onSelectActivePhoneNumber(pn.id)}
                        className={`px-2.5 py-1 rounded text-[11.5px] font-semibold shrink-0 ${
                          isActive
                            ? 'bg-[#00a884] text-white'
                            : 'border border-[#d1d7db] dark:border-[#374248]'
                        }`}
                      >
                        {isActive ? 'Active' : 'Use'}
                      </button>
                    </div>
                    <div className="text-[11.5px] font-mono text-[#54656f] dark:text-[#aebac1] truncate">
                      Webhook: {pn.webhookUrl || 'Default global webhook'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* CONVERSATIONAL PRICING */}
        {section === 'pricing' && (
          <div className="p-4 space-y-4">
            <div className="p-3.5 rounded-lg bg-[#f7f8fa] dark:bg-[#182229] border border-[#e9edef] dark:border-[#2a3942] flex items-baseline justify-between">
              <div>
                <div className="text-[12px] text-[#667781] dark:text-[#8696a0]">
                  Simulated Billing Total
                </div>
                <div className="text-[22px] font-mono font-bold tabular-nums text-[#111b21] dark:text-[#e9edef]">
                  ${pricingStats.grandTotal.toFixed(4)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[12px] text-[#667781] dark:text-[#8696a0]">Sessions</div>
                <div className="text-[18px] font-mono font-semibold tabular-nums">
                  {conversations.length}
                </div>
              </div>
            </div>

            <div className="divide-y divide-[#f0f2f5] dark:divide-[#202c33] border border-[#e9edef] dark:border-[#2a3942] rounded-lg">
              {pricingStats.categories.map((cat) => (
                <div key={cat} className="px-3.5 py-2.5 flex items-center justify-between text-[13px]">
                  <div>
                    <div className="font-mono font-semibold">{cat}</div>
                    <div className="text-[11.5px] font-mono text-[#667781] dark:text-[#8696a0]">
                      Rate ${pricingRatesUsd[cat].toFixed(4)} / conv
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <div className="font-semibold">${pricingStats.byCat[cat].total.toFixed(4)}</div>
                    <div className="text-[11.5px] text-[#667781] dark:text-[#8696a0]">
                      {pricingStats.byCat[cat].count} conv
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {conversations.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[12px] font-semibold text-[#667781] dark:text-[#8696a0]">
                  Recent Conversation Ledger
                </div>
                <div className="divide-y divide-[#f0f2f5] dark:divide-[#202c33] border border-[#e9edef] dark:border-[#2a3942] rounded-lg">
                  {conversations.slice(0, 10).map((rec) => (
                    <div key={rec.id} className="px-3 py-2 flex items-center justify-between text-[12px] font-mono">
                      <span className="truncate">
                        {rec.category} · {rec.chatId}
                      </span>
                      <span className="shrink-0 font-semibold">${rec.estimatedCostUsd.toFixed(4)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* BUSINESS PROFILE EDITOR */}
        {section === 'profile' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await onUpdateProfile(profForm);
              flashSaved('Saved');
            }}
            className="p-4 space-y-3.5"
          >
            <div>
              <label className="block text-[12px] font-medium text-[#667781] dark:text-[#8696a0] mb-1">
                Business name
              </label>
              <input
                type="text"
                required
                value={profForm.name}
                onChange={(e) => setProfForm({ ...profForm, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[#f0f2f5] dark:bg-[#202c33] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#00a884]/40"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#667781] dark:text-[#8696a0] mb-1">
                Category
              </label>
              <input
                type="text"
                value={profForm.category}
                onChange={(e) => setProfForm({ ...profForm, category: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[#f0f2f5] dark:bg-[#202c33] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#00a884]/40"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#667781] dark:text-[#8696a0] mb-1">
                Description
              </label>
              <textarea
                rows={3}
                value={profForm.description}
                onChange={(e) => setProfForm({ ...profForm, description: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[#f0f2f5] dark:bg-[#202c33] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#00a884]/40 resize-none"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#667781] dark:text-[#8696a0] mb-1">
                Business hours
              </label>
              <input
                type="text"
                value={profForm.hours}
                onChange={(e) => setProfForm({ ...profForm, hours: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[#f0f2f5] dark:bg-[#202c33] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#00a884]/40"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#667781] dark:text-[#8696a0] mb-1">
                Address
              </label>
              <input
                type="text"
                value={profForm.address}
                onChange={(e) => setProfForm({ ...profForm, address: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[#f0f2f5] dark:bg-[#202c33] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#00a884]/40"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[12px] font-medium text-[#667781] dark:text-[#8696a0] mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={profForm.email}
                  onChange={(e) => setProfForm({ ...profForm, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-[#f0f2f5] dark:bg-[#202c33] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#00a884]/40"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#667781] dark:text-[#8696a0] mb-1">
                  Website
                </label>
                <input
                  type="text"
                  value={profForm.website}
                  onChange={(e) => setProfForm({ ...profForm, website: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-[#f0f2f5] dark:bg-[#202c33] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#00a884]/40"
                />
              </div>
            </div>

            <label className="flex items-center gap-2.5 pt-1 text-[13.5px] cursor-pointer">
              <input
                type="checkbox"
                checked={profForm.verified}
                onChange={(e) => setProfForm({ ...profForm, verified: e.target.checked })}
                className="accent-[#00a884] w-4 h-4"
              />
              <span>Show Official Business Account verified badge</span>
            </label>

            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-[#00a884] text-white text-[14px] font-semibold hover:bg-[#008f72] transition-colors"
            >
              Save business profile
            </button>
          </form>
        )}

        {/* CATALOG */}
        {section === 'catalog' && (
          <div className="p-4 space-y-4">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!catName.trim() || !catPrice.trim()) return;
                await onSaveCatalogItem({
                  name: catName.trim(),
                  price: catPrice.trim(),
                  sku: catSku.trim() || undefined,
                  description: catDesc.trim(),
                  currency: 'USD',
                });
                setCatName('');
                setCatPrice('');
                setCatSku('');
                setCatDesc('');
                flashSaved('Added');
              }}
              className="p-3.5 rounded-lg bg-[#f7f8fa] dark:bg-[#202c33] space-y-2.5 border border-[#e9edef] dark:border-[#2a3942]"
            >
              <div className="text-[13px] font-semibold text-[#111b21] dark:text-[#e9edef]">
                Add catalog item
              </div>
              <input
                type="text"
                required
                placeholder="Product name"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                className="w-full px-3 py-1.5 rounded-md bg-white dark:bg-[#111b21] text-[13.5px] border border-[#d1d7db] dark:border-[#374248]"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Price (29.00)"
                  value={catPrice}
                  onChange={(e) => setCatPrice(e.target.value)}
                  className="px-3 py-1.5 rounded-md bg-white dark:bg-[#111b21] text-[13px] font-mono border border-[#d1d7db] dark:border-[#374248]"
                />
                <input
                  type="text"
                  placeholder="SKU (optional)"
                  value={catSku}
                  onChange={(e) => setCatSku(e.target.value)}
                  className="px-3 py-1.5 rounded-md bg-white dark:bg-[#111b21] text-[13px] font-mono border border-[#d1d7db] dark:border-[#374248]"
                />
              </div>
              <input
                type="text"
                placeholder="Short description"
                value={catDesc}
                onChange={(e) => setCatDesc(e.target.value)}
                className="w-full px-3 py-1.5 rounded-md bg-white dark:bg-[#111b21] text-[13.5px] border border-[#d1d7db] dark:border-[#374248]"
              />
              <button
                type="submit"
                className="w-full py-2 rounded-md bg-[#00a884] text-white text-[13px] font-semibold hover:bg-[#008f72] flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Add product
              </button>
            </form>

            <div className="space-y-3">
              {catalog.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-[#e9edef] dark:border-[#2a3942] overflow-hidden bg-white dark:bg-[#182229]"
                >
                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-32 object-cover"
                    />
                  )}
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[14.5px] font-semibold text-[#111b21] dark:text-[#e9edef]">
                          {item.name}
                        </div>
                        <div className="text-[12px] font-mono tabular-nums text-[#008069] dark:text-[#25d366] mt-0.5">
                          {item.currency} {item.price} · {item.sku}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void onDeleteCatalogItem(item.id)}
                        aria-label={`Delete ${item.name}`}
                        className="p-1.5 rounded text-[#8696a0] hover:text-[#ea0038]"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {item.description && (
                      <p className="mt-1.5 text-[12.5px] text-[#667781] dark:text-[#8696a0]">
                        {item.description}
                      </p>
                    )}
                    {selectedChatId && (
                      <button
                        type="button"
                        onClick={() => void onSendCatalogToChat(item.id)}
                        className="mt-2.5 w-full py-1.5 rounded-md border border-[#00a884] text-[#008069] dark:text-[#25d366] text-[12.5px] font-semibold hover:bg-[#00a884]/10 flex items-center justify-center gap-1.5"
                      >
                        <Send className="w-3.5 h-3.5" /> Send to active chat
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* QUICK REPLIES */}
        {section === 'quick_replies' && (
          <div className="p-4 space-y-4">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!qrShortcut.trim() || !qrMessage.trim()) return;
                await onSaveQuickReply({ shortcut: qrShortcut.trim(), message: qrMessage.trim() });
                setQrShortcut('');
                setQrMessage('');
                flashSaved('Added');
              }}
              className="p-3.5 rounded-lg bg-[#f7f8fa] dark:bg-[#202c33] space-y-2.5 border border-[#e9edef] dark:border-[#2a3942]"
            >
              <div className="text-[13px] font-semibold">New quick reply</div>
              <input
                type="text"
                required
                placeholder="Shortcut (e.g. shipping)"
                value={qrShortcut}
                onChange={(e) => setQrShortcut(e.target.value)}
                className="w-full px-3 py-1.5 rounded-md bg-white dark:bg-[#111b21] text-[13.5px] font-mono border border-[#d1d7db] dark:border-[#374248]"
              />
              <textarea
                rows={2}
                required
                placeholder="Message text inserted when typing /shortcut"
                value={qrMessage}
                onChange={(e) => setQrMessage(e.target.value)}
                className="w-full px-3 py-1.5 rounded-md bg-white dark:bg-[#111b21] text-[13.5px] border border-[#d1d7db] dark:border-[#374248] resize-none"
              />
              <button
                type="submit"
                className="w-full py-2 rounded-md bg-[#00a884] text-white text-[13px] font-semibold hover:bg-[#008f72]"
              >
                Save quick reply
              </button>
            </form>

            <div className="divide-y divide-[#f0f2f5] dark:divide-[#202c33] border border-[#e9edef] dark:border-[#2a3942] rounded-lg">
              {quickReplies.map((qr) => (
                <div key={qr.id} className="p-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-mono font-semibold text-[#008069] dark:text-[#25d366]">
                      /{qr.shortcut}
                    </div>
                    <p className="text-[13px] text-[#3b4a54] dark:text-[#d1d7db] mt-0.5 leading-snug">
                      {qr.message}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void onDeleteQuickReply(qr.id)}
                    aria-label={`Delete /${qr.shortcut}`}
                    className="p-1.5 text-[#8696a0] hover:text-[#ea0038] shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* LABELS */}
        {section === 'labels' && (
          <div className="p-4 space-y-4">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!lblName.trim()) return;
                await onSaveLabel({ name: lblName.trim(), color: lblColor });
                setLblName('');
                flashSaved('Created');
              }}
              className="p-3.5 rounded-lg bg-[#f7f8fa] dark:bg-[#202c33] space-y-2.5 border border-[#e9edef] dark:border-[#2a3942]"
            >
              <div className="text-[13px] font-semibold">Create label</div>
              <input
                type="text"
                required
                placeholder="Label name (e.g. Escalated)"
                value={lblName}
                onChange={(e) => setLblName(e.target.value)}
                className="w-full px-3 py-1.5 rounded-md bg-white dark:bg-[#111b21] text-[13.5px] border border-[#d1d7db] dark:border-[#374248]"
              />
              <div className="flex items-center gap-2">
                {LABEL_SWATCHES.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    onClick={() => setLblColor(swatch)}
                    aria-label={`Select color ${swatch}`}
                    className={`w-6 h-6 rounded-full transition-transform ${
                      lblColor === swatch ? 'ring-2 ring-offset-2 ring-[#111b21] dark:ring-white scale-110' : ''
                    }`}
                    style={{ backgroundColor: swatch }}
                  />
                ))}
              </div>
              <button
                type="submit"
                className="w-full py-2 rounded-md bg-[#00a884] text-white text-[13px] font-semibold hover:bg-[#008f72]"
              >
                Add label
              </button>
            </form>

            <div className="divide-y divide-[#f0f2f5] dark:divide-[#202c33] border border-[#e9edef] dark:border-[#2a3942] rounded-lg">
              {labels.map((lbl) => {
                const count = chats.filter((c) => (c.labelIds || []).includes(lbl.id)).length;
                return (
                  <div key={lbl.id} className="px-3.5 py-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <Tag className="w-4 h-4 shrink-0" style={{ color: lbl.color }} />
                      <div className="min-w-0">
                        <div className="text-[14px] font-medium truncate">{lbl.name}</div>
                        <div className="text-[12px] font-mono tabular-nums text-[#667781] dark:text-[#8696a0]">
                          {count} {count === 1 ? 'chat' : 'chats'}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void onDeleteLabel(lbl.id)}
                      aria-label={`Delete label ${lbl.name}`}
                      className="p-1.5 text-[#8696a0] hover:text-[#ea0038]"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* GREETING & AWAY AUTOMATION */}
        {section === 'automation' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await onUpdateAutomation(autoForm);
              flashSaved('Saved');
            }}
            className="p-4 space-y-5"
          >
            <div className="p-3.5 rounded-lg border border-[#e9edef] dark:border-[#2a3942] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[14.5px] font-semibold">Greeting message</span>
                <label className="inline-flex items-center gap-2 text-[13px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoForm.greetingEnabled}
                    onChange={(e) =>
                      setAutoForm({ ...autoForm, greetingEnabled: e.target.checked })
                    }
                    className="accent-[#00a884] w-4 h-4"
                  />
                  <span>Enabled</span>
                </label>
              </div>
              <p className="text-[12px] text-[#667781] dark:text-[#8696a0]">
                Automatically sent when a customer sends their first inbound message in Business mode.
              </p>
              <textarea
                rows={3}
                value={autoForm.greetingMessage}
                onChange={(e) =>
                  setAutoForm({ ...autoForm, greetingMessage: e.target.value })
                }
                aria-label="Greeting message text"
                className="w-full px-3 py-2 rounded-lg bg-[#f0f2f5] dark:bg-[#202c33] text-[13.5px] focus:outline-none focus:ring-2 focus:ring-[#00a884]/40 resize-none"
              />
            </div>

            <div className="p-3.5 rounded-lg border border-[#e9edef] dark:border-[#2a3942] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[14.5px] font-semibold flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-[#00a884]" /> Away message
                </span>
                <label className="inline-flex items-center gap-2 text-[13px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoForm.awayEnabled}
                    onChange={(e) =>
                      setAutoForm({ ...autoForm, awayEnabled: e.target.checked })
                    }
                    className="accent-[#00a884] w-4 h-4"
                  />
                  <span>Enabled</span>
                </label>
              </div>
              <p className="text-[12px] text-[#667781] dark:text-[#8696a0]">
                When enabled, immediately auto-replies to inbound customer messages with your away notice.
              </p>
              <select
                value={autoForm.awaySchedule}
                onChange={(e) =>
                  setAutoForm({
                    ...autoForm,
                    awaySchedule: e.target.value as BusinessAutomation['awaySchedule'],
                  })
                }
                aria-label="Away message schedule"
                className="w-full px-3 py-2 rounded-lg bg-[#f0f2f5] dark:bg-[#202c33] text-[13.5px]"
              >
                <option value="always">Always send</option>
                <option value="outside_hours">Outside business hours</option>
                <option value="custom">Custom QA schedule</option>
              </select>
              <textarea
                rows={3}
                value={autoForm.awayMessage}
                onChange={(e) =>
                  setAutoForm({ ...autoForm, awayMessage: e.target.value })
                }
                aria-label="Away message text"
                className="w-full px-3 py-2 rounded-lg bg-[#f0f2f5] dark:bg-[#202c33] text-[13.5px] focus:outline-none focus:ring-2 focus:ring-[#00a884]/40 resize-none"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-[#00a884] text-white text-[14px] font-semibold hover:bg-[#008f72]"
            >
              Save messaging rules
            </button>
          </form>
        )}
      </div>
    </aside>
  );
}
