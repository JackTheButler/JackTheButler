# Multi-Language Support Specification

This document defines the multi-language capabilities of Jack The Butler.

---

## Overview

Jack supports multilingual guest communication through:

- Automatic language detection
- AI-powered response translation
- UI localization for staff dashboard
- Multi-language knowledge base

---

## Supported Languages

### Tier 1: Full Support

Full AI response generation and UI localization:

| Code | Language | AI Support | UI |
|------|----------|------------|-----|
| `en` | English | Native | ✓ |
| `es` | Spanish | Native | ✓ |
| `fr` | French | Native | ✓ |
| `de` | German | Native | ✓ |
| `it` | Italian | Native | ✓ |
| `pt` | Portuguese | Native | ✓ |
| `ja` | Japanese | Native | ✓ |
| `zh` | Chinese (Simplified) | Native | ✓ |

### Tier 2: AI Response Only

AI can respond but no UI localization:

| Code | Language | AI Support | UI |
|------|----------|------------|-----|
| `ko` | Korean | Native | - |
| `ar` | Arabic | Native | - |
| `ru` | Russian | Native | - |
| `nl` | Dutch | Native | - |
| `pl` | Polish | Native | - |
| `th` | Thai | Native | - |
| `vi` | Vietnamese | Native | - |
| `tr` | Turkish | Native | - |

### Tier 3: Translation-Assisted

AI uses translation for response:

| Code | Language | Method |
|------|----------|--------|
| Other | 100+ languages | Translation API |

---

## Language Detection

### Detection Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Message   │────▶│   Detect    │────▶│   Store     │
│   Received  │     │   Language  │     │   on Guest  │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   AI Uses   │
                    │   Language  │
                    └─────────────┘
```

### Detection Implementation

```typescript
interface LanguageDetectionResult {
  language: string;              // ISO 639-1 code
  confidence: number;            // 0.0 to 1.0
  script?: string;               // 'Latin', 'Cyrillic', 'Han', etc.
  isReliable: boolean;
}

class LanguageDetector {
  // Use AI model for detection (part of intent classification)
  async detectFromMessage(content: string): Promise<LanguageDetectionResult> {
    // Short messages: use heuristics first
    if (content.length < 20) {
      const heuristic = this.detectByHeuristics(content);
      if (heuristic.confidence > 0.8) {
        return heuristic;
      }
    }

    // Use AI for reliable detection
    const response = await this.ai.complete({
      model: 'claude-haiku',
      system: `Detect the language of the user message. Respond with JSON only:
        {"language": "ISO 639-1 code", "confidence": 0.0-1.0, "script": "script name"}`,
      messages: [{ role: 'user', content }],
      maxTokens: 50,
    });

    return JSON.parse(response.content);
  }

  private detectByHeuristics(content: string): LanguageDetectionResult {
    // Script detection
    const scripts = {
      arabic: /[\u0600-\u06FF]/,
      chinese: /[\u4E00-\u9FFF]/,
      japanese: /[\u3040-\u309F\u30A0-\u30FF]/,
      korean: /[\uAC00-\uD7AF]/,
      cyrillic: /[\u0400-\u04FF]/,
      thai: /[\u0E00-\u0E7F]/,
      hebrew: /[\u0590-\u05FF]/,
    };

    for (const [script, pattern] of Object.entries(scripts)) {
      if (pattern.test(content)) {
        return {
          language: this.scriptToLanguage(script),
          confidence: 0.9,
          script,
          isReliable: true,
        };
      }
    }

    // Common word detection for Latin scripts
    const commonWords = {
      en: ['the', 'is', 'are', 'what', 'how', 'please', 'thank'],
      es: ['el', 'la', 'es', 'que', 'por', 'favor', 'gracias'],
      fr: ['le', 'la', 'est', 'que', 'pour', 'merci', 'bonjour'],
      de: ['der', 'die', 'das', 'ist', 'bitte', 'danke'],
      it: ['il', 'la', 'è', 'che', 'per', 'grazie'],
      pt: ['o', 'a', 'é', 'que', 'por', 'obrigado'],
    };

    const words = content.toLowerCase().split(/\s+/);
    let bestMatch = { language: 'en', score: 0 };

    for (const [lang, wordList] of Object.entries(commonWords)) {
      const matches = words.filter(w => wordList.includes(w)).length;
      if (matches > bestMatch.score) {
        bestMatch = { language: lang, score: matches };
      }
    }

    return {
      language: bestMatch.language,
      confidence: Math.min(0.5 + bestMatch.score * 0.1, 0.8),
      script: 'Latin',
      isReliable: bestMatch.score >= 2,
    };
  }

