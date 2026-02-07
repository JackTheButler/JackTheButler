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
  type ChecklistItem,
} from '@/components/setup';
import { useChatFlow } from '@/hooks/useChatFlow';

// Category mapping for checklist
type KnowledgeCategory = 'policy' | 'room_type' | 'contact' | 'local_info' | 'amenity' | 'service' | 'dining' | 'faq' | 'other';

interface ExtractedEntry {
  title: string;
  content: string;
  category: KnowledgeCategory;
  keywords: string[];
  confidence: number;
}

interface KnowledgeChecklist {
  items: ChecklistItem[];
  entries: ExtractedEntry[];
  canContinue: boolean;
}

// Required categories for minimum knowledge
const REQUIRED_CATEGORIES: KnowledgeCategory[] = ['policy', 'room_type', 'contact', 'local_info'];

// Category to checklist item ID mapping
const CATEGORY_TO_ITEM: Record<KnowledgeCategory, string> = {
  policy: 'policy',
  room_type: 'room_type',
  contact: 'contact',
  local_info: 'local_info',
  amenity: 'amenity',
  service: 'service',
  dining: 'dining',
  faq: 'faq',
  other: 'other',
};

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
  | 'ask_website'
  | 'scraping'
  | 'show_checklist'
  | 'ask_manual_checkin'
  | 'ask_manual_room'
  | 'ask_manual_contact'
  | 'ask_manual_location'
  | 'ask_admin'
  | 'complete'
  | 'done';

// Missing category to manual entry step mapping
const MISSING_CATEGORY_TO_STEP: Record<string, ChatStep> = {
  policy: 'ask_manual_checkin',
  room_type: 'ask_manual_room',
  contact: 'ask_manual_contact',
  local_info: 'ask_manual_location',
};

// Steps that use AI processing for messages
const AI_PROCESSED_STEPS: ChatStep[] = [
  'ask_website',
  'ask_manual_checkin',
  'ask_manual_room',
  'ask_manual_contact',
  'ask_manual_location',
];

// Response from process-message endpoint
interface ProcessMessageResponse {
  action: 'proceed' | 'show_message' | 'skip' | 'retry';
  message: string | null;
  data: { value: string } | null;
  stayOnStep?: boolean;
  nextStep?: string | null;
}

