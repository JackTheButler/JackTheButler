/**
 * Setup Steps Hook
 *
 * Unified hook that provides UI config and handlers for all setup steps.
 * Works with the shared assistant system.
 *
 * @module features/setup/steps/useSetupSteps
 */

import { useCallback, useMemo } from 'react';
import type { SetupStepContext, StepUIConfig, StepHandlers, InputMode } from './types';
import type { PropertyType, AIProvider, ExtractedEntry } from '../types';
import {
  savePropertyInfo,
  configureAIProvider,
  processMessage,
  parseWebsite,
  importKnowledge,
  syncProfile,
  completeKnowledge,
  createAdmin,
} from '../api';
import {
  getPropertyTypeChoices,
  getAIProviderChoices,
  getApiKeyFormConfig,
  getAdminFormConfig,
} from '../configs';
import {
  getApiKeyFormSchema,
  getAdminFormSchema,
} from '../schemas';
import {
  normalizeUrl,
  isValidUrl,
  deduplicateEntries,
  buildChecklist,
  getQuestionKeyForCategory,
  getManualEntryInfo,
} from '../utils';
import { REQUIRED_CATEGORIES, MISSING_CATEGORY_TO_STEP, AI_PROCESSED_STEPS } from '../types';

/**
 * Props for useSetupSteps
 */
