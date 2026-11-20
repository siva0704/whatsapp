import { useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Clock,
  MessageSquareHeart,
  Plus,
  Send,
  ShoppingBag,
  Store,
  Tag,
  Trash2,
  Zap,
} from 'lucide-react';
import type {
  BusinessAutomation,
  BusinessLabel,
  BusinessProfile,
  CatalogItemRef,
  Chat,
  QuickReply,
} from '../../shared/types';
import { Avatar } from './Avatar';

type BizSection = 'overview' | 'profile' | 'catalog' | 'quick_replies' | 'labels' | 'automation';

interface BusinessToolsPanelProps {
  profile: BusinessProfile;
  automation: BusinessAutomation;
  catalog: CatalogItemRef[];
  quickReplies: QuickReply[];
  labels: BusinessLabel[];
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
}

const LABEL_SWATCHES = ['#00a884', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6'];

export function BusinessToolsPanel({
  profile,
  automation,
  catalog,
  quickReplies,
  labels,
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

  const flashSaved = (label: string) => {
    setSavedFeedback(label);
    setTimeout(() => setSavedFeedback(null), 2000);
  };

  const openSection = (next: BizSection) => {
    if (next === 'profile') setProfForm(profile);
    if (next === 'automation') setAutoForm(automation);
    setSection(next);
  };

  const titleMap: Record<BizSection, string> = {
    overview: 'Business tools',
    profile: 'Business profile',
    catalog: 'Catalog',
    quick_replies: 'Quick replies',
    labels: 'Labels',
    automation: 'Greeting & away',
  };

  return (
    <aside
      aria-label="WhatsApp Business tools"
      className="w-full md:w-[375px] lg:w-[405px] shrink-0 h-full bg-white dark:bg-[#111b21] border-r border-[#e9edef] dark:border-[#222d34] flex flex-col"
    >
      <header className="h-[60px] px-4 bg-[#f0f2f5] dark:bg-[#202c33] border-b border-[#d1d7db] dark:border-[#2a3942] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          {section !== 'overview' && (
            <button
              type="button"
              onClick={() => setSection('overview')}
              aria-label="Back to Business tools"
              className="w-8 h-8 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/10"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h1 className="text-[18px] font-bold text-[#111b21] dark:text-[#e9edef]">
            {titleMap[section]}
          </h1>
        </div>
        {savedFeedback && (
          <span className="text-[12px] font-medium text-[#00a884]">{savedFeedback}</span>
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
                  {profile.category}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => openSection('profile')}
              className="w-full px-4 py-3.5 flex items-center gap-4 text-left hover:bg-[#f5f6f6] dark:hover:bg-[#202c33] transition-colors"
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
              className="w-full px-4 py-3.5 flex items-center gap-4 text-left hover:bg-[#f5f6f6] dark:hover:bg-[#202c33] transition-colors"
            >
              <ShoppingBag className="w-5 h-5 text-[#00a884] shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-medium text-[#111b21] dark:text-[#e9edef]">
                  Catalog
                </div>
                <div className="text-[12.5px] text-[#667781] dark:text-[#8696a0]">
                  {catalog.length} products · Send product cards into chats
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => openSection('quick_replies')}
              className="w-full px-4 py-3.5 flex items-center gap-4 text-left hover:bg-[#f5f6f6] dark:hover:bg-[#202c33] transition-colors"
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
              className="w-full px-4 py-3.5 flex items-center gap-4 text-left hover:bg-[#f5f6f6] dark:hover:bg-[#202c33] transition-colors"
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
              className="w-full px-4 py-3.5 flex items-center gap-4 text-left hover:bg-[#f5f6f6] dark:hover:bg-[#202c33] transition-colors"
            >
              <MessageSquareHeart className="w-5 h-5 text-[#00a884] shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-medium text-[#111b21] dark:text-[#e9edef]">
                  Greeting & away messages
                </div>
                <div className="text-[12.5px] text-[#667781] dark:text-[#8696a0]">
                  Greeting {automation.greetingEnabled ? 'On' : 'Off'} · Away{' '}
                  {automation.awayEnabled ? 'On' : 'Off'}
                </div>
              </div>
            </button>
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
                const count = chats.filter((c) => c.labelIds.includes(lbl.id)).length;
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
