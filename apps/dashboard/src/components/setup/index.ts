export { SetupHeader } from './SetupHeader';
export { ChatMessage, type MessageRole } from './ChatMessage';
export { ChatInterface, type FormCardConfig } from './ChatInterface';
export { ChoiceButtons, type Choice } from './ChoiceButtons';
export { ChoiceCards, type CardChoice } from './ChoiceCards';
export { BootstrapScreen } from './BootstrapScreen';
export { FormCard, type FormField, type FormCardProps } from './FormCard';
export { ChecklistCard, type ChecklistItem, type ChecklistCardProps, type ProfileData } from './ChecklistCard';

// Types for Setup.tsx
export type PropertyType = 'hotel' | 'bnb' | 'vacation_rental' | 'other';
export type AIProvider = 'anthropic' | 'openai' | 'local';