  private scriptToLanguage(script: string): string {
    const mapping: Record<string, string> = {
      arabic: 'ar',
      chinese: 'zh',
      japanese: 'ja',
      korean: 'ko',
      cyrillic: 'ru',
      thai: 'th',
      hebrew: 'he',
    };
    return mapping[script] || 'en';
  }
}
```

### Guest Language Tracking

```typescript
interface GuestLanguagePreference {
  primary: string;               // Most frequently used
  detected: string[];            // All detected languages
  explicit?: string;             // Explicitly set by guest
  confidence: number;
}

async function updateGuestLanguage(
  guestId: string,
  detected: LanguageDetectionResult
): Promise<void> {
  const guest = await db.guests.findById(guestId);

  // Keep history of detected languages
  const detectedLanguages = guest.detectedLanguages || [];
  detectedLanguages.push({
    language: detected.language,
    confidence: detected.confidence,
    timestamp: new Date(),
  });

  // Keep last 10 detections
  const recent = detectedLanguages.slice(-10);

  // Calculate primary language (most frequent with confidence weighting)
  const languageCounts = recent.reduce((acc, d) => {
    acc[d.language] = (acc[d.language] || 0) + d.confidence;
    return acc;
  }, {} as Record<string, number>);

  const primary = Object.entries(languageCounts)
    .sort(([, a], [, b]) => b - a)[0][0];

  await db.guests.update(guestId, {
    language: primary,
    detectedLanguages: recent,
  });
}
```

---

## Response Generation

### Language-Aware AI Prompting

```typescript
async function generateResponse(
  conversation: Conversation,
  message: string,
  context: ConversationContext
): Promise<AIResponse> {
  const guest = await db.guests.findById(conversation.guestId);
  const language = guest.language || 'en';

  const systemPrompt = buildSystemPrompt(language, context);

  const response = await ai.complete({
    model: 'claude-sonnet-4-20250514',
    system: systemPrompt,
    messages: formatConversationHistory(conversation, context),
    maxTokens: 1000,
  });

  return {
    content: response.content,
    language,
    tokensUsed: response.usage.totalTokens,
  };
}

function buildSystemPrompt(language: string, context: ConversationContext): string {
  const basePrompt = `You are Jack, a helpful AI concierge for ${context.propertyName}.`;

  const languageInstruction = getLanguageInstruction(language);

  return `${basePrompt}

${languageInstruction}

Property Information:
- Name: ${context.propertyName}
- Location: ${context.propertyLocation}
- Current Time: ${context.localTime}

${context.knowledgeBase ? `Relevant Information:\n${context.knowledgeBase}` : ''}`;
}

