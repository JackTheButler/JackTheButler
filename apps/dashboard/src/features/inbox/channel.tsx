import { Globe, Send, Phone } from 'lucide-react';
import type { Channel } from '@/mock/fixtures';

const MAP = {
  webchat: { Icon: Globe, label: 'Webchat' },
  telegram: { Icon: Send, label: 'Telegram' },
  whatsapp: { Icon: Phone, label: 'WhatsApp' },
} as const;

export function ChannelIcon({ channel, size = 14 }: { channel: Channel; size?: number }) {
  const { Icon } = MAP[channel];
  return <Icon size={size} className="text-muted" />;
}

export const channelLabel = (c: Channel) => MAP[c].label;
