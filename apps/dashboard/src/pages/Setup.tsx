import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Building2, Home, Key, HelpCircle, Sparkles, Zap, Cpu } from 'lucide-react';
import {
  SetupHeader,
  BootstrapScreen,
  ChatInterface,
  type PropertyType,
  type AIProvider,
  type Choice,
  type CardChoice,
  type FormCardConfig,
} from '@/components/setup';
import { useChatFlow } from '@/hooks/useChatFlow';

type SetupStep = 'loading' | 'bootstrap' | 'chat';

interface SetupState {
  status: string;
  currentStep: string | null;
  completedSteps: string[];
  context: {
    propertyName?: string;
    propertyType?: string;
    aiProvider?: string;
  };
  isFreshInstall: boolean;
}

type ChatStep =
  | 'greeting'
  | 'ask_name'
  | 'ask_type'
  | 'ask_ai_provider'
  | 'ask_api_key'
  | 'complete'
  | 'done';

export function SetupPage() {
  const navigate = useNavigate();
  const { t } = useTranslation('setup');

  const [step, setStep] = useState<SetupStep>('loading');
  const [isLoading, setIsLoading] = useState(false);
  const [chatStep, setChatStep] = useState<ChatStep>('greeting');
  const [propertyName, setPropertyName] = useState('');
  const [selectedAIProvider, setSelectedAIProvider] = useState<AIProvider | null>(null);
  const hasCheckedState = useRef(false);

  const {
    messages,
    isTyping,
    addUserMessage,
    addAssistantMessage,
    showTyping,
    hideTyping,
  } = useChatFlow();

  // Check setup state on mount (only once, even in React Strict Mode)
  useEffect(() => {
    if (hasCheckedState.current) return;
    hasCheckedState.current = true;
    checkSetupState();
  }, []);

  const checkSetupState = async () => {
    try {
      const response = await fetch('/api/v1/setup/state');
      const data: SetupState = await response.json();

      if (!data.isFreshInstall) {
        navigate('/login', { replace: true });
        return;
      }

      if (data.context.propertyName) {
        setPropertyName(data.context.propertyName);
      }

      if (data.status === 'pending' || data.currentStep === 'bootstrap') {
        setStep('bootstrap');
      } else {
        setStep('chat');
        // Resume from current step based on server state
        resumeChat(data.currentStep, data.context);
      }
    } catch {
      setStep('bootstrap');
    }
  };

  const resumeChat = async (currentStep: string | null, context: SetupState['context']) => {
    // Determine where to resume based on completed context
    if (context.aiProvider) {
      // AI already configured, go to login
      navigate('/login', { replace: true });
      return;
    }

    if (context.propertyName && context.propertyType) {
      // Property info saved, resume at AI provider selection
      setChatStep('greeting');
      await addAssistantMessage(t('welcome.welcomeBack'), 500);
      await addAssistantMessage(t('welcome.nextStep'), 500);
      setChatStep('ask_ai_provider');
      return;
    }

    if (context.propertyName) {
      // Only name saved, resume at type selection
      setChatStep('greeting');
      await addAssistantMessage(t('welcome.welcomeBack'), 500);
      await addAssistantMessage(t('welcome.askType', { name: context.propertyName }), 500);
      setChatStep('ask_type');
      return;
    }

    // Fresh start
    initializeChat();
  };

  const initializeChat = async () => {
    setChatStep('greeting');
    await addAssistantMessage(t('welcome.greeting'), 1000);
    await addAssistantMessage(t('welcome.askName'), 800);
    setChatStep('ask_name');
  };

  const handleBootstrapContinue = async () => {
    setIsLoading(true);
    try {
      await fetch('/api/v1/setup/start', { method: 'POST' });
      await fetch('/api/v1/setup/bootstrap', { method: 'POST' });
      setStep('chat');
      initializeChat();
    } catch (error) {
      console.error('Failed to start setup:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = async () => {
    setIsLoading(true);
    try {
      await fetch('/api/v1/setup/skip', { method: 'POST' });
      navigate('/login', { replace: true });
    } catch (error) {
      console.error('Failed to skip setup:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (message: string) => {
    if (chatStep !== 'ask_name') return;

    addUserMessage(message);
    setPropertyName(message);
    await addAssistantMessage(t('welcome.askType', { name: message }), 1000);
    setChatStep('ask_type');
  };

  const handleSelectPropertyType = async (type: PropertyType) => {
    if (chatStep !== 'ask_type' || !propertyName) return;

    const typeLabel = t(`propertyTypes.${type}`);
    addUserMessage(typeLabel);
    setIsLoading(true);
    setChatStep('done');

    try {
      await fetch('/api/v1/setup/welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: propertyName, type }),
      });

      await addAssistantMessage(t('welcome.confirmation', { name: propertyName, type: typeLabel }), 1000);
      await addAssistantMessage(t('welcome.nextStep'), 800);
      setChatStep('ask_ai_provider');
    } catch (error) {
      console.error('Failed to save property info:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeepLocalAI = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/v1/setup/ai-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'local' }),
      });

      if (!response.ok) {
        console.error('Failed to configure local AI');
        return;
      }

      navigate('/login', { replace: true });
    } catch (error) {
      console.error('Failed to keep local AI:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectAIProvider = async (providerId: string) => {
    const provider = providerId as AIProvider;
    setSelectedAIProvider(provider);

    const providerLabel = t(`aiProvider.${provider}.title`);
    addUserMessage(providerLabel);
    setChatStep('done');

    if (provider === 'local') {
      await addAssistantMessage(t('aiProvider.localSelected'), 800);
      await handleKeepLocalAI();
    } else {
      await addAssistantMessage(t('aiProvider.askApiKey', { provider: providerLabel }), 800);
      setChatStep('ask_api_key');
    }
  };

  const handleApiKeySubmit = async (data: Record<string, string>) => {
    if (!selectedAIProvider) return;

    setIsLoading(true);

    const maskedKey = data.apiKey.slice(0, 7) + '...' + data.apiKey.slice(-4);
    addUserMessage(maskedKey);
    setChatStep('done');
    showTyping();

    try {
      const response = await fetch('/api/v1/setup/ai-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: selectedAIProvider, apiKey: data.apiKey }),
      });

      const responseData = await response.json();
      hideTyping();

      if (!response.ok) {
        await addAssistantMessage(responseData.error?.message || t('errors.aiConfigFailed'), 0);
        setChatStep('ask_api_key');
        setIsLoading(false);
        return;
      }

      await addAssistantMessage(
        t('aiProvider.configured', { provider: t(`aiProvider.${selectedAIProvider}.title`) }),
        0
      );

      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 1000);
    } catch (error) {
      console.error('Failed to configure AI provider:', error);
      hideTyping();
      await addAssistantMessage(t('errors.aiConfigFailed'), 0);
      setChatStep('ask_api_key');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApiKeySkip = async () => {
    addUserMessage(t('aiProvider.useLocal'));
    setChatStep('done');
    await addAssistantMessage(t('aiProvider.localSelected'), 800);
    await handleKeepLocalAI();
  };

  const getInputMode = () => {
    if (chatStep === 'ask_name') return 'text' as const;
    if (chatStep === 'ask_type') return 'choices' as const;
    if (chatStep === 'ask_ai_provider') return 'cards' as const;
    if (chatStep === 'ask_api_key') return 'form' as const;
    return 'none' as const;
  };

  const propertyTypeChoices: Choice[] = [
    { id: 'hotel', label: t('propertyTypes.hotel'), icon: Building2 },
    { id: 'bnb', label: t('propertyTypes.bnb'), icon: Home },
    { id: 'vacation_rental', label: t('propertyTypes.vacation_rental'), icon: Key },
    { id: 'other', label: t('propertyTypes.other'), icon: HelpCircle },
  ];

  const aiProviderChoices: CardChoice[] = [
    {
      id: 'anthropic',
      label: t('aiProvider.anthropic.title'),
      description: t('aiProvider.anthropic.description'),
      icon: Sparkles,
      recommended: true,
    },
    {
      id: 'openai',
      label: t('aiProvider.openai.title'),
      description: t('aiProvider.openai.description'),
      icon: Zap,
    },
    {
      id: 'local',
      label: t('aiProvider.local.title'),
      description: t('aiProvider.local.description'),
      icon: Cpu,
    },
  ];

  const getApiKeyFormConfig = (): FormCardConfig | undefined => {
    if (!selectedAIProvider || selectedAIProvider === 'local') return undefined;

    const providerName = selectedAIProvider === 'anthropic' ? 'Anthropic Claude' : 'OpenAI';
    return {
      title: t('aiProvider.apiKeyTitle', { provider: providerName }),
      description: t('aiProvider.apiKeyDescription', { provider: providerName }),
      fields: [
        {
          key: 'apiKey',
          label: t('aiProvider.apiKeyLabel'),
          type: 'password' as const,
          placeholder: selectedAIProvider === 'anthropic' ? 'sk-ant-...' : 'sk-...',
          required: true,
        },
      ],
      submitLabel: t('aiProvider.continue'),
      skipLabel: t('aiProvider.useLocal'),
      helpLabel: t('aiProvider.getKey'),
    };
  };

  const handleApiKeyHelp = async () => {
    if (!selectedAIProvider) return;

    const isAnthropic = selectedAIProvider === 'anthropic';
    const steps = isAnthropic
      ? [t('aiProvider.step1Anthropic'), t('aiProvider.step2Anthropic'), t('aiProvider.step3Anthropic')]
      : [t('aiProvider.step1Openai'), t('aiProvider.step2Openai'), t('aiProvider.step3Openai')];

    const helpText = `${isAnthropic ? t('aiProvider.helpAnthropic') : t('aiProvider.helpOpenai')}

${steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}

${t('aiProvider.freeCredits')}`;

    await addAssistantMessage(helpText, 0);
  };

  const getProgressStep = () => {
    if (step === 'bootstrap') return 0;
    if (chatStep === 'greeting' || chatStep === 'ask_name' || chatStep === 'ask_type') return 1;
    if (chatStep === 'ask_ai_provider' || chatStep === 'ask_api_key') return 2;
    if (chatStep === 'complete' || chatStep === 'done') return 3;
    return 0;
  };

  const totalSteps = 3;
  const showProgress = step !== 'loading' && chatStep !== 'done' && chatStep !== 'complete';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SetupHeader
        onSkip={handleSkip}
        showSkip={step !== 'loading' && chatStep !== 'done'}
        showProgress={showProgress}
        progressCurrent={getProgressStep()}
        progressTotal={totalSteps}
      />

      <main className="flex-1 flex flex-col">
        {step === 'loading' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground">
              {t('common:common.loading')}
            </div>
          </div>
        )}

        {step === 'bootstrap' && (
          <BootstrapScreen
            onContinue={handleBootstrapContinue}
            isLoading={isLoading}
          />
        )}

        {step === 'chat' && (
          <ChatInterface
            messages={messages}
            inputMode={getInputMode()}
            onSendMessage={handleSendMessage}
            choices={chatStep === 'ask_type' ? propertyTypeChoices : undefined}
            cardChoices={chatStep === 'ask_ai_provider' ? aiProviderChoices : undefined}
            onSelectChoice={
              chatStep === 'ask_type'
                ? (id) => handleSelectPropertyType(id as PropertyType)
                : chatStep === 'ask_ai_provider'
                  ? handleSelectAIProvider
                  : undefined
            }
            formConfig={chatStep === 'ask_api_key' ? getApiKeyFormConfig() : undefined}
            onFormSubmit={chatStep === 'ask_api_key' ? handleApiKeySubmit : undefined}
            onFormSkip={chatStep === 'ask_api_key' ? handleApiKeySkip : undefined}
            onFormHelp={chatStep === 'ask_api_key' ? handleApiKeyHelp : undefined}
            isTyping={isTyping}
            disabled={isLoading || chatStep === 'done' || chatStep === 'complete'}
          />
        )}
      </main>
    </div>
  );
}
