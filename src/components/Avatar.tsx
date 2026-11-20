import { useState } from 'react';
import { Bot, Users } from 'lucide-react';
import { getInitials } from '../utils/format';

interface AvatarProps {
  name: string;
  avatarUrl?: string;
  color?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  isGroup?: boolean;
  isBot?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'w-7 h-7 text-[11px]',
  sm: 'w-9 h-9 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-28 h-28 text-3xl',
};

export function Avatar({
  name,
  avatarUrl,
  color = '#00a884',
  size = 'md',
  isGroup = false,
  isBot = false,
  className = '',
}: AvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);

  const showImg = Boolean(avatarUrl) && !imgFailed;

  return (
    <div
      className={`relative rounded-full overflow-hidden shrink-0 flex items-center justify-center font-semibold text-white select-none ${SIZE_CLASSES[size]} ${className}`}
      style={{ backgroundColor: showImg ? '#dfe5e7' : color }}
    >
      {showImg ? (
        <img
          src={avatarUrl}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : isGroup ? (
        <Users className={size === 'xl' ? 'w-11 h-11' : 'w-5 h-5'} strokeWidth={1.9} />
      ) : isBot ? (
        <Bot className={size === 'xl' ? 'w-11 h-11' : 'w-5 h-5'} strokeWidth={1.9} />
      ) : (
        <span>{getInitials(name)}</span>
      )}
    </div>
  );
}