export interface UseSetupStepsProps {
  context: SetupStepContext;
  updateContext: (updates: Partial<SetupStepContext>) => void;
  setCurrentStep: (step: string) => void;
  setLoading: (loading: boolean) => void;
  loading: boolean;
  addUserMessage: (message: string) => void;
  addAssistantMessage: (content: string, delay?: number) => Promise<void>;
  showTyping: (status?: string) => void;
  hideTyping: () => void;
  navigate: (path: string, options?: { replace?: boolean }) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

/**
 * Return type for useSetupSteps
 */
export interface UseSetupStepsReturn {
  /** UI configuration for ChatInterface */
  uiConfig: StepUIConfig;
  /** Handlers for ChatInterface interactions */
  handlers: StepHandlers;
  /** Handle text message (unified handler) */
  handleSendMessage: (message: string) => Promise<void>;
  /** Handle choice selection (unified handler) */
  handleSelectChoice: (id: string) => Promise<void>;
}

/**
 * Unified hook for all setup step logic
 */
export function useSetupSteps({
  context,
  updateContext,
  setCurrentStep,
  setLoading,
  addUserMessage,
  addAssistantMessage,
  showTyping,
  hideTyping,
  navigate,
  t,
}: UseSetupStepsProps): UseSetupStepsReturn {
  const {
    chatStep,
    propertyName = '',
    propertyType = '',
    selectedAIProvider,
    scrapedEntries = [],
    checklist,
    currentQuestion = '',
  } = context;

  // ============================================
  // Property Step Handlers
  // ============================================

  const handleNameSubmit = useCallback(
    async (name: string) => {
      addUserMessage(name);
      updateContext({ propertyName: name });
      const nextQuestion = t('welcome.askType', { name });
      updateContext({ currentQuestion: nextQuestion });
      await addAssistantMessage(nextQuestion, 1000);
      updateContext({ chatStep: 'ask_type' });
    },
    [updateContext, addUserMessage, addAssistantMessage, t]
  );

  const handleTypeSelect = useCallback(
    async (typeId: string) => {
      const type = typeId as PropertyType;
      const typeLabel = t(`propertyTypes.${type}`);

      addUserMessage(typeLabel);
      updateContext({ propertyType: type, chatStep: 'done' });
      setLoading(true);

      try {
        await savePropertyInfo(propertyName, type);
        await addAssistantMessage(
          t('welcome.confirmation', { name: propertyName, type: typeLabel }),
          1000
        );
        await addAssistantMessage(t('welcome.nextStep'), 800);
        updateContext({ chatStep: 'ask_ai_provider' });
        setCurrentStep('ai-provider');
      } catch (error) {
        console.error('Failed to save property info:', error);
      } finally {
        setLoading(false);
      }
    },
    [propertyName, updateContext, setLoading, setCurrentStep, addUserMessage, addAssistantMessage, t]
  );

  // ============================================
  // AI Provider Step Handlers
  // ============================================

  const configureLocalAI = useCallback(async () => {
    setLoading(true);
    try {
      const result = await configureAIProvider('local');
      if (!result.ok) {
        console.error('Failed to configure local AI:', result.error);
        return;
      }
      const question = t('knowledge.askWebsite');
      updateContext({ currentQuestion: question, chatStep: 'ask_website' });
      await addAssistantMessage(question, 800);
      setCurrentStep('knowledge');
    } catch (error) {
      console.error('Failed to keep local AI:', error);
    } finally {
      setLoading(false);
    }
  }, [setLoading, updateContext, setCurrentStep, addAssistantMessage, t]);

  const handleProviderSelect = useCallback(
    async (providerId: string) => {
      const provider = providerId as AIProvider;
      updateContext({ selectedAIProvider: provider });

      const providerLabel = t(`aiProvider.${provider}.title`);
      addUserMessage(providerLabel);
      updateContext({ chatStep: 'done' });

      if (provider === 'local') {
        await addAssistantMessage(t('aiProvider.localSelected'), 800);
        await configureLocalAI();
      } else {
        await addAssistantMessage(t('aiProvider.askApiKey', { provider: providerLabel }), 800);
        updateContext({ chatStep: 'ask_api_key' });
      }
    },
    [updateContext, addUserMessage, addAssistantMessage, configureLocalAI, t]
  );

  const handleApiKeySubmit = useCallback(
    async (data: Record<string, string>) => {
      if (!selectedAIProvider) return;

      setLoading(true);
      const maskedKey = data.apiKey.slice(0, 7) + '...' + data.apiKey.slice(-4);
      addUserMessage(maskedKey);
      updateContext({ chatStep: 'done' });
      showTyping();

      try {
        const result = await configureAIProvider(selectedAIProvider, data.apiKey);
        hideTyping();

        if (!result.ok) {
          await addAssistantMessage(result.error || t('errors.aiConfigFailed'), 0);
          updateContext({ chatStep: 'ask_api_key' });
          setLoading(false);
          return;
        }

        await addAssistantMessage(
          t('aiProvider.configured', { provider: t(`aiProvider.${selectedAIProvider}.title`) }),
          0
        );

        const question = t('knowledge.askWebsite');
        updateContext({ currentQuestion: question, chatStep: 'ask_website' });
        await addAssistantMessage(question, 800);
        setCurrentStep('knowledge');
      } catch (error) {
        console.error('Failed to configure AI provider:', error);
        hideTyping();
        await addAssistantMessage(t('errors.aiConfigFailed'), 0);
        updateContext({ chatStep: 'ask_api_key' });
      } finally {
        setLoading(false);
      }
    },
    [selectedAIProvider, setLoading, updateContext, showTyping, hideTyping, setCurrentStep, addUserMessage, addAssistantMessage, t]
  );

  const handleApiKeySkip = useCallback(async () => {
    addUserMessage(t('aiProvider.useLocal'));
    updateContext({ chatStep: 'done' });
    await addAssistantMessage(t('aiProvider.localSelected'), 800);
    await configureLocalAI();
  }, [addUserMessage, updateContext, addAssistantMessage, configureLocalAI, t]);

  const handleApiKeyHelp = useCallback(async () => {
    if (!selectedAIProvider) return;

    const isAnthropic = selectedAIProvider === 'anthropic';
    const steps = isAnthropic
      ? [t('aiProvider.step1Anthropic'), t('aiProvider.step2Anthropic'), t('aiProvider.step3Anthropic')]
      : [t('aiProvider.step1Openai'), t('aiProvider.step2Openai'), t('aiProvider.step3Openai')];

    const helpText = `${isAnthropic ? t('aiProvider.helpAnthropic') : t('aiProvider.helpOpenai')}

${steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}

${t('aiProvider.freeCredits')}`;

    await addAssistantMessage(helpText, 0);
  }, [selectedAIProvider, addAssistantMessage, t]);

  // ============================================
  // Knowledge Step Handlers
  // ============================================

  const buildChecklistWithTranslation = useCallback(
    (entries: ExtractedEntry[]) => buildChecklist(entries, t),
    [t]
  );

  const handleWebsiteScrape = useCallback(
    async (url: string) => {
      const normalizedUrl = normalizeUrl(url);
      if (!isValidUrl(normalizedUrl)) {
        await addAssistantMessage(t('knowledge.errorFetching'), 500);
        updateContext({ chatStep: 'ask_website' });
        return;
      }

      setLoading(true);
      updateContext({ chatStep: 'scraping', typingStatus: t('knowledge.scrapingFetching') });
      showTyping(t('knowledge.scrapingFetching'));

      const progressTimers: ReturnType<typeof setTimeout>[] = [];
      progressTimers.push(
        setTimeout(() => {
          updateContext({ typingStatus: t('knowledge.scrapingExtracting') });
          showTyping(t('knowledge.scrapingExtracting'));
        }, 3000)
      );
      progressTimers.push(
        setTimeout(() => {
          updateContext({ typingStatus: t('knowledge.scraping') });
          showTyping(t('knowledge.scraping'));
        }, 8000)
      );

      try {
        const result = await parseWebsite(normalizedUrl, propertyName);
        progressTimers.forEach((timer) => clearTimeout(timer));

        if (!result.ok || !result.entries) {
          hideTyping();
          updateContext({ typingStatus: '' });
          await addAssistantMessage(result.error || t('knowledge.errorFetching'), 0);
          updateContext({ chatStep: 'ask_website' });
          setLoading(false);
          return;
        }

        const entries = result.entries;
        if (entries.length === 0) {
          hideTyping();
          updateContext({ typingStatus: '' });
          await addAssistantMessage(t('knowledge.noContent'), 0);
          updateContext({ chatStep: 'ask_website' });
          setLoading(false);
          return;
        }

        updateContext({ typingStatus: t('knowledge.scrapingSaving') });
        showTyping(t('knowledge.scrapingSaving'));

        await importKnowledge(
          entries.map((e) => ({
            category: e.category,
            title: e.title,
            content: e.content,
            keywords: e.keywords,
            priority: 5,
            sourceUrl: normalizedUrl,
          }))
        );

        // Sync profile to extract structured data
        const profile = await syncProfile();

        hideTyping();
        updateContext({ typingStatus: '' });

        const uniqueNewEntries = deduplicateEntries(scrapedEntries, entries);
        const allEntries = [...scrapedEntries, ...uniqueNewEntries];
        const newChecklist = buildChecklistWithTranslation(allEntries);

        // Include profile in checklist
        if (profile) {
          newChecklist.profile = profile;
        }

        updateContext({
          scrapedEntries: allEntries,
          checklist: newChecklist,
        });

        const newCount = uniqueNewEntries.length;
        const dupCount = entries.length - newCount;

        if (dupCount > 0 && scrapedEntries.length > 0) {
          await addAssistantMessage(
            t('knowledge.foundItemsWithDuplicates', { count: newCount, duplicates: dupCount }),
            0
          );
        } else {
          await addAssistantMessage(t('knowledge.foundItems', { count: entries.length }), 0);
        }

        updateContext({ chatStep: 'show_checklist' });
      } catch (error) {
        console.error('Failed to scrape website:', error);
        progressTimers.forEach((timer) => clearTimeout(timer));
        hideTyping();
        updateContext({ typingStatus: '' });
        await addAssistantMessage(t('knowledge.errorFetching'), 0);
        updateContext({ chatStep: 'ask_website' });
      } finally {
        setLoading(false);
      }
    },
    [propertyName, scrapedEntries, setLoading, updateContext, showTyping, hideTyping, addAssistantMessage, buildChecklistWithTranslation, t]
  );

  const handleManualEntry = useCallback(
    async (content: string) => {
      const info = getManualEntryInfo(chatStep);
      if (!info) return;

      const { category, title } = info;

      try {
        await importKnowledge([
          {
            category,
            title,
            content,
            keywords: [],
            priority: 8,
            sourceUrl: '',
          },
        ]);

        const newEntry: ExtractedEntry = {
          title,
          content,
          category,
          keywords: [],
          confidence: 1,
        };
        const allEntries = [...scrapedEntries, newEntry];
        const newChecklist = buildChecklistWithTranslation(allEntries);

        updateContext({
          scrapedEntries: allEntries,
          checklist: newChecklist,
        });

        await addAssistantMessage(t('knowledge.savedItem'), 0);

        const stillMissing = REQUIRED_CATEGORIES.filter((cat) => {
          const item = newChecklist.items.find((i) => i.id === cat);
          return !item?.found;
        });

        if (stillMissing.length > 0) {
          const nextMissing = stillMissing[0];
          const nextStep = MISSING_CATEGORY_TO_STEP[nextMissing];
          if (nextStep) {
            const questionKey = getQuestionKeyForCategory(nextMissing);
            const question = t(questionKey);
            updateContext({ currentQuestion: question });
            await addAssistantMessage(question, 500);
            updateContext({ chatStep: nextStep });
          }
        } else {
          updateContext({ chatStep: 'show_checklist' });
        }
      } catch (error) {
        console.error('Failed to save manual entry:', error);
      }
    },
    [chatStep, scrapedEntries, updateContext, addAssistantMessage, buildChecklistWithTranslation, t]
  );

  const handleChecklistTryUrl = useCallback(async () => {
    updateContext({ chatStep: 'done' });
    const question = t('knowledge.askWebsite');
    updateContext({ currentQuestion: question });
    await addAssistantMessage(question, 500);
    updateContext({ chatStep: 'ask_website' });
  }, [updateContext, addAssistantMessage, t]);

  const handleChecklistTellManually = useCallback(async () => {
    const missingCategories = REQUIRED_CATEGORIES.filter((cat) => {
      const item = checklist?.items.find((i) => i.id === cat);
      return !item?.found;
    });

    if (missingCategories.length === 0) {
      return;
    }

    const firstMissing = missingCategories[0];
    const nextStep = MISSING_CATEGORY_TO_STEP[firstMissing];

    if (nextStep) {
      updateContext({ chatStep: 'done' });
      const questionKey = getQuestionKeyForCategory(firstMissing);
      const question = t(questionKey);
      updateContext({ currentQuestion: question });
      await addAssistantMessage(question, 500);
      updateContext({ chatStep: nextStep });
    }
  }, [checklist, updateContext, addAssistantMessage, t]);

  const handleChecklistContinue = useCallback(async () => {
    setLoading(true);
    updateContext({ chatStep: 'done' });

    try {
      await syncProfile();
      await completeKnowledge();
      await addAssistantMessage(t('knowledge.allRequired'), 500);
      updateContext({ chatStep: 'ask_admin' });
      setCurrentStep('admin');
    } catch (error) {
      console.error('Failed to complete knowledge:', error);
    } finally {
      setLoading(false);
    }
  }, [setLoading, updateContext, setCurrentStep, addAssistantMessage, t]);

  // ============================================
  // Admin Step Handlers
  // ============================================

  const handleAdminSubmit = useCallback(
    async (data: Record<string, string>) => {
      if (data.password !== data.confirmPassword) {
        await addAssistantMessage(t('admin.passwordMismatch'), 0);
        return;
      }

      if (data.password.length < 8) {
        await addAssistantMessage(t('admin.passwordTooShort'), 0);
        return;
      }

      setLoading(true);
      addUserMessage(data.email);
      updateContext({ chatStep: 'done' });
      showTyping();

      try {
        const result = await createAdmin(data.email, data.password, data.name);
        hideTyping();

        if (!result.ok) {
          await addAssistantMessage(result.error || 'Failed to create account', 0);
          updateContext({ chatStep: 'ask_admin' });
          setLoading(false);
          return;
        }

        await addAssistantMessage(t('admin.success'), 0);
        updateContext({ chatStep: 'complete', adminCreated: true });

        setTimeout(() => {
          navigate('/login', { replace: true });
        }, 1500);
      } catch (error) {
        console.error('Failed to create admin:', error);
        hideTyping();
        await addAssistantMessage('Failed to create account. Please try again.', 0);
        updateContext({ chatStep: 'ask_admin' });
      } finally {
        setLoading(false);
      }
    },
    [setLoading, updateContext, showTyping, hideTyping, navigate, addUserMessage, addAssistantMessage, t]
  );

  // ============================================
  // AI Message Processing
  // ============================================

  const processMessageWithAI = useCallback(
    async (message: string) => {
      return processMessage(message, chatStep, propertyName, propertyType, currentQuestion);
    },
    [chatStep, propertyName, propertyType, currentQuestion]
  );

  // ============================================
  // Unified Send Message Handler
  // ============================================

  const handleSendMessage = useCallback(
    async (message: string) => {
      if (chatStep === 'ask_name') {
        await handleNameSubmit(message);
        return;
      }

      if (AI_PROCESSED_STEPS.includes(chatStep)) {
        addUserMessage(message);
        setLoading(true);
        showTyping();

        const result = await processMessageWithAI(message);
        hideTyping();

        if (!result) {
          setLoading(false);
          if (chatStep === 'ask_website') {
            await handleWebsiteScrape(message);
          } else if (chatStep.startsWith('ask_manual_')) {
            await handleManualEntry(message);
          }
          return;
        }

        switch (result.action) {
          case 'proceed':
            if (result.message) {
              await addAssistantMessage(result.message, 0);
            }
            setLoading(false);
            if (chatStep === 'ask_website' && result.data?.value) {
              await handleWebsiteScrape(result.data.value);
            } else if (chatStep.startsWith('ask_manual_') && result.data?.value) {
              await handleManualEntry(result.data.value);
            }
            break;

          case 'show_message':
            if (result.message) {
              await addAssistantMessage(result.message, 0);
            }
            setLoading(false);
            break;

          case 'skip':
            if (result.message) {
              await addAssistantMessage(result.message, 0);
            }
            setLoading(false);
            if (chatStep === 'ask_website') {
              await handleChecklistTellManually();
            }
            break;

          case 'retry':
            if (result.message) {
              await addAssistantMessage(result.message, 0);
            }
            setLoading(false);
            break;
        }
      }
    },
    [chatStep, handleNameSubmit, handleWebsiteScrape, handleManualEntry, handleChecklistTellManually, processMessageWithAI, setLoading, showTyping, hideTyping, addUserMessage, addAssistantMessage]
  );

  // ============================================
  // Unified Select Choice Handler
  // ============================================

  const handleSelectChoice = useCallback(
    async (id: string) => {
      if (chatStep === 'ask_type') {
        await handleTypeSelect(id);
      } else if (chatStep === 'ask_ai_provider') {
        await handleProviderSelect(id);
      }
    },
    [chatStep, handleTypeSelect, handleProviderSelect]
  );

  // ============================================
  // UI Configuration
  // ============================================

  const uiConfig = useMemo((): StepUIConfig => {
    const getInputMode = (): InputMode => {
      switch (chatStep) {
        case 'ask_name':
        case 'ask_website':
        case 'ask_manual_checkin':
        case 'ask_manual_room':
        case 'ask_manual_contact':
        case 'ask_manual_location':
          return 'text';
        case 'ask_type':
          return 'choices';
        case 'ask_ai_provider':
          return 'cards';
        case 'ask_api_key':
        case 'ask_admin':
          return 'form';
        case 'show_checklist':
          return 'checklist';
        default:
          return 'none';
      }
    };

    const inputMode = getInputMode();
    const config: StepUIConfig = { inputMode };

    if (inputMode === 'choices' && chatStep === 'ask_type') {
      config.choices = getPropertyTypeChoices(t);
    }

    if (inputMode === 'cards' && chatStep === 'ask_ai_provider') {
      config.cardChoices = getAIProviderChoices(t);
    }

    if (inputMode === 'form') {
      if (chatStep === 'ask_api_key') {
        const formConfig = getApiKeyFormConfig(selectedAIProvider as AIProvider | null, t);
        const schema = getApiKeyFormSchema(selectedAIProvider as AIProvider | null, t);
        if (formConfig) {
          config.formConfig = { ...formConfig, schema };
        }
      } else if (chatStep === 'ask_admin') {
        const formConfig = getAdminFormConfig(t);
        const schema = getAdminFormSchema(t);
        config.formConfig = { ...formConfig, schema };
      }
    }

    if (inputMode === 'checklist' && checklist) {
      config.checklistItems = checklist.items;
      config.checklistCanContinue = checklist.canContinue;
      config.checklistProfile = checklist.profile;
    }

    return config;
  }, [chatStep, selectedAIProvider, checklist, t]);

  // ============================================
  // Handlers Object
  // ============================================

  const handlers = useMemo((): StepHandlers => {
    const h: StepHandlers = {};

    if (chatStep === 'ask_name' || AI_PROCESSED_STEPS.includes(chatStep)) {
      h.onSendMessage = handleSendMessage;
    }

    if (chatStep === 'ask_type' || chatStep === 'ask_ai_provider') {
      h.onSelectChoice = handleSelectChoice;
    }

    if (chatStep === 'ask_api_key') {
      h.onFormSubmit = handleApiKeySubmit;
      h.onFormSkip = handleApiKeySkip;
      h.onFormHelp = handleApiKeyHelp;
    }

    if (chatStep === 'ask_admin') {
      h.onFormSubmit = handleAdminSubmit;
    }

    if (chatStep === 'show_checklist') {
      h.onChecklistTryUrl = handleChecklistTryUrl;
      h.onChecklistTellManually = handleChecklistTellManually;
      h.onChecklistContinue = handleChecklistContinue;
    }

    return h;
  }, [
    chatStep,
    handleSendMessage,
    handleSelectChoice,
    handleApiKeySubmit,
    handleApiKeySkip,
    handleApiKeyHelp,
    handleAdminSubmit,
    handleChecklistTryUrl,
    handleChecklistTellManually,
    handleChecklistContinue,
  ]);

  return {
    uiConfig,
    handlers,
    handleSendMessage,
    handleSelectChoice,
  };
}
