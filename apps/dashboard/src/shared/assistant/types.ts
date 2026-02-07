/**
 * Shared Assistant System Types
 *
 * Core types for the reusable assistant infrastructure.
 *
 * @module shared/assistant/types
 */

/**
 * How the assistant is rendered
 */
export type RenderMode =
  | 'fullscreen' // Full page (setup wizard)
  | 'popup' // Modal dialog (channel setup)
  | 'embedded' // Inline in page (knowledge import)
  | 'floating'; // Floating panel (contextual help)

/**
 * When to suggest or auto-activate an assistant
 */
export interface TriggerConfig {
  /** Activate on these page paths */
  pages?: string[];

  /** Activate when these errors occur */
  errorCodes?: string[];

  /** Keyword phrases that activate via search/command */
  keywords?: string[];

  /** Custom activation condition */
  condition?: () => boolean;

  /** Auto-activate vs show suggestion */
  autoActivate?: boolean;
}

/**
 * Configuration for an assistant
 */
export interface AssistantConfig<TContext = Record<string, unknown>> {
  /** Unique identifier */
  id: string;

  /** Display name */
  name: string;

  /** How to render this assistant */
  renderMode: RenderMode;

  /** Steps in this assistant */
  steps: StepConfig<TContext>[];

  /** When to show/activate this assistant */
  triggers?: TriggerConfig;

  /** Create initial context */
  getInitialContext?: () => TContext;

  /** Called when assistant completes */
  onComplete?: (context: TContext) => Promise<void>;

  /** API base path for this assistant */
  apiBasePath?: string;

  /** Total number of progress steps to display */
  totalProgressSteps?: number;

  /** Show skip button */
  showSkip?: boolean;

  /** Called when user skips */
  onSkip?: (context: TContext) => Promise<void>;

  /** Header component to render */
  headerComponent?: React.ComponentType<AssistantHeaderProps<TContext>>;
}

/**
 * Props for assistant header component
 */
export interface AssistantHeaderProps<TContext = Record<string, unknown>> {
  context: TContext;
  currentStep: string;
  progressCurrent: number;
  progressTotal: number;
  showSkip: boolean;
  onSkip: () => void;
}

/**
 * Configuration for a single step
 */
export interface StepConfig<TContext = Record<string, unknown>> {
  /** Unique step identifier */
  id: string;

  /** Position in progress indicator (1-based) */
  progressIndex: number;

  /** Progress bar label */
  progressLabel?: string;

  /** Determine if this step should be active */
  isActive: (currentStep: string, context: TContext) => boolean;

  /** The step component */
  Component: React.ComponentType<StepProps<TContext>>;

  /** Called when entering this step */
  onEnter?: (context: TContext) => Promise<void>;

  /** Called when exiting this step */
  onExit?: (context: TContext) => Promise<void>;

  /** Message shown when resuming at this step */
  resumeMessage?: string | ((context: TContext) => string);
}

/**
 * Props passed to every step component
 */
export interface StepProps<TContext = Record<string, unknown>> {
  /** Current assistant context */
  context: TContext;

  /** Update context */
  updateContext: (updates: Partial<TContext>) => void;

  /** Current step identifier */
  currentStep: string;

  /** Set current step */
  setCurrentStep: (step: string) => void;

  /** Proceed to next logical step */
  onNext: (data?: Record<string, unknown>) => Promise<void>;

  /** Go back to previous step */
  onBack?: () => void;

  /** Skip this step */
  onSkip?: () => void;

  /** UI state */
  disabled?: boolean;
  loading?: boolean;
  setLoading?: (loading: boolean) => void;

  /** Chat helpers */
  messages: ChatMessage[];
  addMessage: (content: string, role?: 'assistant' | 'user') => void;
  addAssistantMessage: (content: string, delay?: number) => Promise<void>;
  showTyping: (status?: string) => void;
  hideTyping: () => void;
  isTyping: boolean;
  typingStatus?: string;

  /** Translation function */
  t: (key: string, vars?: Record<string, string | number>) => string;

  /** Navigation */
  navigate: (path: string, options?: { replace?: boolean }) => void;
}

/**
 * Chat message structure
 */
export interface ChatMessage {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  timestamp: Date;
}

/**
 * Assistant state managed by the context
 */
export interface AssistantState<TContext = Record<string, unknown>> {
  /** Currently active assistant config */
  config: AssistantConfig<TContext> | null;

  /** Current context data */
  context: TContext;

  /** Current step identifier */
  currentStep: string;

  /** Loading state */
  isLoading: boolean;

  /** Chat messages */
  messages: ChatMessage[];

  /** Typing indicator state */
  isTyping: boolean;

  /** Typing status text */
  typingStatus: string;
}

/**
 * Actions available in the assistant context
 */
export interface AssistantActions<TContext = Record<string, unknown>> {
  /** Start an assistant */
  start: (config: AssistantConfig<TContext>, initialContext?: Partial<TContext>) => void;

  /** Close the current assistant */
  close: () => void;

  /** Update context */
  updateContext: (updates: Partial<TContext>) => void;

  /** Set current step */
  setCurrentStep: (step: string) => void;

  /** Set loading state */
  setLoading: (loading: boolean) => void;

  /** Add a message */
  addMessage: (content: string, role?: 'assistant' | 'user') => void;

  /** Add assistant message with delay */
  addAssistantMessage: (content: string, delay?: number) => Promise<void>;

  /** Show typing indicator */
  showTyping: (status?: string) => void;

  /** Hide typing indicator */
  hideTyping: () => void;
}

/**
 * Full assistant context value
 */
export interface AssistantContextValue<TContext = Record<string, unknown>>
  extends AssistantState<TContext>,
    AssistantActions<TContext> {}
