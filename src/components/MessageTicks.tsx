import { AlertCircle, Clock } from 'lucide-react';
import type { MessageStatus } from '../../shared/types';

interface MessageTicksProps {
  status: MessageStatus;
  className?: string;
}

export function MessageTicks({ status, className = '' }: MessageTicksProps) {
  if (status === 'queued') {
    return (
      <Clock
        aria-label="Message queued"
        className={`w-3.5 h-3.5 text-[#667781] dark:text-[#8696a0] shrink-0 ${className}`}
      />
    );
  }

  if (status === 'failed') {
    return (
      <AlertCircle
        aria-label="Message failed"
        className={`w-3.5 h-3.5 text-[#ea0038] shrink-0 ${className}`}
      />
    );
  }

  if (status === 'sent') {
    return (
      <svg
        aria-label="Message sent"
        viewBox="0 0 16 11"
        width="16"
        height="11"
        fill="none"
        className={`shrink-0 text-[#667781] dark:text-[#8696a0] ${className}`}
      >
        <path
          d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.405-2.272a.463.463 0 0 0-.336-.146.47.47 0 0 0-.343.146l-.311.31a.445.445 0 0 0-.14.337c0 .136.047.25.14.343l2.996 2.996a.724.724 0 0 0 .501.203.697.697 0 0 0 .546-.266l6.646-8.417a.497.497 0 0 0 .108-.299.441.441 0 0 0-.19-.374l-.337-.273z"
          fill="currentColor"
        />
      </svg>
    );
  }

  const isRead = status === 'read';

  return (
    <svg
      aria-label={isRead ? 'Message read' : 'Message delivered'}
      viewBox="0 0 16 11"
      width="16"
      height="11"
      fill="none"
      className={`shrink-0 ${
        isRead ? 'text-[#53bdeb]' : 'text-[#667781] dark:text-[#8696a0]'
      } ${className}`}
    >
      <path
        d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.405-2.272a.463.463 0 0 0-.336-.146.47.47 0 0 0-.343.146l-.311.31a.445.445 0 0 0-.14.337c0 .136.047.25.14.343l2.996 2.996a.724.724 0 0 0 .501.203.697.697 0 0 0 .546-.266l6.646-8.417a.497.497 0 0 0 .108-.299.441.441 0 0 0-.19-.374l-.337-.273z"
        fill="currentColor"
      />
      <path
        d="M15.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-1.2-1.134-.65.798 1.546 1.546a.724.724 0 0 0 .501.203.697.697 0 0 0 .546-.266l6.646-8.417a.497.497 0 0 0 .108-.299.441.441 0 0 0-.19-.374l-.337-.273z"
        fill="currentColor"
      />
    </svg>
  );
}
