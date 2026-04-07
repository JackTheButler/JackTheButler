import { Mail, MessageSquare, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';

// SVG-based channels — share the same files as AppIcon
const svgChannels: Record<string, { src: string; label: string }> = {
  whatsapp: { src: '/icons/whatsapp.svg', label: 'WhatsApp' },
  telegram: { src: '/icons/telegram.svg', label: 'Telegram' },
  webchat: { src: '/icons/chat-round.svg', label: 'Web Chat' },
  web: { src: '/icons/chat-round.svg', label: 'Web Chat' },
};

// Lucide-based channels
const lucideChannels: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string }> = {
  sms: { icon: Phone, label: 'SMS' },
  email: { icon: Mail, label: 'Email' },
};

interface ChannelIconProps {
  channel: string;
  className?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  boxed?: boolean;
  inverted?: boolean;
}

const sizeClass = { sm: 'w-3.5 h-3.5', md: 'w-4 h-4', lg: 'w-5 h-5' };

export function ChannelIcon({ channel, className, showLabel = false, size = 'sm', boxed = false, inverted = false }: ChannelIconProps) {
  const key = channel.toLowerCase();
  const svg = svgChannels[key];
  const lucide = lucideChannels[key];
  const label = svg?.label ?? lucide?.label ?? channel;
  const iconSize = sizeClass[size];

  const icon = svg ? (
    <img
      src={svg.src}
      alt={label}
      className={cn(iconSize, inverted ? 'invert dark:invert-0' : 'dark:invert')}
    />
  ) : lucide ? (
    <lucide.icon className={cn(iconSize, inverted ? 'text-background' : 'text-muted-foreground')} />
  ) : (
    <MessageSquare className={cn(iconSize, inverted ? 'text-background' : 'text-muted-foreground')} />
  );

  if (showLabel) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-muted-foreground', className)}>
        {icon}
        <span className="text-xs">{label}</span>
      </span>
    );
  }

  if (boxed) {
    return (
      <Tooltip content={label}>
        <span className={cn(
          'inline-flex items-center justify-center p-2 rounded-md',
          inverted ? 'bg-foreground' : 'bg-muted',
          className
        )}>
          {icon}
        </span>
      </Tooltip>
    );
  }

  return (
    <Tooltip content={label}>
      <span className={className}>{icon}</span>
    </Tooltip>
  );
}
