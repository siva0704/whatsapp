import { useEffect, useState } from 'react';
import { Mic, Pause, Play } from 'lucide-react';
import type { MediaAttachment } from '../../shared/types';
import { formatDuration } from '../utils/format';
import { Avatar } from './Avatar';

interface VoiceNoteBubbleProps {
  media?: MediaAttachment;
  senderName: string;
  senderAvatarUrl?: string;
  senderColor?: string;
  isOutbound: boolean;
}

const DEFAULT_WAVEFORM = [20, 38, 60, 48, 82, 74, 52, 34, 70, 92, 65, 44, 30, 56, 78, 52, 34, 24, 42, 28];

export function VoiceNoteBubble({
  media,
  senderName,
  senderAvatarUrl,
  senderColor = '#00a884',
  isOutbound,
}: VoiceNoteBubbleProps) {
  const duration = media?.durationSec || 12;
  const bars = Array.isArray(media?.waveform) && media.waveform.length > 0 ? media.waveform : DEFAULT_WAVEFORM;

  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [speed, setSpeed] = useState<1 | 1.5 | 2>(1);

  useEffect(() => {
    if (!playing) return;
    const stepMs = 100;
    const interval = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + (stepMs / 1000) * speed;
        if (next >= duration) {
          setPlaying(false);
          return 0;
        }
        return next;
      });
    }, stepMs);
    return () => clearInterval(interval);
  }, [playing, speed, duration]);

  const progress = Math.min(1, elapsed / Math.max(1, duration));

  const cycleSpeed = () => {
    setSpeed((prev) => (prev === 1 ? 1.5 : prev === 1.5 ? 2 : 1));
  };

  return (
    <div className="flex items-center gap-3 min-w-[238px] max-w-[290px] py-0.5">
      <button
        type="button"
        onClick={() => setPlaying((p) => !p)}
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
      >
        {playing ? (
          <Pause className="w-5 h-5 fill-current" />
        ) : (
          <Play className="w-5 h-5 fill-current ml-0.5" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-[2.5px] h-7" aria-hidden="true">
          {bars.map((val, idx) => {
            const barRatio = idx / bars.length;
            const active = barRatio <= progress;
            const heightPct = Math.max(18, Math.min(100, val));
            return (
              <button
                key={idx}
                type="button"
                tabIndex={-1}
                onClick={() => setElapsed(barRatio * duration)}
                className="flex-1 h-full flex items-center justify-center group"
              >
                <span
                  className={`w-[3px] rounded-full transition-colors ${
                    active
                      ? 'bg-[#53bdeb]'
                      : isOutbound
                        ? 'bg-[#7aa893] dark:bg-[#5b8e80]'
                        : 'bg-[#b3bec4] dark:bg-[#5f6f79]'
                  }`}
                  style={{ height: `${heightPct}%` }}
                />
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[11px] font-mono tabular-nums text-[#667781] dark:text-[#8696a0]">
            {playing || elapsed > 0 ? formatDuration(elapsed) : formatDuration(duration)}
          </span>
          <button
            type="button"
            onClick={cycleSpeed}
            aria-label={`Playback speed ${speed}x`}
            className="text-[10px] font-semibold font-mono tabular-nums px-1.5 py-0.5 rounded bg-black/8 dark:bg-white/10 text-[#54656f] dark:text-[#d1d7db] hover:bg-black/15 transition-colors"
          >
            {speed}x
          </button>
        </div>
      </div>

      <div className="relative shrink-0">
        <Avatar
          name={senderName}
          avatarUrl={senderAvatarUrl}
          color={senderColor}
          size="sm"
        />
        <span className="absolute -bottom-0.5 -left-1 w-4 h-4 rounded-full bg-white dark:bg-[#202c33] flex items-center justify-center shadow-xs">
          <Mic className="w-2.5 h-2.5 text-[#00a884]" />
        </span>
      </div>
    </div>
  );
}
