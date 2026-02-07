/**
 * Assistant Container
 *
 * Main container component that renders the active assistant's current step.
 *
 * @module shared/assistant/components/AssistantContainer
 */

import { useAssistantFlow } from '../hooks/useAssistantFlow';

/**
 * Props for AssistantContainer
 */
export interface AssistantContainerProps {
  /** Translation namespace for the assistant */
  translationNamespace?: string;

  /** Optional header component */
  headerComponent?: React.ComponentType<{
    progressCurrent: number;
    progressTotal: number;
    showSkip: boolean;
    onSkip: () => void;
  }>;

  /** Whether to show skip button */
  showSkip?: boolean;

  /** Called when user skips */
  onSkip?: () => void;

  /** CSS class for container */
  className?: string;
}

/**
 * Container component for rendering active assistant
 */
export function AssistantContainer({
  translationNamespace,
  headerComponent: HeaderComponent,
  showSkip = false,
  onSkip,
  className = '',
}: AssistantContainerProps) {
  const { isActive, currentStepConfig, stepProps, getProgress, skip } = useAssistantFlow({
    translationNamespace,
  });

  // If no assistant is active, render nothing
  if (!isActive || !currentStepConfig) {
    return null;
  }

  const { current, total } = getProgress();
  const StepComponent = currentStepConfig.Component;

  const handleSkip = () => {
    if (onSkip) {
      onSkip();
    } else {
      skip();
    }
  };

  return (
    <div className={`assistant-container ${className}`}>
      {HeaderComponent && (
        <HeaderComponent
          progressCurrent={current}
          progressTotal={total}
          showSkip={showSkip}
          onSkip={handleSkip}
        />
      )}

      <div className="assistant-content">
        <StepComponent {...stepProps} />
      </div>
    </div>
  );
}

/**
 * Props for AssistantStep (wrapper for step components)
 */
export interface AssistantStepProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Wrapper component for step content
 */
export function AssistantStep({ children, className = '' }: AssistantStepProps) {
  return <div className={`assistant-step ${className}`}>{children}</div>;
}