function getLanguageInstruction(language: string): string {
  const instructions: Record<string, string> = {
    en: 'Respond in English. Use a warm, professional tone.',
    es: 'Responde en español. Usa un tono cálido y profesional. Use usted for formal address.',
    fr: 'Répondez en français. Utilisez un ton chaleureux et professionnel. Vouvoyez le client.',
    de: 'Antworten Sie auf Deutsch. Verwenden Sie einen warmen, professionellen Ton. Siezen Sie den Gast.',
    it: 'Rispondi in italiano. Usa un tono caldo e professionale. Usa il Lei per la forma di cortesia.',
    pt: 'Responda em português. Use um tom caloroso e profissional.',
    ja: '日本語で丁寧にお答えください。敬語を使用してください。',
    zh: '请用中文回复。使用温暖、专业的语气。',
    ko: '한국어로 정중하게 답변해 주세요.',
    ar: 'الرجاء الرد باللغة العربية. استخدم نبرة دافئة ومهنية.',
    ru: 'Пожалуйста, отвечайте на русском языке. Используйте вежливый, профессиональный тон.',
  };

  return instructions[language] ||
    `Respond in ${getLanguageName(language)}. Use a warm, professional tone.`;
}
```

### Translation Fallback

For languages without native AI support:

```typescript
async function generateWithTranslation(
  conversation: Conversation,
  message: string,
  targetLanguage: string
): Promise<AIResponse> {
  // Translate guest message to English
  const translatedInput = await translateToEnglish(message, targetLanguage);

  // Generate response in English
  const englishResponse = await generateResponse(
    conversation,
    translatedInput,
    { ...context, language: 'en' }
  );

  // Translate response back to guest's language
  const translatedResponse = await translateFromEnglish(
    englishResponse.content,
    targetLanguage
  );

  return {
    content: translatedResponse,
    language: targetLanguage,
    translatedFrom: 'en',
    originalContent: englishResponse.content,
  };
}

async function translateToEnglish(text: string, sourceLanguage: string): Promise<string> {
  // Use AI for translation
  const response = await ai.complete({
    model: 'claude-haiku',
    system: `Translate the following ${getLanguageName(sourceLanguage)} text to English.
             Preserve the meaning and tone. Return only the translation.`,
    messages: [{ role: 'user', content: text }],
    maxTokens: 500,
  });

  return response.content;
}

async function translateFromEnglish(text: string, targetLanguage: string): Promise<string> {
  const response = await ai.complete({
    model: 'claude-haiku',
    system: `Translate the following English text to ${getLanguageName(targetLanguage)}.
             Use appropriate formality for hospitality. Return only the translation.`,
    messages: [{ role: 'user', content: text }],
    maxTokens: 500,
  });

  return response.content;
}
```

---

## UI Localization

### Staff Dashboard

```typescript
// Localization file structure
// locales/
// ├── en.json
// ├── es.json
// ├── fr.json
// ├── de.json
// └── ...

interface LocaleStrings {
  common: {
    save: string;
    cancel: string;
    delete: string;
    edit: string;
    search: string;
    loading: string;
    error: string;
    success: string;
  };
  dashboard: {
    title: string;
    activeConversations: string;
    pendingTasks: string;
    resolvedToday: string;
  };
  conversations: {
    title: string;
    newMessage: string;
    escalate: string;
    resolve: string;
    assignTo: string;
    noMessages: string;
  };
  // ... more sections
}

// Example: locales/es.json
const esLocale: LocaleStrings = {
  common: {
    save: 'Guardar',
    cancel: 'Cancelar',
    delete: 'Eliminar',
    edit: 'Editar',
    search: 'Buscar',
    loading: 'Cargando...',
    error: 'Error',
    success: 'Éxito',
  },
  dashboard: {
    title: 'Panel de Control',
    activeConversations: 'Conversaciones Activas',
    pendingTasks: 'Tareas Pendientes',
    resolvedToday: 'Resueltas Hoy',
  },
  conversations: {
    title: 'Conversaciones',
    newMessage: 'Nuevo Mensaje',
    escalate: 'Escalar',
    resolve: 'Resolver',
    assignTo: 'Asignar a',
    noMessages: 'No hay mensajes',
  },
};
```

### i18n Implementation

```typescript
// React hook for localization
import { useCallback, useMemo } from 'react';
import { useStaffPreferences } from './useStaffPreferences';

type NestedKeyOf<T> = T extends object
  ? { [K in keyof T]: K extends string
      ? T[K] extends object
        ? `${K}.${NestedKeyOf<T[K]>}`
        : K
      : never
    }[keyof T]
  : never;

type TranslationKey = NestedKeyOf<LocaleStrings>;

export function useTranslation() {
  const { language } = useStaffPreferences();

  const locale = useMemo(() => {
    return loadLocale(language);
  }, [language]);

  const t = useCallback((key: TranslationKey, params?: Record<string, string>) => {
    const keys = key.split('.');
    let value: any = locale;

    for (const k of keys) {
      value = value?.[k];
    }

    if (typeof value !== 'string') {
      console.warn(`Missing translation: ${key}`);
      return key;
    }

    // Replace parameters
    if (params) {
      return value.replace(/\{(\w+)\}/g, (_, name) => params[name] || `{${name}}`);
    }

    return value;
  }, [locale]);

  return { t, language };
}

