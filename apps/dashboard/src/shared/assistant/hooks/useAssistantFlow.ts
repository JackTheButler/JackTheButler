/**
 * Assistant Flow Hook
 *
 * Hook for orchestrating step transitions and providing helpers to step components.
 *
 * @module shared/assistant/hooks/useAssistantFlow
 */

import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAssistantContext } from '../context';
import type { StepConfig, StepProps } from '../types';

/**
 * Options for useAssistantFlow
 */
export interface UseAssistantFlowOptions {
  /** Translation namespace */
  translationNamespace?: string;
}

/**
 * Return type for useAssistantFlow
 */
export interface UseAssistantFlowReturn<TContext = Record<string, unknown>> {
  /** Whether an assistant is active */
  isActive: boolean;

  /** Current step configuration */
  currentStepConfig: StepConfig<TContext> | undefined;

  /** Props to pass to the current step component */
  stepProps: StepProps<TContext>;

  /** Get progress indicator values */
  getProgress: () => { current: number; total: number };

  /** Transition to a specific step */
  transitionTo: (stepId: string) => Promise<void>;

  /** Go to next step in sequence */
  goNext: () => Promise<void>;

  /** Go to previous step in sequence */
  goBack: () => Promise<void>;

  /** Complete the assistant */
  complete: () => Promise<void>;

  /** Skip the assistant */
  skip: () => Promise<void>;
}

/**
 * Hook for managing assistant flow and step transitions
 */
export function useAssistantFlow<TContext extends Record<string, unknown> = Record<string, unknown>>(
  options: UseAssistantFlowOptions = {}
): UseAssistantFlowReturn<TContext> {
  const { translationNamespace = 'common' } = options;

  const navigate = useNavigate();
  const { t } = useTranslation(translationNamespace);

  const {
    config,
    context,
    currentStep,
    isLoading,
    messages,
    isTyping,
    typingStatus,
    setCurrentStep,
    setLoading,
    updateContext,
    addMessage,
    addAssistantMessage,
    showTyping,
    hideTyping,
    close,
  } = useAssistantContext();

  /**
   * Get the current step configuration
   */
  const currentStepConfig = useMemo((): StepConfig<TContext> | undefined => {
    if (!config) return undefined;
    return config.steps.find((step) => step.isActive(currentStep, context as TContext)) as
      | StepConfig<TContext>
      | undefined;
  }, [config, currentStep, context]);

  /**
   * Get step by ID
   */
  const getStepById = useCallback(
    (stepId: string): StepConfig<TContext> | undefined => {
      if (!config) return undefined;
      return config.steps.find((step) => step.id === stepId) as StepConfig<TContext> | undefined;
    },
    [config]
  );

  /**
   * Transition to a specific step
   */
  const transitionTo = useCallback(
    async (stepId: string) => {
      if (!config) return;

      const nextStep = getStepById(stepId);
      if (!nextStep) {
        console.warn(`Step "${stepId}" not found in assistant "${config.id}"`);
        return;
      }

      // Call onExit for current step
      if (currentStepConfig?.onExit) {
        await currentStepConfig.onExit(context as TContext);
      }

      // Update current step
      setCurrentStep(stepId);

      // Call onEnter for new step
      if (nextStep.onEnter) {
        await nextStep.onEnter(context as TContext);
      }
    },
    [config, context, currentStepConfig, getStepById, setCurrentStep]
  );

  /**
   * Go to next step in sequence
   */
  const goNext = useCallback(async () => {
    if (!config || !currentStepConfig) return;

    const currentIndex = config.steps.findIndex((s) => s.id === currentStepConfig.id);
    if (currentIndex < 0 || currentIndex >= config.steps.length - 1) {
      // Last step, complete the assistant
      await config.onComplete?.(context as TContext);
      close();
      return;
    }

    const nextStep = config.steps[currentIndex + 1];
    await transitionTo(nextStep.id);
  }, [config, context, currentStepConfig, transitionTo, close]);

  /**
   * Go to previous step in sequence
   */
  const goBack = useCallback(async () => {
    if (!config || !currentStepConfig) return;

    const currentIndex = config.steps.findIndex((s) => s.id === currentStepConfig.id);
    if (currentIndex <= 0) return;

    const prevStep = config.steps[currentIndex - 1];
    await transitionTo(prevStep.id);
  }, [config, currentStepConfig, transitionTo]);

  /**
   * Complete the assistant
   */
  const complete = useCallback(async () => {
    if (!config) return;
    await config.onComplete?.(context as TContext);
    close();
  }, [config, context, close]);

  /**
   * Skip the assistant
   */
  const skip = useCallback(async () => {
    if (!config) return;
    await config.onSkip?.(context as TContext);
    close();
  }, [config, context, close]);

  /**
   * Get progress indicator values
   */
  const getProgress = useCallback(() => {
    if (!config || !currentStepConfig) {
      return { current: 0, total: 0 };
    }

    const total = config.totalProgressSteps ?? config.steps.length;
    const current = currentStepConfig.progressIndex;

    return { current, total };
  }, [config, currentStepConfig]);

  /**
   * Handler for onNext in step props
   */
  const handleNext = useCallback(
    async (data?: Record<string, unknown>) => {
      if (data) {
        updateContext(data);
      }
      await goNext();
    },
    [updateContext, goNext]
  );

  /**
   * Build step props
   */
  const stepProps = useMemo<StepProps<TContext>>(
    () => ({
      context: context as TContext,
      updateContext: updateContext as (updates: Partial<TContext>) => void,
      currentStep,
      setCurrentStep,
      onNext: handleNext,
      onBack: goBack,
      onSkip: skip,
      disabled: isLoading,
      loading: isLoading,
      setLoading,
      messages,
      addMessage,
      addAssistantMessage,
      showTyping,
      hideTyping,
      isTyping,
      typingStatus,
      t,
      navigate,
    }),
    [
      context,
      updateContext,
      currentStep,
      setCurrentStep,
      handleNext,
      goBack,
      skip,
      isLoading,
      setLoading,
      messages,
      addMessage,
      addAssistantMessage,
      showTyping,
      hideTyping,
      isTyping,
      typingStatus,
      t,
      navigate,
    ]
  );

  return {
    isActive: config !== null,
    currentStepConfig,
    stepProps,
    getProgress,
    transitionTo,
    goNext,
    goBack,
    complete,
    skip,
  };
}
