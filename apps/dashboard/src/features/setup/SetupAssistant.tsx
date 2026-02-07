/**
 * Setup Assistant Component
 *
 * Main component for the setup wizard that uses the shared assistant system.
 *
 * @module features/setup/SetupAssistant
 */

import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAssistantContext } from '@/shared/assistant';
import { SetupHeader, BootstrapScreen, ChatInterface } from '@/components/setup';
import { setupAssistantConfig, getInitialSetupContext } from './assistant-config';
import { useSetupSteps } from './steps';
import type { SetupStepContext } from './steps/types';
import { getSetupState, startSetup, completeBootstrap, skipSetup } from './api';
import { getProgressStep } from './utils';

/**
 * Setup Assistant - orchestrates the setup wizard flow
 */
export function SetupAssistant() {
  const navigate = useNavigate();
  const { t } = useTranslation('setup');
  const hasCheckedState = useRef(false);

  // Get assistant context
  const {
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
    setCurrentStep,
    setLoading,
    addMessage,
    addAssistantMessage,
    showTyping,
    hideTyping,
  } = useAssistantContext();

  // Cast context to SetupStepContext
  const setupContext = context as SetupStepContext;

  // Initialize the setup steps hook
  const { uiConfig, handlers } = useSetupSteps({
    context: setupContext,
    updateContext: updateContext as (updates: Partial<SetupStepContext>) => void,
    setCurrentStep,
    setLoading,
    loading: isLoading,
    addUserMessage: (message) => addMessage(message, 'user'),
    addAssistantMessage,
    showTyping,
    hideTyping,
    navigate,
    t,
  });

  /**
   * Check setup state and initialize
   */
  const checkSetupState = useCallback(async () => {
    try {
      const data = await getSetupState();

      if (!data.isFreshInstall) {
        navigate('/login', { replace: true });
        return;
      }

      // Start the assistant with initial context
      const initialContext = getInitialSetupContext();
      if (data.context.propertyName) {
        initialContext.propertyName = data.context.propertyName;
      }
      if (data.context.propertyType) {
        initialContext.propertyType = data.context.propertyType as SetupStepContext['propertyType'];
      }

      // Cast to generic type for the shared assistant context
      start(
        setupAssistantConfig as unknown as Parameters<typeof start>[0],
        initialContext as Record<string, unknown>
      );

      // Determine which step to start at
      if (data.status === 'pending' || data.currentStep === 'bootstrap') {
        setCurrentStep('bootstrap');
      } else {
        setCurrentStep('property');
        await resumeChat(data.currentStep, data.context);
      }
    } catch {
      // Start fresh on error
      start(setupAssistantConfig, getInitialSetupContext());
      setCurrentStep('bootstrap');
    }
  }, [navigate, start, setCurrentStep]);

  /**
   * Resume chat from a saved state
   */
  const resumeChat = useCallback(
    async (savedStep: string | null, savedContext: Record<string, unknown>) => {
      if (savedContext.propertyName) {
        updateContext({ propertyName: savedContext.propertyName as string });
      }
      if (savedContext.propertyType) {
        updateContext({ propertyType: savedContext.propertyType as SetupStepContext['propertyType'] });
      }

      if (savedStep === 'create_admin') {
        updateContext({ chatStep: 'greeting' });
        await addAssistantMessage(t('welcome.welcomeBack'), 500);
        await addAssistantMessage(t('admin.askCredentials'), 500);
        updateContext({ chatStep: 'ask_admin' });
        setCurrentStep('admin');
        return;
      }

      if (savedStep === 'knowledge') {
        updateContext({ chatStep: 'greeting' });
        await addAssistantMessage(t('welcome.welcomeBack'), 500);
        const question = t('knowledge.askWebsite');
        updateContext({ currentQuestion: question });
        await addAssistantMessage(question, 500);
        updateContext({ chatStep: 'ask_website' });
        setCurrentStep('knowledge');
        return;
      }

      if (savedContext.aiProvider) {
        navigate('/login', { replace: true });
        return;
      }

      if (savedContext.propertyName && savedContext.propertyType) {
        updateContext({ chatStep: 'greeting' });
        await addAssistantMessage(t('welcome.welcomeBack'), 500);
        await addAssistantMessage(t('welcome.nextStep'), 500);
        updateContext({ chatStep: 'ask_ai_provider' });
        setCurrentStep('ai-provider');
        return;
      }

      if (savedContext.propertyName) {
        updateContext({ chatStep: 'greeting' });
        await addAssistantMessage(t('welcome.welcomeBack'), 500);
        const question = t('welcome.askType', { name: savedContext.propertyName });
        updateContext({ currentQuestion: question });
        await addAssistantMessage(question, 500);
        updateContext({ chatStep: 'ask_type' });
        return;
      }

      // Fresh start
      await initializeChat();
    },
    [updateContext, setCurrentStep, addAssistantMessage, navigate, t]
  );

  /**
   * Initialize chat for fresh start
   */
  const initializeChat = useCallback(async () => {
    updateContext({ chatStep: 'greeting' });
    await addAssistantMessage(t('welcome.greeting'), 1000);
    const question = t('welcome.askName');
    updateContext({ currentQuestion: question });
    await addAssistantMessage(question, 800);
    updateContext({ chatStep: 'ask_name' });
  }, [updateContext, addAssistantMessage, t]);

  /**
   * Handle bootstrap continue
   */
  const handleBootstrapContinue = useCallback(async () => {
    setLoading(true);
    try {
      await startSetup();
      await completeBootstrap();
      setCurrentStep('property');
      await initializeChat();
    } catch (error) {
      console.error('Failed to start setup:', error);
    } finally {
      setLoading(false);
    }
  }, [setLoading, setCurrentStep, initializeChat]);

  /**
   * Handle skip
   */
  const handleSkip = useCallback(async () => {
    setLoading(true);
    try {
      await skipSetup();
      navigate('/login', { replace: true });
    } catch (error) {
      console.error('Failed to skip setup:', error);
    } finally {
      setLoading(false);
    }
  }, [setLoading, navigate]);

  // Check setup state on mount
  useEffect(() => {
    if (hasCheckedState.current) return;
    hasCheckedState.current = true;
    checkSetupState();
  }, [checkSetupState]);

  // If assistant not initialized, show loading
  if (!config) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">{t('common:common.loading')}</div>
      </div>
    );
  }

  const { chatStep } = setupContext;
  const totalSteps = 5;
  const showProgress = currentStep !== 'bootstrap' && chatStep !== 'done' && chatStep !== 'complete';

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden relative">
      {/* Header overlays content for blur effect */}
      <div className="absolute top-0 left-0 right-0 z-10">
        <SetupHeader
          showProgress={showProgress}
          progressCurrent={getProgressStep(currentStep === 'bootstrap' ? 'bootstrap' : 'chat', chatStep)}
          progressTotal={totalSteps}
        />
      </div>

      <main className="flex-1 flex flex-col min-h-0 pt-0">
        {currentStep === 'bootstrap' && (
          <BootstrapScreen onContinue={handleBootstrapContinue} isLoading={isLoading} />
        )}

        {currentStep !== 'bootstrap' && (
          <ChatInterface
            messages={messages.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
            }))}
            inputMode={uiConfig.inputMode}
            onSendMessage={handlers.onSendMessage || (() => {})}
            choices={uiConfig.choices}
            cardChoices={uiConfig.cardChoices}
            onSelectChoice={handlers.onSelectChoice}
            formConfig={uiConfig.formConfig}
            onFormSubmit={handlers.onFormSubmit}
            onFormSkip={handlers.onFormSkip}
            onFormHelp={handlers.onFormHelp}
            checklistItems={uiConfig.checklistItems}
            checklistCanContinue={uiConfig.checklistCanContinue}
            checklistProfile={uiConfig.checklistProfile}
            onChecklistTryUrl={handlers.onChecklistTryUrl}
            onChecklistTellManually={handlers.onChecklistTellManually}
            onChecklistContinue={handlers.onChecklistContinue}
            isTyping={isTyping}
            typingStatusText={typingStatus}
            disabled={
              isLoading ||
              chatStep === 'done' ||
              chatStep === 'complete' ||
              chatStep === 'scraping'
            }
            onSkip={handleSkip}
            showSkip={chatStep !== 'done' && chatStep !== 'complete'}
          />
        )}
      </main>
    </div>
  );
}
