export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatChatListDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isSameDay) {
    return formatTime(iso);
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (isYesterday) return 'Yesterday';

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function formatDateDivider(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'TODAY';
  const now = new Date();
  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isSameDay) return 'TODAY';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (isYesterday) return 'YESTERDAY';

  return date.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
}

export function getDayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '12 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const SENDER_COLORS = [
  '#008069',
  '#1f7aec',
  '#8b5cf6',
  '#d946ef',
  '#ea580c',
  '#0891b2',
  '#ca8a04',
];

export function getSenderColor(senderId: string): string {
  let hash = 0;
  for (let i = 0; i < senderId.length; i += 1) {
    hash = (hash * 31 + senderId.charCodeAt(i)) | 0;
  }
  return SENDER_COLORS[Math.abs(hash) % SENDER_COLORS.length];
}

export const CUSTOMER_WINDOW_MS = 24 * 60 * 60 * 1000;

export function getWindowStatus(lastInboundAt?: string | null): {
  open: boolean;
  remainingMs: number;
  label: string;
} {
  if (!lastInboundAt) {
    return { open: false, remainingMs: 0, label: 'No inbound yet' };
  }
  const ts = new Date(lastInboundAt).getTime();
  if (Number.isNaN(ts)) {
    return { open: false, remainingMs: 0, label: 'Closed' };
  }
  const remainingMs = Math.max(0, ts + CUSTOMER_WINDOW_MS - Date.now());
  if (remainingMs <= 0) {
    return { open: false, remainingMs: 0, label: '24h window closed' };
  }
  const totalMins = Math.floor(remainingMs / 60000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return {
    open: true,
    remainingMs,
    label: hours > 0 ? `${hours}h ${mins}m left` : `${Math.max(1, mins)}m left`,
  };
}