// Usage
function ConversationHeader({ conversation }) {
  const { t } = useTranslation();

  return (
    <header>
      <h1>{t('conversations.title')}</h1>
      <button>{t('conversations.escalate')}</button>
      <button>{t('conversations.resolve')}</button>
    </header>
  );
}
```

### Date/Time Formatting

```typescript
function formatDateTime(
  date: Date,
  language: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short',
  };

  return new Intl.DateTimeFormat(
    language,
    options || defaultOptions
  ).format(date);
}

function formatRelativeTime(date: Date, language: string): string {
  const rtf = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });

  const diffMs = date.getTime() - Date.now();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHour = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHour / 24);

  if (Math.abs(diffSec) < 60) {
    return rtf.format(diffSec, 'second');
  } else if (Math.abs(diffMin) < 60) {
    return rtf.format(diffMin, 'minute');
  } else if (Math.abs(diffHour) < 24) {
    return rtf.format(diffHour, 'hour');
  } else {
    return rtf.format(diffDay, 'day');
  }
}

// Usage
// English: "2 hours ago"
// Spanish: "hace 2 horas"
// German: "vor 2 Stunden"
// Japanese: "2時間前"
```

### Number/Currency Formatting

```typescript
function formatCurrency(
  amount: number,
  currency: string,
  language: string
): string {
  return new Intl.NumberFormat(language, {
    style: 'currency',
    currency,
  }).format(amount);
}

// Examples:
// formatCurrency(1234.56, 'USD', 'en') → "$1,234.56"
// formatCurrency(1234.56, 'EUR', 'de') → "1.234,56 €"
// formatCurrency(1234.56, 'JPY', 'ja') → "￥1,235"
```

---

## Knowledge Base Localization

### Multi-Language Content

```typescript
interface KnowledgeArticle {
  id: string;
  category: string;
  defaultLanguage: string;
  translations: Record<string, ArticleTranslation>;
}

interface ArticleTranslation {
  title: string;
  content: string;
  keywords: string[];
  lastUpdated: Date;
}

async function getArticle(
  articleId: string,
  language: string
): Promise<ArticleTranslation> {
  const article = await db.knowledgeBase.findById(articleId);

  // Return requested language if available
  if (article.translations[language]) {
    return article.translations[language];
  }

  // Fall back to default language
  if (article.translations[article.defaultLanguage]) {
    return article.translations[article.defaultLanguage];
  }

  // Fall back to English
  return article.translations['en'];
}
```

### Embedding by Language

```typescript
async function searchKnowledge(
  query: string,
  language: string,
  limit: number = 5
): Promise<KnowledgeResult[]> {
  // Generate embedding for query
  const queryEmbedding = await embeddings.embed(query);

  // Search with language filter
  const results = await db.prepare(`
    SELECT
      ka.id,
      ka.category,
      kt.title,
      kt.content,
      ke.embedding <=> ? as distance
    FROM knowledge_articles ka
    JOIN knowledge_translations kt ON ka.id = kt.article_id
    JOIN knowledge_embeddings ke ON kt.id = ke.translation_id
    WHERE kt.language = ?
      OR kt.language = ?  -- Fallback to default
    ORDER BY distance
    LIMIT ?
  `).all(
    JSON.stringify(queryEmbedding),
    language,
    'en',
    limit
  );

  return results.map(r => ({
    id: r.id,
    title: r.title,
    content: r.content,
    relevance: 1 - r.distance,
  }));
}
```

---

## Guest Communication

### Language Switching

```typescript
// Guest can switch language mid-conversation
const LANGUAGE_SWITCH_PATTERNS: Record<string, RegExp> = {
  en: /\b(speak|switch to|in)\s+english\b/i,
  es: /\b(habla|cambia a|en)\s+español\b/i,
  fr: /\b(parle|passe à|en)\s+français\b/i,
  de: /\b(sprich|wechsle zu|auf)\s+deutsch\b/i,
};

