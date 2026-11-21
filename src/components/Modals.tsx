import { useMemo, useState } from 'react';
import { Check, SendHorizontal, Sparkles, X } from 'lucide-react';
import type {
  Contact,
  ContactCardPayload,
  InteractivePayload,
  LocationPayload,
  MessageTemplate,
  OptInStatus,
  OrderPayload,
} from '../../shared/types';
import { ApiRequestError } from '../services/api';
import { Avatar } from './Avatar';

interface NewChatModalProps {
  contacts: Contact[];
  onClose: () => void;
  onSelectExistingContact: (contact: Contact) => void;
  onCreateContact: (input: {
    name: string;
    profileName?: string;
    phone: string;
    about?: string;
    isBot?: boolean;
    optInStatus?: OptInStatus;
  }) => Promise<void>;
}

export function NewChatModal({
  contacts,
  onClose,
  onSelectExistingContact,
  onCreateContact,
}: NewChatModalProps) {
  const [name, setName] = useState('');
  const [profileName, setProfileName] = useState('');
  const [phone, setPhone] = useState('');
  const [about, setAbout] = useState('');
  const [isBot, setIsBot] = useState(false);
  const [optInStatus, setOptInStatus] = useState<OptInStatus>('opted_in');
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg(null);
    if (!phone.trim()) return;
    try {
      await onCreateContact({
        name: name.trim() || phone.trim(),
        profileName: profileName.trim() || undefined,
        phone: phone.trim(),
        about: about.trim() || undefined,
        isBot,
        optInStatus,
      });
      onClose();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Invalid E.164 phone number');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New chat"
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md max-h-[90dvh] flex flex-col rounded-xl bg-white dark:bg-[#202c33] shadow-2xl border border-[#e9edef] dark:border-[#374248] overflow-hidden">
        <div className="px-5 py-4 bg-[#f0f2f5] dark:bg-[#111b21] flex items-center justify-between border-b border-[#d1d7db] dark:border-[#2a3942] shrink-0">
          <h2 className="text-[16px] font-bold">New chat / Add contact</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-9 h-9 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3 border-b border-[#f0f2f5] dark:border-[#2a3942] overflow-y-auto">
          {errMsg && (
            <div className="p-2.5 rounded-lg bg-[#ea0038]/10 text-[#b91c1c] dark:text-[#fca5a5] text-[12.5px]">
              {errMsg}
            </div>
          )}
          <div>
            <label className="block text-[12px] font-medium text-[#667781] dark:text-[#8696a0] mb-1">
              Phone number (E.164 format)
            </label>
            <input
              type="text"
              required
              placeholder="E.164 phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#f0f2f5] dark:bg-[#111b21] text-[14px] font-mono"
            />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[12px] font-medium text-[#667781] dark:text-[#8696a0] mb-1">
                Contact name
              </label>
              <input
                type="text"
                placeholder="Contact name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#f0f2f5] dark:bg-[#111b21] text-[14px]"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#667781] dark:text-[#8696a0] mb-1">
                Profile name (~)
              </label>
              <input
                type="text"
                placeholder="Profile name"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#f0f2f5] dark:bg-[#111b21] text-[14px]"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[12px] font-medium text-[#667781] dark:text-[#8696a0] mb-1">
                About
              </label>
              <input
                type="text"
                placeholder="Simulated peer"
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#f0f2f5] dark:bg-[#111b21] text-[13.5px]"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#667781] dark:text-[#8696a0] mb-1">
                Opt-in status
              </label>
              <select
                value={optInStatus}
                onChange={(e) => setOptInStatus(e.target.value as OptInStatus)}
                className="w-full px-2.5 py-2 rounded-lg bg-[#f0f2f5] dark:bg-[#111b21] text-[13px]"
              >
                <option value="opted_in">Opted in</option>
                <option value="unknown">Unknown</option>
                <option value="opted_out">Opted out</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-[13px] cursor-pointer">
            <input
              type="checkbox"
              checked={isBot}
              onChange={(e) => setIsBot(e.target.checked)}
              className="accent-[#00a884]"
            />
            <span>Mark as simulated bot peer</span>
          </label>
          <button
            type="submit"
            className="w-full py-2.5 rounded-lg bg-[#00a884] text-white text-[14px] font-semibold hover:bg-[#008f72]"
          >
            Create &amp; open chat
          </button>
        </form>

        <div className="max-h-44 overflow-y-auto wa-scroll p-2">
          <div className="px-3 py-1.5 text-[11.5px] font-semibold text-[#667781] dark:text-[#8696a0]">
            Existing contacts
          </div>
          {contacts.map((ct) => (
            <button
              key={ct.id}
              type="button"
              onClick={() => {
                onSelectExistingContact(ct);
                onClose();
              }}
              className="w-full px-3 py-2 rounded-lg hover:bg-[#f5f6f6] dark:hover:bg-[#182229] flex items-center gap-3 text-left"
            >
              <Avatar name={ct.name} avatarUrl={ct.avatarUrl} color={ct.avatarColor} size="sm" isBot={ct.isBot} />
              <div className="min-w-0">
                <div className="text-[14px] font-medium truncate">{ct.name}</div>
                <div className="text-[12px] font-mono text-[#667781] dark:text-[#8696a0]">{ct.phone}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface NewGroupModalProps {
  contacts: Contact[];
  onClose: () => void;
  onCreateGroup: (input: { name: string; description?: string; participantIds: string[] }) => Promise<void>;
}

export function NewGroupModal({ contacts, onClose, onCreateGroup }: NewGroupModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onCreateGroup({
      name: name.trim(),
      description: description.trim() || undefined,
      participantIds: selectedIds,
    });
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New group"
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-[#202c33] shadow-2xl border border-[#e9edef] dark:border-[#374248] overflow-hidden">
        <div className="px-5 py-4 bg-[#f0f2f5] dark:bg-[#111b21] flex items-center justify-between border-b border-[#d1d7db] dark:border-[#2a3942]">
          <h2 className="text-[16px] font-bold">New group chat</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-9 h-9 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
          <div>
            <label className="block text-[12px] font-medium text-[#667781] dark:text-[#8696a0] mb-1">
              Group subject
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Webhook Regression Squad"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#f0f2f5] dark:bg-[#111b21] text-[14px]"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#667781] dark:text-[#8696a0] mb-1">
              Description (optional)
            </label>
            <input
              type="text"
              placeholder="Group messaging integration test room"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#f0f2f5] dark:bg-[#111b21] text-[14px]"
            />
          </div>

          <div>
            <div className="text-[12px] font-medium text-[#667781] dark:text-[#8696a0] mb-1.5">
              Select participants ({selectedIds.length})
            </div>
            <div className="max-h-44 overflow-y-auto wa-scroll rounded-lg border border-[#e9edef] dark:border-[#2a3942] divide-y divide-[#f0f2f5] dark:divide-[#2a3942]">
              {contacts.map((ct) => {
                const picked = selectedIds.includes(ct.id);
                return (
                  <button
                    key={ct.id}
                    type="button"
                    onClick={() => toggle(ct.id)}
                    className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-[#f5f6f6] dark:hover:bg-[#182229]"
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Avatar name={ct.name} avatarUrl={ct.avatarUrl} color={ct.avatarColor} size="xs" isBot={ct.isBot} />
                      <span className="text-[13.5px] truncate">{ct.name}</span>
                    </span>
                    <span
                      className={`w-5 h-5 rounded border flex items-center justify-center ${
                        picked ? 'bg-[#00a884] border-[#00a884] text-white' : 'border-[#8696a0]'
                      }`}
                    >
                      {picked && <Check className="w-3.5 h-3.5" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-lg bg-[#00a884] text-white text-[14px] font-semibold hover:bg-[#008f72]"
          >
            Create group
          </button>
        </form>
      </div>
    </div>
  );
}

interface SendTemplateModalProps {
  templates: MessageTemplate[];
  initialTemplateId?: string;
  chatName: string;
  onClose: () => void;
  onSendTemplate: (payload: {
    templateId: string;
    variables: string[];
    otpCode?: string;
  }) => Promise<void>;
}

export function SendTemplateModal({
  templates,
  initialTemplateId,
  chatName,
  onClose,
  onSendTemplate,
}: SendTemplateModalProps) {
  const approved = useMemo(() => templates.filter((t) => t.status === 'APPROVED'), [templates]);
  const [selectedId, setSelectedId] = useState(
    initialTemplateId && approved.some((t) => t.id === initialTemplateId)
      ? initialTemplateId
      : approved[0]?.id || ''
  );

  const activeTemplate = approved.find((t) => t.id === selectedId) || approved[0];
  const [variables, setVariables] = useState<string[]>(() => activeTemplate?.sampleValues || []);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSelectChange = (nextId: string) => {
    setSelectedId(nextId);
    const tpl = approved.find((t) => t.id === nextId);
    setVariables(tpl?.sampleValues ? [...tpl.sampleValues] : []);
    setErrorMsg(null);
  };

  const variableSlots = useMemo(() => {
    if (!activeTemplate) return 0;
    const matches = activeTemplate.bodyText.match(/\{\{\d+\}\}/g) || [];
    const maxIdx = matches.reduce((max, token) => {
      const n = Number(token.replace(/[^\d]/g, ''));
      return Number.isFinite(n) ? Math.max(max, n) : max;
    }, 0);
    return Math.max(maxIdx, activeTemplate.sampleValues.length);
  }, [activeTemplate]);

  const previewText = useMemo(() => {
    if (!activeTemplate) return '';
    return activeTemplate.bodyText.replace(/\{\{(\d+)\}\}/g, (_, numStr) => {
      const idx = Number(numStr) - 1;
      return variables[idx] || activeTemplate.sampleValues[idx] || `{{${numStr}}}`;
    });
  }, [activeTemplate, variables]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTemplate) return;
    setErrorMsg(null);
    try {
      await onSendTemplate({
        templateId: activeTemplate.id,
        variables,
        otpCode: activeTemplate.category === 'AUTHENTICATION' ? variables[0] || '482910' : undefined,
      });
      onClose();
    } catch (err) {
      if (err instanceof ApiRequestError && err.metaError) {
        setErrorMsg(`#${err.metaError.code} ${err.metaError.title}: ${err.metaError.message}`);
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to send template');
      }
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Send template message"
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md max-h-[90dvh] flex flex-col rounded-xl bg-white dark:bg-[#202c33] shadow-2xl border border-[#e9edef] dark:border-[#374248] overflow-hidden">
        <div className="px-5 py-4 bg-[#f0f2f5] dark:bg-[#111b21] flex items-center justify-between border-b border-[#d1d7db] dark:border-[#2a3942]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#00a884]" />
            <h2 className="text-[16px] font-bold">Send template to {chatName}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-9 h-9 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#aebac1]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 overflow-y-auto">
          {errorMsg && (
            <div
              role="alert"
              className="p-2.5 rounded-lg bg-[#ea0038]/12 text-[#b91c1c] dark:text-[#fca5a5] text-[12.5px]"
            >
              {errorMsg}
            </div>
          )}

          {approved.length === 0 ? (
            <p className="text-[13.5px] text-[#667781] dark:text-[#8696a0]">
              No approved templates available. Approve a template in Business Tools first.
            </p>
          ) : (
            <>
              <div>
                <label className="block text-[12px] font-medium text-[#667781] dark:text-[#8696a0] mb-1">
                  Approved template
                </label>
                <select
                  value={activeTemplate?.id || ''}
                  onChange={(e) => handleSelectChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#f0f2f5] dark:bg-[#111b21] text-[13.5px] font-mono"
                >
                  {approved.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.category})
                    </option>
                  ))}
                </select>
              </div>

              {variableSlots > 0 && (
                <div className="space-y-2">
                  <div className="text-[12px] font-medium text-[#667781] dark:text-[#8696a0]">
                    Template variables
                  </div>
                  {Array.from({ length: variableSlots }).map((_, idx) => (
                    <input
                      key={idx}
                      type="text"
                      placeholder={`Variable {{${idx + 1}}}`}
                      value={variables[idx] ?? ''}
                      onChange={(e) => {
                        const next = [...variables];
                        next[idx] = e.target.value;
                        setVariables(next);
                      }}
                      className="w-full px-3 py-1.5 rounded-lg bg-[#f0f2f5] dark:bg-[#111b21] text-[13.5px]"
                    />
                  ))}
                </div>
              )}

              {activeTemplate && (
                <div className="p-3 rounded-lg bg-[#d9fdd3]/70 dark:bg-[#005c4b]/70 space-y-1 text-[13px]">
                  <div className="text-[10.5px] font-mono text-[#008069] dark:text-[#25d366]">
                    LIVE PREVIEW · {activeTemplate.category}
                  </div>
                  {activeTemplate.headerText && (
                    <div className="font-bold">{activeTemplate.headerText}</div>
                  )}
                  <p className="whitespace-pre-wrap leading-snug">{previewText}</p>
                  {activeTemplate.footerText && (
                    <p className="text-[11.5px] opacity-75">{activeTemplate.footerText}</p>
                  )}
                </div>
              )}

              <button
                type="submit"
                className="w-full py-2.5 rounded-lg bg-[#00a884] text-white text-[14px] font-semibold hover:bg-[#008f72] flex items-center justify-center gap-2"
              >
                <SendHorizontal className="w-4 h-4" /> Send template message
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}

type RichKind = 'interactive_button' | 'interactive_list' | 'interactive_cta' | 'location' | 'contacts' | 'order';

interface SendRichMessageModalProps {
  chatName: string;
  onClose: () => void;
  onSendRich: (payload: {
    type: 'interactive' | 'location' | 'contacts' | 'order';
    body?: string;
    interactive?: InteractivePayload;
    location?: LocationPayload;
    contacts?: ContactCardPayload[];
    order?: OrderPayload;
  }) => Promise<void>;
}

export function SendRichMessageModal({ chatName, onClose, onSendRich }: SendRichMessageModalProps) {
  const [kind, setKind] = useState<RichKind>('interactive_button');
  const [bodyText, setBodyText] = useState('');
  const [btn1, setBtn1] = useState('Confirm');
  const [btn2, setBtn2] = useState('Cancel');
  const [ctaText, setCtaText] = useState('Open Link');
  const [ctaUrl, setCtaUrl] = useState('');
  const [locName, setLocName] = useState('');
  const [locAddress, setLocAddress] = useState('');
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg(null);
    try {
      if (kind === 'interactive_button') {
        await onSendRich({
          type: 'interactive',
          interactive: {
            kind: 'button',
            headerText: 'Quick Action',
            bodyText: bodyText.trim() || 'Select an option',
            footerText: 'Tap a button to reply',
            buttons: [
              { id: 'btn_1', title: btn1.trim() || 'Confirm' },
              { id: 'btn_2', title: btn2.trim() || 'Cancel' },
            ],
          },
        });
      } else if (kind === 'interactive_list') {
        await onSendRich({
          type: 'interactive',
          interactive: {
            kind: 'list',
            headerText: 'Menu',
            bodyText: bodyText.trim() || 'Select an option from the list:',
            listButtonText: 'View options',
            sections: [
              {
                title: 'Options',
                rows: [
                  { id: 'opt_1', title: 'Option 1' },
                  { id: 'opt_2', title: 'Option 2' },
                ],
              },
            ],
          },
        });
      } else if (kind === 'interactive_cta') {
        await onSendRich({
          type: 'interactive',
          interactive: {
            kind: 'cta_url',
            headerText: 'Action Link',
            bodyText: bodyText.trim() || 'Open the link below.',
            ctaDisplayText: ctaText.trim() || 'Open Link',
            ctaUrl: ctaUrl.trim() || 'https://example.com',
          },
        });
      } else if (kind === 'location') {
        await onSendRich({
          type: 'location',
          location: {
            latitude: 0,
            longitude: 0,
            name: locName.trim() || 'Shared Location',
            address: locAddress.trim() || undefined,
          },
        });
      } else if (kind === 'contacts') {
        await onSendRich({
          type: 'contacts',
          contacts: [
            {
              name: locName.trim() || 'Contact',
              phone: locAddress.trim() || '',
            },
          ],
        });
      } else if (kind === 'order') {
        await onSendRich({
          type: 'order',
          order: {
            orderId: `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
            currency: 'USD',
            totalAmount: '64.00',
            note: 'Express courier requested',
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
      }
      onClose();
    } catch (err) {
      if (err instanceof ApiRequestError && err.metaError) {
        setErrMsg(`#${err.metaError.code} ${err.metaError.title}: ${err.metaError.message}`);
      } else {
        setErrMsg(err instanceof Error ? err.message : 'Failed to send message');
      }
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Send rich message"
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-[#202c33] shadow-2xl border border-[#e9edef] dark:border-[#374248] overflow-hidden">
        <div className="px-5 py-4 bg-[#f0f2f5] dark:bg-[#111b21] flex items-center justify-between border-b border-[#d1d7db] dark:border-[#2a3942]">
          <h2 className="text-[16px] font-bold">Send rich message to {chatName}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-9 h-9 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#aebac1]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {errMsg && (
            <div className="p-2.5 rounded-lg bg-[#ea0038]/12 text-[#b91c1c] dark:text-[#fca5a5] text-[12.5px]">
              {errMsg}
            </div>
          )}

          <div>
            <label className="block text-[12px] font-medium text-[#667781] dark:text-[#8696a0] mb-1">
              Message type
            </label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as RichKind)}
              className="w-full px-3 py-2 rounded-lg bg-[#f0f2f5] dark:bg-[#111b21] text-[13.5px]"
            >
              <option value="interactive_button">Interactive Reply Buttons</option>
              <option value="interactive_list">Interactive List Menu</option>
              <option value="interactive_cta">Interactive CTA URL Button</option>
              <option value="location">Location Pin</option>
              <option value="contacts">Shared Contact Card (vCard)</option>
              <option value="order">Order Summary Message</option>
            </select>
          </div>

          {(kind === 'interactive_button' || kind === 'interactive_list' || kind === 'interactive_cta') && (
            <div>
              <label className="block text-[12px] font-medium text-[#667781] dark:text-[#8696a0] mb-1">
                Body text
              </label>
              <textarea
                rows={2}
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#f0f2f5] dark:bg-[#111b21] text-[13.5px] resize-none"
              />
            </div>
          )}

          {kind === 'interactive_button' && (
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Button 1"
                value={btn1}
                onChange={(e) => setBtn1(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-[#f0f2f5] dark:bg-[#111b21] text-[13px]"
              />
              <input
                type="text"
                placeholder="Button 2"
                value={btn2}
                onChange={(e) => setBtn2(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-[#f0f2f5] dark:bg-[#111b21] text-[13px]"
              />
            </div>
          )}

          {kind === 'interactive_cta' && (
            <div className="space-y-2">
              <input
                type="text"
                placeholder="CTA label"
                value={ctaText}
                onChange={(e) => setCtaText(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-[#f0f2f5] dark:bg-[#111b21] text-[13px]"
              />
              <input
                type="url"
                placeholder="https://..."
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-[#f0f2f5] dark:bg-[#111b21] text-[13px] font-mono"
              />
            </div>
          )}

          {kind === 'location' && (
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Location name"
                value={locName}
                onChange={(e) => setLocName(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-[#f0f2f5] dark:bg-[#111b21] text-[13px]"
              />
              <input
                type="text"
                placeholder="Street address"
                value={locAddress}
                onChange={(e) => setLocAddress(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-[#f0f2f5] dark:bg-[#111b21] text-[13px]"
              />
            </div>
          )}

          <button
            type="submit"
            className="w-full py-2.5 rounded-lg bg-[#00a884] text-white text-[14px] font-semibold hover:bg-[#008f72]"
          >
            Send message
          </button>
        </form>
      </div>
    </div>
  );
}

interface ImageLightboxProps {
  url: string;
  caption?: string;
  onClose: () => void;
}

export function ImageLightbox({ url, caption, onClose }: ImageLightboxProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 flex flex-col items-center justify-center p-6"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close image preview"
        className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center"
      >
        <X className="w-5 h-5" />
      </button>
      <img
        src={url}
        alt={caption || 'Media preview'}
        referrerPolicy="no-referrer"
        onClick={(e) => e.stopPropagation()}
        className="max-w-full max-h-[80vh] rounded-lg object-contain shadow-2xl"
      />
      {caption && (
        <p className="mt-4 text-[14px] text-white/90 text-center max-w-xl">{caption}</p>
      )}
    </div>
  );
}
