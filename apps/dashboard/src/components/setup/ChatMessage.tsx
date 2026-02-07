import { useState, useEffect } from 'react';
import { Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';

export type MessageRole = 'assistant' | 'user';

interface ChatMessageProps {
  role: MessageRole;
  content: string;
  isTyping?: boolean;
  statusText?: string;
}

function useTypewriter(text: string, enabled: boolean, speed: number = 20) {
  const [displayedText, setDisplayedText] = useState(enabled ? '' : text);

  useEffect(() => {
    if (!enabled) {
      setDisplayedText(text);
      return;
    }

    setDisplayedText('');
    let index = 0;

    const timer = setInterval(() => {
      if (index < text.length) {
        setDisplayedText(text.slice(0, index + 1));
        index++;
      } else {
        clearInterval(timer);
      }
    }, speed);

    return () => clearInterval(timer);
  }, [text, enabled, speed]);

  return displayedText;
}

export function ChatMessage({ role, content, isTyping, statusText }: ChatMessageProps) {
  const isAssistant = role === 'assistant';
  const displayedContent = useTypewriter(content, isAssistant, 20);

  if (isTyping && isAssistant) {
    return (
      <div className="flex w-full justify-start items-center">
        <div className="relative w-5 h-5 flex items-center justify-center mr-2 flex-shrink-0">
          <svg
            className="absolute inset-[-3px] w-[26px] h-[26px] animate-spin"
            viewBox="0 0 50 50"
          >
            <defs>
              <linearGradient id="spinner-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#24C0E7" />
                <stop offset="33%" stopColor="#FF3892" />
                <stop offset="66%" stopColor="#60D660" />
                <stop offset="100%" stopColor="#24C0E7" />
              </linearGradient>
            </defs>
            <circle
              className="animate-spinner-dash"
              cx="25"
              cy="25"
              r="20"
              fill="none"
              stroke="url(#spinner-gradient)"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>
          <Cpu className="w-4 h-4 text-foreground" />
        </div>
        {statusText && (
          <span className="text-sm text-muted-foreground/70 animate-pulse">
            {statusText}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex w-full',
        isAssistant ? 'justify-start' : 'justify-end'
      )}
    >
      {isAssistant && (
        <div className="w-5 h-5 flex items-center justify-center mr-2 flex-shrink-0">
          <Cpu className="w-5 h-5 text-foreground animate-scale-in" />
        </div>
      )}
      <div
        className={cn(
          'max-w-[80%] text-sm',
          isAssistant
            ? 'text-foreground pt-0.5 whitespace-pre-wrap'
            : 'bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-2.5'
        )}
      >
        {isAssistant ? displayedContent : content}
      </div>
    </div>
  );
}
