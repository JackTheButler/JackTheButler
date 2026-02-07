import { useState, useCallback } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface UseChatFlowOptions {
  /** Default delay for typing simulation in ms */
  typingDelay?: number;
}

interface UseChatFlowReturn {
  /** Current messages in the conversation */
  messages: ChatMessage[];
  /** Whether the assistant is currently "typing" */
  isTyping: boolean;
  /** Add a user message immediately (no typing simulation) */
  addUserMessage: (content: string) => void;
  /** Add an assistant message with typing simulation */
  addAssistantMessage: (content: string, delay?: number) => Promise<void>;
  /** Add multiple assistant messages in sequence */
  addAssistantMessages: (contents: string[], delay?: number) => Promise<void>;
  /** Show typing indicator without adding a message */
  showTyping: () => void;
  /** Hide typing indicator */
  hideTyping: () => void;
  /** Reset the conversation */
  reset: () => void;
}

/**
 * Hook for managing conversational chat flows with typing simulation.
 *
 * @example
 * ```tsx
 * const { messages, isTyping, addUserMessage, addAssistantMessage } = useChatFlow();
 *
 * // User sends a message
 * addUserMessage("Hello");
 *
 * // Assistant responds with typing simulation
 * await addAssistantMessage("Hi! How can I help?");
 * ```
 */
export function useChatFlow(options: UseChatFlowOptions = {}): UseChatFlowReturn {
  const { typingDelay = 800 } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);

  const createMessage = useCallback((role: 'user' | 'assistant', content: string): ChatMessage => ({
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role,
    content,
  }), []);

  const addUserMessage = useCallback((content: string) => {
    setMessages(prev => [...prev, createMessage('user', content)]);
  }, [createMessage]);

  const showTyping = useCallback(() => {
    setIsTyping(true);
  }, []);

  const hideTyping = useCallback(() => {
    setIsTyping(false);
  }, []);

  const addAssistantMessage = useCallback((content: string, delay = typingDelay): Promise<void> => {
    return new Promise(resolve => {
      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        setMessages(prev => [...prev, createMessage('assistant', content)]);
        resolve();
      }, delay);
    });
  }, [createMessage, typingDelay]);

  const addAssistantMessages = useCallback(async (contents: string[], delay = typingDelay): Promise<void> => {
    for (const content of contents) {
      await addAssistantMessage(content, delay);
    }
  }, [addAssistantMessage, typingDelay]);

  const reset = useCallback(() => {
    setMessages([]);
    setIsTyping(false);
  }, []);

  return {
    messages,
    isTyping,
    addUserMessage,
    addAssistantMessage,
    addAssistantMessages,
    showTyping,
    hideTyping,
    reset,
  };
}
