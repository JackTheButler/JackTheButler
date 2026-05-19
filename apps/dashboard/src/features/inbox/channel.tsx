import { Globe, Send, Phone, MessageCircle } from 'lucide-react';

const MAP: Record<string, { Icon: typeof Globe; label: string }> = {
  webchat: { Icon: Globe, label: 'Webchat' },
  telegram: { Icon: Send, label: 'Telegram' },
  whatsapp: { Icon: Phone, label: 'WhatsApp' },
};

const fallback = { Icon: MessageCircle, label: 'Channel' };

export function ChannelIcon({ channel, size = 14 }: { channel: string; size?: number }) {
  const { Icon } = MAP[channel] ?? fallback;
  return <Icon size={size} className="text-muted" />;
}

export const channelLabel = (c: string) => (MAP[c] ?? fallback).label;
