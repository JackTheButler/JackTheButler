/**
 * Setup Step Types
 *
 * Types specific to setup step components.
 *
 * @module features/setup/steps/types
 */

import type { StepProps } from '@/shared/assistant';
import type { FormSchema } from '@/shared/forms';
import type { SetupContext, ChatStep, ExtractedEntry, KnowledgeChecklist, HotelProfile } from '../types';
import type { Choice } from '@/components/setup/ChoiceButtons';
import type { CardChoice } from '@/components/setup/ChoiceCards';
import type { FormField } from '@/components/setup/FormCard';
import type { ChecklistItem, ProfileData } from '@/components/setup/ChecklistCard';

/**
 * Extended setup context with runtime state
 */
export interface SetupStepContext extends SetupContext {
  /** Current chat step within the setup flow */
  chatStep: ChatStep;

  /** Selected AI provider for API key form */
  selectedAIProvider?: 'local' | 'anthropic' | 'openai' | null;

  /** Scraped knowledge entries */
  scrapedEntries: ExtractedEntry[];

  /** Knowledge checklist state */
  checklist: KnowledgeChecklist | null;

  /** Current question being asked (for AI processing) */
  currentQuestion: string;

  /** Typing status message */
  typingStatus: string;
}

/**
 * Input mode for ChatInterface
 */
export type InputMode = 'text' | 'choices' | 'cards' | 'form' | 'checklist' | 'none';

/**
 * Form configuration for ChatInterface
 */
export interface FormConfig {
  title: string;
  description?: string;
  fields: FormField[];
  submitLabel?: string;
  skipLabel?: string;
  helpLabel?: string;
  /** Optional schema for advanced validation */
  schema?: FormSchema;
}

/**
 * Configuration returned by step components for ChatInterface
 */
export interface StepUIConfig {
  /** Input mode to display */
  inputMode: InputMode;

  /** Choices for 'choices' mode */
  choices?: Choice[];

  /** Card choices for 'cards' mode */
  cardChoices?: CardChoice[];

  /** Form configuration for 'form' mode */
  formConfig?: FormConfig;

  /** Checklist items for 'checklist' mode */
  checklistItems?: ChecklistItem[];

  /** Whether can continue from checklist */
  checklistCanContinue?: boolean;

  /** Profile data for checklist mode */
  checklistProfile?: ProfileData;
}

/**
 * Handlers for step interactions
 */
export interface StepHandlers {
  /** Handle text message sent */
  onSendMessage?: (message: string) => Promise<void>;

  /** Handle choice selection */
  onSelectChoice?: (id: string) => Promise<void>;

  /** Handle form submission */
  onFormSubmit?: (data: Record<string, string>) => Promise<void>;

  /** Handle form skip */
  onFormSkip?: () => Promise<void>;

  /** Handle form help */
  onFormHelp?: () => Promise<void>;

  /** Handle checklist try URL */
  onChecklistTryUrl?: () => Promise<void>;

  /** Handle checklist tell manually */
  onChecklistTellManually?: () => Promise<void>;

  /** Handle checklist continue */
  onChecklistContinue?: () => Promise<void>;
}

/**
 * Props for setup step components
 */
export type SetupStepProps = StepProps<SetupStepContext>;

/**
 * Return type for step hooks
 */
export interface StepHookReturn {
  /** UI configuration for ChatInterface */
  uiConfig: StepUIConfig;

  /** Handlers for interactions */
  handlers: StepHandlers;
}
