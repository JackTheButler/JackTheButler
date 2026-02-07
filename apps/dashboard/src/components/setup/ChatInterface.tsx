import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChatMessage, type MessageRole } from './ChatMessage';
import { ChoiceButtons, type Choice } from './ChoiceButtons';
import { ChoiceCards, type CardChoice } from './ChoiceCards';
import { FormCard, type FormField } from './FormCard';
import { ChecklistCard, type ChecklistItem } from './ChecklistCard';
import type { FormSchema } from '@/shared/forms/types';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
}

export interface FormCardConfig {
  title: string;
  description?: string;
  fields: FormField[];
  submitLabel?: string;
  skipLabel?: string;
  helpLabel?: string;
  /** Optional schema for advanced validation */
  schema?: FormSchema;
}

type InputMode = 'text' | 'choices' | 'cards' | 'form' | 'checklist' | 'none';

interface ChatInterfaceProps {
  messages: Message[];
  inputMode: InputMode;
  onSendMessage: (message: string) => void;
  choices?: Choice[];
  cardChoices?: CardChoice[];
  onSelectChoice?: (id: string) => void;
  formConfig?: FormCardConfig;
  onFormSubmit?: (data: Record<string, string>) => void;
  onFormSkip?: () => void;
  onFormHelp?: () => void;
  checklistItems?: ChecklistItem[];
  checklistCanContinue?: boolean;
  onChecklistTryUrl?: () => void;
  onChecklistTellManually?: () => void;
  onChecklistContinue?: () => void;
  isTyping?: boolean;
  typingStatusText?: string;
  disabled?: boolean;
}

export function ChatInterface({
  messages,
  inputMode,
  onSendMessage,
  choices,
  cardChoices,
  onSelectChoice,
  formConfig,
  onFormSubmit,
  onFormSkip,
  onFormHelp,
  checklistItems,
  checklistCanContinue,
  onChecklistTryUrl,
  onChecklistTellManually,
  onChecklistContinue,
  isTyping,
  typingStatusText,
  disabled,
}: ChatInterfaceProps) {
  const { t } = useTranslation('setup');
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Focus input when mode changes to text
  useEffect(() => {
    if (inputMode === 'text' && !disabled) {
      inputRef.current?.focus();
    }
  }, [inputMode, disabled]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (trimmed && !disabled) {
      onSendMessage(trimmed);
      setInputValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto w-full pb-[15vh]">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            role={message.role}
            content={message.content}
          />
        ))}
        {isTyping && (
          <ChatMessage role="assistant" content="" isTyping statusText={typingStatusText} />
        )}
        {/* Choices appear in chat after the question */}
        {inputMode === 'choices' && choices && onSelectChoice && !isTyping && (
          <div className="pl-7">
            <ChoiceButtons
              choices={choices}
              onSelect={onSelectChoice}
              disabled={disabled}
            />
          </div>
        )}
        {/* Card choices for richer options like AI provider */}
        {inputMode === 'cards' && cardChoices && onSelectChoice && !isTyping && (
          <div className="pl-7">
            <ChoiceCards
              choices={cardChoices}
              onSelect={onSelectChoice}
              disabled={disabled}
            />
          </div>
        )}
        {/* Checklist for knowledge gathering */}
        {inputMode === 'checklist' && checklistItems && onChecklistTryUrl && onChecklistTellManually && onChecklistContinue && !isTyping && (
          <div className="pl-7">
            <ChecklistCard
              items={checklistItems}
              onTryAnotherUrl={onChecklistTryUrl}
              onTellManually={onChecklistTellManually}
              onContinue={onChecklistContinue}
              canContinue={checklistCanContinue ?? false}
              disabled={disabled}
            />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="px-4 pb-6">
        {/* Form card appears above input when needed */}
        {inputMode === 'form' && formConfig && onFormSubmit && (
          <div className="pl-7 mb-4">
            <FormCard
              title={formConfig.title}
              description={formConfig.description}
              fields={formConfig.fields}
              submitLabel={formConfig.submitLabel}
              skipLabel={formConfig.skipLabel}
              helpLabel={formConfig.helpLabel}
              onSubmit={onFormSubmit}
              onSkip={onFormSkip}
              onHelp={onFormHelp}
              disabled={disabled}
              schema={formConfig.schema}
            />
          </div>
        )}

        {/* Input always visible, enabled only for text mode */}
        {inputMode === 'text' ? (
          <form
            onSubmit={handleSubmit}
            className={cn(
              'flex items-center gap-2',
              'pl-4 pr-1.5 py-1.5 rounded-full bg-background',
              'shadow-lg border border-border/50',
              'focus-within:ring-2 focus-within:ring-ring',
              disabled && 'opacity-50'
            )}
          >
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('chat.placeholder')}
              disabled={disabled}
              className={cn(
                'flex-1 bg-transparent py-1',
                'text-sm placeholder:text-muted-foreground',
                'focus:outline-none',
                'disabled:cursor-not-allowed'
              )}
            />
            <button
              type="submit"
              disabled={disabled || !inputValue.trim()}
              className={cn(
                'p-2 rounded-full bg-primary text-primary-foreground',
                'transition-all duration-200',
                'hover:bg-primary/90',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'disabled:opacity-40 disabled:scale-95 disabled:pointer-events-none'
              )}
            >
              <Send className="w-4 h-4" />
              <span className="sr-only">{t('chat.send')}</span>
            </button>
          </form>
        ) : (
          /* Disabled input for all other modes */
          <div
            className={cn(
              'flex items-center gap-2',
              'pl-4 pr-1.5 py-1.5 rounded-full bg-background',
              'shadow-lg border border-border/50',
              'opacity-50'
            )}
          >
            <input
              type="text"
              placeholder={t('chat.placeholder')}
              disabled
              className={cn(
                'flex-1 bg-transparent py-1',
                'text-sm placeholder:text-muted-foreground',
                'cursor-not-allowed'
              )}
            />
            <button
              type="button"
              disabled
              className={cn(
                'p-2 rounded-full bg-primary text-primary-foreground',
                'pointer-events-none'
              )}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
