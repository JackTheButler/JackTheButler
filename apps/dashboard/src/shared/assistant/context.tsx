/**
 * Assistant Context
 *
 * React context for managing assistant state.
 *
 * @module shared/assistant/context
 */

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import type {
  AssistantConfig,
  AssistantContextValue,
  ChatMessage,
} from './types';
import { assistantRegistry } from './registry';

// Create context with undefined default
const AssistantContext = createContext<AssistantContextValue | undefined>(undefined);

/**
 * Generate unique message ID
 */
function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Props for AssistantProvider
 */
export interface AssistantProviderProps {
  children: ReactNode;
}

/**
 * Provider component for assistant state
 */
export function AssistantProvider({ children }: AssistantProviderProps) {
  // State
  const [config, setConfig] = useState<AssistantConfig | null>(null);
  const [context, setContext] = useState<Record<string, unknown>>({});
  const [currentStep, setCurrentStep] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [typingStatus, setTypingStatus] = useState('');

  /**
   * Start an assistant
   */
  const start = useCallback(
    <T extends Record<string, unknown>>(
      assistantConfig: AssistantConfig<T>,
      initialContext?: Partial<T>
    ) => {
      const baseContext = assistantConfig.getInitialContext?.() ?? ({} as T);
      const mergedContext = { ...baseContext, ...initialContext };

      setConfig(assistantConfig as AssistantConfig);
      setContext(mergedContext);
      setCurrentStep(assistantConfig.steps[0]?.id ?? '');
      setMessages([]);
      setIsTyping(false);
      setTypingStatus('');
      setIsLoading(false);
    },
    []
  );

  /**
   * Close the current assistant
   */
  const close = useCallback(() => {
    setConfig(null);
    setContext({});
    setCurrentStep('');
    setMessages([]);
    setIsTyping(false);
    setTypingStatus('');
    setIsLoading(false);
  }, []);

  /**
   * Update context
   */
  const updateContext = useCallback((updates: Partial<Record<string, unknown>>) => {
    setContext((prev) => ({ ...prev, ...updates }));
  }, []);

  /**
   * Add a message
   */
  const addMessage = useCallback((content: string, role: 'assistant' | 'user' = 'assistant') => {
    const message: ChatMessage = {
      id: generateMessageId(),
      role,
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, message]);
  }, []);

  /**
   * Add assistant message with optional delay
   */
  const addAssistantMessage = useCallback(
    async (content: string, delay = 0): Promise<void> => {
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      addMessage(content, 'assistant');
    },
    [addMessage]
  );

  /**
   * Show typing indicator
   */
  const showTyping = useCallback((status = '') => {
    setIsTyping(true);
    setTypingStatus(status);
  }, []);

  /**
   * Hide typing indicator
   */
  const hideTyping = useCallback(() => {
    setIsTyping(false);
    setTypingStatus('');
  }, []);

  // Memoize the context value
  const value = useMemo<AssistantContextValue>(
    () => ({
      // State
      config,
      context,
      currentStep,
      isLoading,
      messages,
      isTyping,
      typingStatus,
      // Actions
      start,
      close,
      updateContext,
      setCurrentStep,
      setLoading: setIsLoading,
      addMessage,
      addAssistantMessage,
      showTyping,
      hideTyping,
    }),
    [
      config,
      context,
      currentStep,
      isLoading,
      messages,
      isTyping,
      typingStatus,
      start,
      close,
      updateContext,
      addMessage,
      addAssistantMessage,
      showTyping,
      hideTyping,
    ]
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

/**
 * Hook to access the assistant context
 */
export function useAssistantContext(): AssistantContextValue {
  const context = useContext(AssistantContext);
  if (!context) {
    throw new Error('useAssistantContext must be used within an AssistantProvider');
  }
  return context;
}

/**
 * Hook for common assistant operations
 */
export function useAssistant() {
  const context = useAssistantContext();

  return {
    /** Currently active assistant */
    active: context.config,

    /** Whether an assistant is active */
    isActive: context.config !== null,

    /** Open an assistant by ID */
    open: (assistantId: string, initialContext?: Record<string, unknown>) => {
      const assistantConfig = assistantRegistry.get(assistantId);
      if (assistantConfig) {
        context.start(assistantConfig, initialContext);
      } else {
        console.warn(`Assistant "${assistantId}" not found in registry`);
      }
    },

    /** Close active assistant */
    close: context.close,

    /** Get assistants available for current page */
    getAvailable: (pagePath: string) => assistantRegistry.getForPage(pagePath),

    /** Get suggested assistant based on context */
    getSuggested: (pagePath: string) => {
      const available = assistantRegistry.getForPage(pagePath);
      return available.find((a) => a.triggers?.condition?.() ?? true);
    },

    /** Get assistant that should auto-activate */
    getAutoActivate: (pagePath: string) => assistantRegistry.getAutoActivate(pagePath),
  };
}