export function SetupPage() {
  const navigate = useNavigate();
  const { t } = useTranslation('setup');

  const [step, setStep] = useState<SetupStep>('loading');
  const [isLoading, setIsLoading] = useState(false);
  const [chatStep, setChatStep] = useState<ChatStep>('greeting');
  const [propertyName, setPropertyName] = useState('');
  const [selectedAIProvider, setSelectedAIProvider] = useState<AIProvider | null>(null);
  const [checklist, setChecklist] = useState<KnowledgeChecklist | null>(null);
  const [scrapedEntries, setScrapedEntries] = useState<ExtractedEntry[]>([]);
  const [typingStatus, setTypingStatus] = useState<string>('');
  const [currentQuestion, setCurrentQuestion] = useState<string>('');
  const [propertyType, setPropertyType] = useState<string>('');
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
    // Restore context from saved state
    if (context.propertyName) {
      setPropertyName(context.propertyName);
    }
    if (context.propertyType) {
      setPropertyType(context.propertyType);
    }

    // Determine where to resume based on completed context and current step
    if (currentStep === 'create_admin') {
      // Knowledge gathering complete, resume at admin creation
      setChatStep('greeting');
      await addAssistantMessage(t('welcome.welcomeBack'), 500);
      await addAssistantMessage(t('admin.askCredentials'), 500);
      setChatStep('ask_admin');
      return;
    }

    if (currentStep === 'knowledge') {
      // AI configured, resume at knowledge gathering
      setChatStep('greeting');
      await addAssistantMessage(t('welcome.welcomeBack'), 500);
      const question = t('knowledge.askWebsite');
      setCurrentQuestion(question);
      await addAssistantMessage(question, 500);
      setChatStep('ask_website');
      return;
    }

    if (context.aiProvider) {
      // AI already configured but not on knowledge step - setup must be complete
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
      const question = t('welcome.askType', { name: context.propertyName });
      setCurrentQuestion(question);
      await addAssistantMessage(question, 500);
      setChatStep('ask_type');
      return;
    }

    // Fresh start
    initializeChat();
  };

  const initializeChat = async () => {
    setChatStep('greeting');
    await addAssistantMessage(t('welcome.greeting'), 1000);
    const question = t('welcome.askName');
    setCurrentQuestion(question);
    await addAssistantMessage(question, 800);
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

  // Process message with AI to determine intent
  const processMessageWithAI = async (message: string): Promise<ProcessMessageResponse | null> => {
    try {
      const response = await fetch('/api/v1/setup/process-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          step: chatStep,
          propertyName: propertyName || 'your property',
          propertyType: propertyType || 'property',
          question: currentQuestion,
        }),
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to process message:', error);
      return null;
    }
  };

  const handleSendMessage = async (message: string) => {
    if (chatStep === 'ask_name') {
      addUserMessage(message);
      setPropertyName(message);
      const nextQuestion = t('welcome.askType', { name: message });
      setCurrentQuestion(nextQuestion);
      await addAssistantMessage(nextQuestion, 1000);
      setChatStep('ask_type');
      return;
    }

    // For AI-processed steps, use the process-message endpoint
    if (AI_PROCESSED_STEPS.includes(chatStep)) {
      addUserMessage(message);
      setIsLoading(true);
      showTyping();

      const result = await processMessageWithAI(message);
      hideTyping();

      if (!result) {
        // Fallback: proceed with direct handling if AI fails
        setIsLoading(false);
        if (chatStep === 'ask_website') {
          await handleWebsiteScrape(message);
        } else if (chatStep.startsWith('ask_manual_')) {
          await handleManualEntry(message);
        }
        return;
      }

      // Handle the action returned by AI
      switch (result.action) {
        case 'proceed':
          if (result.message) {
            await addAssistantMessage(result.message, 0);
          }
          setIsLoading(false);
          // Proceed with the original handler using the extracted/validated value
          if (chatStep === 'ask_website' && result.data?.value) {
            await handleWebsiteScrape(result.data.value);
          } else if (chatStep.startsWith('ask_manual_') && result.data?.value) {
            await handleManualEntryDirect(result.data.value);
          }
          break;

        case 'show_message':
          if (result.message) {
            await addAssistantMessage(result.message, 0);
          }
          setIsLoading(false);
          // Stay on current step, user can try again
          break;

        case 'skip':
          if (result.message) {
            await addAssistantMessage(result.message, 0);
          }
          setIsLoading(false);
          // Handle skip - go to manual entry flow
          if (chatStep === 'ask_website') {
            await handleChecklistTellManually();
          }
          break;

        case 'retry':
          if (result.message) {
            await addAssistantMessage(result.message, 0);
          }
          setIsLoading(false);
          // Stay on current step, user can try again
          break;
      }
      return;
    }
  };

  const handleSelectPropertyType = async (type: PropertyType) => {
    if (chatStep !== 'ask_type' || !propertyName) return;

    const typeLabel = t(`propertyTypes.${type}`);
    addUserMessage(typeLabel);
    setPropertyType(type);
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

      // Move to knowledge gathering
      const question = t('knowledge.askWebsite');
      setCurrentQuestion(question);
      await addAssistantMessage(question, 800);
      setChatStep('ask_website');
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

      // Move to knowledge gathering
      const question = t('knowledge.askWebsite');
      setCurrentQuestion(question);
      await addAssistantMessage(question, 800);
      setChatStep('ask_website');
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
    if (chatStep === 'ask_website') return 'text' as const;
    if (chatStep === 'show_checklist') return 'checklist' as const;
    if (chatStep.startsWith('ask_manual_')) return 'text' as const;
    if (chatStep === 'ask_admin') return 'form' as const;
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

  const getAdminFormConfig = (): FormCardConfig => {
    return {
      title: t('admin.title'),
      description: t('admin.description'),
      fields: [
        {
          key: 'name',
          label: t('admin.nameLabel'),
          type: 'text' as const,
          placeholder: t('admin.namePlaceholder'),
          required: true,
        },
        {
          key: 'email',
          label: t('admin.emailLabel'),
          type: 'email' as const,
          placeholder: t('admin.emailPlaceholder'),
          required: true,
        },
        {
          key: 'password',
          label: t('admin.passwordLabel'),
          type: 'password' as const,
          placeholder: t('admin.passwordPlaceholder'),
          required: true,
        },
        {
          key: 'confirmPassword',
          label: t('admin.confirmLabel'),
          type: 'password' as const,
          placeholder: t('admin.confirmPlaceholder'),
          required: true,
        },
      ],
      submitLabel: t('admin.submit'),
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

  // Deduplicate entries by title and category
  const deduplicateEntries = (existing: ExtractedEntry[], newEntries: ExtractedEntry[]): ExtractedEntry[] => {
    const seen = new Set<string>();

    // Add existing entries to seen set
    for (const entry of existing) {
      const key = `${entry.category}:${entry.title.toLowerCase().trim()}`;
      seen.add(key);
    }

    // Filter new entries, keeping only unique ones
    const unique: ExtractedEntry[] = [];
    for (const entry of newEntries) {
      const key = `${entry.category}:${entry.title.toLowerCase().trim()}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(entry);
      }
    }

    return unique;
  };

  // Build checklist from scraped entries
  const buildChecklist = (entries: ExtractedEntry[]): KnowledgeChecklist => {
    const categoryCounts: Record<string, number> = {};
    for (const entry of entries) {
      const itemId = CATEGORY_TO_ITEM[entry.category] || 'other';
      categoryCounts[itemId] = (categoryCounts[itemId] || 0) + 1;
    }

    const items: ChecklistItem[] = [
      { id: 'policy', label: t('knowledge.items.policy'), found: (categoryCounts['policy'] || 0) > 0, count: categoryCounts['policy'], required: true },
      { id: 'room_type', label: t('knowledge.items.room_type'), found: (categoryCounts['room_type'] || 0) > 0, count: categoryCounts['room_type'], required: true },
      { id: 'contact', label: t('knowledge.items.contact'), found: (categoryCounts['contact'] || 0) > 0, count: categoryCounts['contact'], required: true },
      { id: 'local_info', label: t('knowledge.items.local_info'), found: (categoryCounts['local_info'] || 0) > 0, count: categoryCounts['local_info'], required: true },
      { id: 'amenity', label: t('knowledge.items.amenity'), found: (categoryCounts['amenity'] || 0) > 0, count: categoryCounts['amenity'], required: false },
      { id: 'service', label: t('knowledge.items.service'), found: (categoryCounts['service'] || 0) > 0, count: categoryCounts['service'], required: false },
      { id: 'dining', label: t('knowledge.items.dining'), found: (categoryCounts['dining'] || 0) > 0, count: categoryCounts['dining'], required: false },
      { id: 'faq', label: t('knowledge.items.faq'), found: (categoryCounts['faq'] || 0) > 0, count: categoryCounts['faq'], required: false },
    ];

    const requiredMet = items.filter(item => item.required).every(item => item.found);

    return { items, entries, canContinue: requiredMet };
  };

  // Handle website scrape
  const handleWebsiteScrape = async (url: string) => {
    // Normalize URL
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }

    // Validate URL
    try {
      new URL(normalizedUrl);
    } catch {
      await addAssistantMessage(t('knowledge.errorFetching'), 500);
      setChatStep('ask_website');
      return;
    }

    setIsLoading(true);
    setChatStep('scraping');
    setTypingStatus(t('knowledge.scrapingFetching'));
    showTyping();

    // Progress messages to show while waiting
    const progressMessages = [
      { delay: 3000, message: t('knowledge.scrapingExtracting') },
      { delay: 8000, message: t('knowledge.scraping') },
    ];
    const progressTimers: NodeJS.Timeout[] = [];

    // Set up progress message timers
    for (const { delay, message } of progressMessages) {
      progressTimers.push(setTimeout(() => setTypingStatus(message), delay));
    }

    try {
      // Call the parse endpoint which does fetch + AI extract + dedup
      const response = await fetch('/api/v1/tools/site-scraper/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls: [normalizedUrl],
          options: { hotelName: propertyName },
        }),
      });

      // Clear progress timers
      progressTimers.forEach(timer => clearTimeout(timer));

      if (!response.ok) {
        hideTyping();
        setTypingStatus('');
        const errorData = await response.json();
        await addAssistantMessage(errorData.error?.message || t('knowledge.errorFetching'), 0);
        setChatStep('ask_website');
        setIsLoading(false);
        return;
      }

      const data = await response.json();
      const entries = (data.entries || []) as ExtractedEntry[];

      if (entries.length === 0) {
        hideTyping();
        setTypingStatus('');
        await addAssistantMessage(t('knowledge.noContent'), 0);
        setChatStep('ask_website');
        setIsLoading(false);
        return;
      }

      // Import entries to knowledge base
      setTypingStatus(t('knowledge.scrapingSaving'));
      await fetch('/api/v1/tools/site-scraper/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: entries.map(e => ({
            category: e.category,
            title: e.title,
            content: e.content,
            keywords: e.keywords,
            priority: 5,
            sourceUrl: normalizedUrl,
          })),
        }),
      });

      hideTyping();
      setTypingStatus('');

      // Combine with any previously scraped entries (deduplicated)
      const uniqueNewEntries = deduplicateEntries(scrapedEntries, entries);
      const allEntries = [...scrapedEntries, ...uniqueNewEntries];
      setScrapedEntries(allEntries);

      const newChecklist = buildChecklist(allEntries);
      setChecklist(newChecklist);

      // Show count of new unique entries found
      const newCount = uniqueNewEntries.length;
      const dupCount = entries.length - newCount;
      if (dupCount > 0 && scrapedEntries.length > 0) {
        await addAssistantMessage(t('knowledge.foundItemsWithDuplicates', { count: newCount, duplicates: dupCount }), 0);
      } else {
        await addAssistantMessage(t('knowledge.foundItems', { count: entries.length }), 0);
      }
      setChatStep('show_checklist');
    } catch (error) {
      console.error('Failed to scrape website:', error);
      progressTimers.forEach(timer => clearTimeout(timer));
      hideTyping();
      setTypingStatus('');
      await addAssistantMessage(t('knowledge.errorFetching'), 0);
      setChatStep('ask_website');
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to get question key for a category
  const getQuestionKeyForCategory = (category: string): string => {
    switch (category) {
      case 'policy': return 'knowledge.askCheckin';
      case 'room_type': return 'knowledge.askRoomType';
      case 'contact': return 'knowledge.askContact';
      case 'local_info': return 'knowledge.askLocation';
      default: return 'knowledge.askWebsite';
    }
  };

  // Handle checklist actions
  const handleChecklistTryUrl = async () => {
    setChatStep('done');
    const question = t('knowledge.askWebsite');
    setCurrentQuestion(question);
    await addAssistantMessage(question, 500);
    setChatStep('ask_website');
  };

  const handleChecklistTellManually = async () => {
    // Find first missing required category
    const missingCategories = REQUIRED_CATEGORIES.filter(cat => {
      const item = checklist?.items.find(i => i.id === cat);
      return !item?.found;
    });

    if (missingCategories.length === 0) {
      // All required met, shouldn't happen but handle gracefully
      handleChecklistContinue();
      return;
    }

    const firstMissing = missingCategories[0];
    const nextStep = MISSING_CATEGORY_TO_STEP[firstMissing];

    if (nextStep) {
      setChatStep('done');
      const questionKey = getQuestionKeyForCategory(firstMissing);
      const question = t(questionKey);
      setCurrentQuestion(question);
      await addAssistantMessage(question, 500);
      setChatStep(nextStep);
    }
  };

  const handleChecklistContinue = async () => {
    setIsLoading(true);
    setChatStep('done');

    try {
      // Sync profile from knowledge entries (extracts check-in times, contact, etc.)
      await fetch('/api/v1/setup/sync-profile', { method: 'POST' });

      // Complete knowledge gathering (moves to create_admin step)
      await fetch('/api/v1/setup/knowledge/complete', { method: 'POST' });
      await addAssistantMessage(t('knowledge.allRequired'), 500);

      // Move to admin creation step
      setChatStep('ask_admin');
    } catch (error) {
      console.error('Failed to complete knowledge:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdminSubmit = async (data: Record<string, string>) => {
    // Validate passwords match
    if (data.password !== data.confirmPassword) {
      await addAssistantMessage(t('admin.passwordMismatch'), 0);
      return;
    }

    // Validate password length
    if (data.password.length < 8) {
      await addAssistantMessage(t('admin.passwordTooShort'), 0);
      return;
    }

    setIsLoading(true);
    addUserMessage(data.email);
    setChatStep('done');
    showTyping();

    try {
      const response = await fetch('/api/v1/setup/create-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          name: data.name,
        }),
      });

      const responseData = await response.json();
      hideTyping();

      if (!response.ok) {
        await addAssistantMessage(responseData.error?.message || 'Failed to create account', 0);
        setChatStep('ask_admin');
        setIsLoading(false);
        return;
      }

      await addAssistantMessage(t('admin.success'), 0);
      setChatStep('complete');

      // Redirect to login after a short delay
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 1500);
    } catch (error) {
      console.error('Failed to create admin:', error);
      hideTyping();
      await addAssistantMessage('Failed to create account. Please try again.', 0);
      setChatStep('ask_admin');
    } finally {
      setIsLoading(false);
    }
  };

  // Get category and title for current manual entry step
  const getManualEntryInfo = (): { category: KnowledgeCategory; title: string } | null => {
    switch (chatStep) {
      case 'ask_manual_checkin':
        return { category: 'policy', title: 'Check-in/Check-out Times' };
      case 'ask_manual_room':
        return { category: 'room_type', title: 'Room Type' };
      case 'ask_manual_contact':
        return { category: 'contact', title: 'Contact Information' };
      case 'ask_manual_location':
        return { category: 'local_info', title: 'Location & Address' };
      default:
        return null;
    }
  };

  // Direct manual entry handler (called after AI processing or as fallback)
  const handleManualEntryDirect = async (content: string) => {
    const info = getManualEntryInfo();
    if (!info) return;

    const { category, title } = info;

    try {
      // Import the manual entry
      await fetch('/api/v1/tools/site-scraper/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: [{
            category,
            title,
            content,
            keywords: [],
            priority: 8,
            sourceUrl: '',
          }],
        }),
      });

      // Add to scraped entries
      const newEntry: ExtractedEntry = {
        title,
        content,
        category,
        keywords: [],
        confidence: 1,
      };
      const allEntries = [...scrapedEntries, newEntry];
      setScrapedEntries(allEntries);

      const newChecklist = buildChecklist(allEntries);
      setChecklist(newChecklist);

      await addAssistantMessage(t('knowledge.savedItem'), 0);

      // Check if there are more missing required items
      const stillMissing = REQUIRED_CATEGORIES.filter(cat => {
        const item = newChecklist.items.find(i => i.id === cat);
        return !item?.found;
      });

      if (stillMissing.length > 0) {
        // Ask for next missing item
        const nextMissing = stillMissing[0];
        const nextStep = MISSING_CATEGORY_TO_STEP[nextMissing];
        if (nextStep) {
          const questionKey = getQuestionKeyForCategory(nextMissing);
          const question = t(questionKey);
          setCurrentQuestion(question);
          await addAssistantMessage(question, 500);
          setChatStep(nextStep);
        }
      } else {
        // All required met, show checklist
        setChatStep('show_checklist');
      }
    } catch (error) {
      console.error('Failed to save manual entry:', error);
    }
  };

  // Handle manual entry for missing items (legacy, with loading state)
  const handleManualEntry = async (content: string) => {
    setIsLoading(true);
    showTyping();

    try {
      await handleManualEntryDirect(content);
    } finally {
      hideTyping();
      setIsLoading(false);
    }
  };

  const getProgressStep = () => {
    if (step === 'bootstrap') return 0;
    if (chatStep === 'greeting' || chatStep === 'ask_name' || chatStep === 'ask_type') return 1;
    if (chatStep === 'ask_ai_provider' || chatStep === 'ask_api_key') return 2;
    if (chatStep === 'ask_website' || chatStep === 'scraping' || chatStep === 'show_checklist' || chatStep.startsWith('ask_manual_')) return 3;
    if (chatStep === 'ask_admin') return 4;
    if (chatStep === 'complete' || chatStep === 'done') return 5;
    return 0;
  };

  const totalSteps = 5;
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
            formConfig={
              chatStep === 'ask_api_key'
                ? getApiKeyFormConfig()
                : chatStep === 'ask_admin'
                  ? getAdminFormConfig()
                  : undefined
            }
            onFormSubmit={
              chatStep === 'ask_api_key'
                ? handleApiKeySubmit
                : chatStep === 'ask_admin'
                  ? handleAdminSubmit
                  : undefined
            }
            onFormSkip={chatStep === 'ask_api_key' ? handleApiKeySkip : undefined}
            onFormHelp={chatStep === 'ask_api_key' ? handleApiKeyHelp : undefined}
            checklistItems={chatStep === 'show_checklist' ? checklist?.items : undefined}
            checklistCanContinue={chatStep === 'show_checklist' ? checklist?.canContinue : undefined}
            onChecklistTryUrl={chatStep === 'show_checklist' ? handleChecklistTryUrl : undefined}
            onChecklistTellManually={chatStep === 'show_checklist' ? handleChecklistTellManually : undefined}
            onChecklistContinue={chatStep === 'show_checklist' ? handleChecklistContinue : undefined}
            isTyping={isTyping}
            typingStatusText={typingStatus}
            disabled={isLoading || chatStep === 'done' || chatStep === 'complete' || chatStep === 'scraping'}
          />
        )}
      </main>
    </div>
  );
}
