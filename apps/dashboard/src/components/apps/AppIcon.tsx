import {
  Brain,
  MessageCircle,
  Mail,
  Smartphone,
  Hotel,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Custom SVG icons from /public/icons/
const customIcons: Record<string, string> = {
  whatsapp: '/icons/whatsapp.svg',
  twilio: '/icons/twilio.svg',
  mailgun: '/icons/mailgun.svg',
  wechat: '/icons/wechat.svg',
  messenger: '/icons/messenger.svg',
  brain: '/icons/brain.svg',
  email: '/icons/email.svg',
  smartphone: '/icons/smartphone.svg',
  building: '/icons/building.svg',
  'chat-round': '/icons/chat-round.svg',
  mews: '/icons/mews.svg',
  cloudbeds: '/icons/cloudbeds.svg',
  ollama: '/icons/ollama.svg',
  claude: '/icons/claude.svg',
  openai: '/icons/openai.svg',
  gmail: '/icons/gmail.svg',
  sendgrid: '/icons/sendgrid.svg',
};

// Mapping app/provider IDs to icons
const iconMapping: Record<string, LucideIcon | string> = {
  // Apps
  ai: 'brain',
  whatsapp: 'whatsapp',
  sms: 'smartphone',
  email: 'email',
  webchat: 'chat-round',
  pms: 'building',

  // AI Providers
  anthropic: 'claude',
  openai: 'openai',
  ollama: 'ollama',
  'ai-ollama': 'ollama',

  // Channel Providers
  meta: 'whatsapp',
  'whatsapp-meta': 'whatsapp',
  twilio: 'twilio',
  'sms-twilio': 'twilio',
  vonage: Smartphone,
  smtp: Mail,
  'email-smtp': 'email',
  'email-gmail-smtp': 'gmail',
  mailgun: 'mailgun',
  'email-mailgun': 'mailgun',
  sendgrid: 'sendgrid',
  'email-sendgrid': 'sendgrid',
  builtin: 'chat-round',
  'channel-webchat': 'chat-round',

  // PMS Providers
  mock: Settings,
  mews: 'mews',
  'pms-mews': 'mews',
  opera: 'building',
  cloudbeds: 'cloudbeds',
  'pms-cloudbeds': 'cloudbeds',
};

// Category icons
const categoryIcons: Record<string, LucideIcon> = {
  ai: Brain,
  channels: MessageCircle,
  pms: Hotel,
  operations: Settings,
};

interface AppIconProps {
  id: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  sm: 'w-5 h-5',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
  xl: 'w-12 h-12',
};

export function AppIcon({ id, size = 'md', className }: AppIconProps) {
  const icon = iconMapping[id];
  const sizeClass = sizeClasses[size];

  // If it's a string, use custom SVG
  if (typeof icon === 'string') {
    const svgPath = customIcons[icon];
    if (svgPath) {
      return (
        <img
          src={svgPath}
          alt={id}
          className={cn(sizeClass, 'dark:invert', className)}
        />
      );
    }
  }

  // If it's a Lucide icon component
  if (icon && typeof icon !== 'string') {
    const LucideIcon = icon;
    return <LucideIcon className={cn(sizeClass, 'text-muted-foreground', className)} />;
  }

  // Fallback
  return <Settings className={cn(sizeClass, 'text-muted-foreground', className)} />;
}

export function CategoryIcon({ category, size = 'md', className }: { category: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const Icon = categoryIcons[category] || Settings;
  const sizeClass = sizeClasses[size];
  return <Icon className={cn(sizeClass, className)} />;
}