function detectLanguageSwitch(message: string): string | null {
  for (const [lang, pattern] of Object.entries(LANGUAGE_SWITCH_PATTERNS)) {
    if (pattern.test(message)) {
      return lang;
    }
  }
  return null;
}

async function handleLanguageSwitch(
  conversation: Conversation,
  newLanguage: string
): Promise<void> {
  // Update guest preference
  await db.guests.update(conversation.guestId, {
    language: newLanguage,
    languageSetExplicitly: true,
  });

  // Acknowledge in new language
  const acknowledgments: Record<string, string> = {
    en: "I'll continue in English.",
    es: 'Continuaré en español.',
    fr: 'Je continuerai en français.',
    de: 'Ich werde auf Deutsch fortfahren.',
  };

  await sendMessage(conversation.id, acknowledgments[newLanguage] || acknowledgments.en);
}
```

### Multi-Language Templates

```typescript
interface MessageTemplate {
  id: string;
  type: string;
  translations: Record<string, string>;
  variables: string[];
}

const TEMPLATES: MessageTemplate[] = [
  {
    id: 'welcome',
    type: 'greeting',
    translations: {
      en: 'Welcome to {propertyName}! I\'m Jack, your AI concierge. How may I assist you?',
      es: '¡Bienvenido a {propertyName}! Soy Jack, su conserje virtual. ¿En qué puedo ayudarle?',
      fr: 'Bienvenue à {propertyName}! Je suis Jack, votre concierge virtuel. Comment puis-je vous aider?',
      de: 'Willkommen im {propertyName}! Ich bin Jack, Ihr virtueller Concierge. Wie kann ich Ihnen helfen?',
      ja: '{propertyName}へようこそ！私はJack、AIコンシェルジュです。ご用件をお聞かせください。',
      zh: '欢迎来到{propertyName}！我是Jack，您的AI礼宾员。有什么可以帮您的吗？',
    },
    variables: ['propertyName'],
  },
  {
    id: 'escalation',
    type: 'transfer',
    translations: {
      en: 'I\'ll connect you with a team member who can help further. Please hold for a moment.',
      es: 'Le conectaré con un miembro de nuestro equipo que podrá ayudarle mejor. Por favor, espere un momento.',
      fr: 'Je vais vous mettre en contact avec un membre de notre équipe. Veuillez patienter un instant.',
      de: 'Ich verbinde Sie mit einem Teammitglied, das Ihnen weiterhelfen kann. Bitte warten Sie einen Moment.',
    },
    variables: [],
  },
];

function getTemplate(templateId: string, language: string, variables: Record<string, string>): string {
  const template = TEMPLATES.find(t => t.id === templateId);
  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  let text = template.translations[language] || template.translations['en'];

  // Replace variables
  for (const [key, value] of Object.entries(variables)) {
    text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }

  return text;
}
```

---

## Configuration

```yaml
language:
  # Default language
  default: "en"

  # Supported languages (Tier 1)
  supported:
    - en
    - es
    - fr
    - de
    - it
    - pt
    - ja
    - zh

  # AI response languages (Tier 1 + Tier 2)
  aiLanguages:
    - en
    - es
    - fr
    - de
    - it
    - pt
    - ja
    - zh
    - ko
    - ar
    - ru
    - nl
    - pl
    - th
    - vi
    - tr

  # Detection settings
  detection:
    enabled: true
    minConfidence: 0.6
    trackHistory: true
    historySize: 10

  # Translation (for unsupported languages)
  translation:
    enabled: true
    provider: "ai"               # Use AI for translation

  # UI localization
  ui:
    availableLocales:
      - en
      - es
      - fr
      - de
      - it
      - pt
      - ja
      - zh
    fallbackLocale: "en"
```

---

## Related

- [AI Engine](../../03-architecture/c4-components/ai-engine.md) - AI response generation
- [Guest Memory](guest-memory.md) - Language preference storage
- [Knowledge Base](vector-search.md) - Multi-language content
