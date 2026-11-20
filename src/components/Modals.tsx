import { useState } from 'react';
import { Check, X } from 'lucide-react';
import type { Contact } from '../../shared/types';
import { Avatar } from './Avatar';

interface NewChatModalProps {
  contacts: Contact[];
  onClose: () => void;
  onSelectExistingContact: (contact: Contact) => void;
  onCreateContact: (input: {
    name: string;
    phone: string;
    about?: string;
    isBot?: boolean;
  }) => Promise<void>;
}

export function NewChatModal({
  contacts,
  onClose,
  onSelectExistingContact,
  onCreateContact,
}: NewChatModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [about, setAbout] = useState('');
  const [isBot, setIsBot] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;
    await onCreateContact({
      name: name.trim() || phone.trim(),
      phone: phone.trim(),
      about: about.trim() || undefined,
      isBot,
    });
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New chat"
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-[#202c33] shadow-2xl border border-[#e9edef] dark:border-[#374248] overflow-hidden">
        <div className="px-5 py-4 bg-[#f0f2f5] dark:bg-[#111b21] flex items-center justify-between border-b border-[#d1d7db] dark:border-[#2a3942]">
          <h2 className="text-[16px] font-bold">New chat / Add contact</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3 border-b border-[#f0f2f5] dark:border-[#2a3942]">
          <div>
            <label className="block text-[12px] font-medium text-[#667781] dark:text-[#8696a0] mb-1">
              Phone number (E.164)
            </label>
            <input
              type="text"
              required
              placeholder="+14155550155"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#f0f2f5] dark:bg-[#111b21] text-[14px] font-mono"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#667781] dark:text-[#8696a0] mb-1">
              Contact name
            </label>
            <input
              type="text"
              placeholder="Samira QA"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#f0f2f5] dark:bg-[#111b21] text-[14px]"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#667781] dark:text-[#8696a0] mb-1">
              About
            </label>
            <input
              type="text"
              placeholder="Simulated test contact"
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#f0f2f5] dark:bg-[#111b21] text-[14px]"
            />
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
            Create & open chat
          </button>
        </form>

        <div className="max-h-48 overflow-y-auto wa-scroll p-2">
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
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/10"
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
