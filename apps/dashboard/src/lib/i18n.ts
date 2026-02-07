import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import namespace files for each language
import enCommon from '@/locales/en/common.json';
import enAuth from '@/locales/en/auth.json';
import enDashboard from '@/locales/en/dashboard.json';
import enTasks from '@/locales/en/tasks.json';
import enConversations from '@/locales/en/conversations.json';
import enGuests from '@/locales/en/guests.json';
import enReservations from '@/locales/en/reservations.json';
import enSettings from '@/locales/en/settings.json';
import enAutomations from '@/locales/en/automations.json';
import enKnowledge from '@/locales/en/knowledge.json';
import enSetup from '@/locales/en/setup.json';

import esCommon from '@/locales/es/common.json';
import esAuth from '@/locales/es/auth.json';
import esDashboard from '@/locales/es/dashboard.json';
import esTasks from '@/locales/es/tasks.json';
import esConversations from '@/locales/es/conversations.json';
import esGuests from '@/locales/es/guests.json';
import esReservations from '@/locales/es/reservations.json';
import esSettings from '@/locales/es/settings.json';
import esAutomations from '@/locales/es/automations.json';
import esKnowledge from '@/locales/es/knowledge.json';
import esSetup from '@/locales/es/setup.json';

import arCommon from '@/locales/ar/common.json';
import arAuth from '@/locales/ar/auth.json';
import arDashboard from '@/locales/ar/dashboard.json';
import arTasks from '@/locales/ar/tasks.json';
import arConversations from '@/locales/ar/conversations.json';
import arGuests from '@/locales/ar/guests.json';
import arReservations from '@/locales/ar/reservations.json';
import arSettings from '@/locales/ar/settings.json';
import arAutomations from '@/locales/ar/automations.json';
import arKnowledge from '@/locales/ar/knowledge.json';
import arSetup from '@/locales/ar/setup.json';

import hiCommon from '@/locales/hi/common.json';
import hiAuth from '@/locales/hi/auth.json';
import hiDashboard from '@/locales/hi/dashboard.json';
import hiTasks from '@/locales/hi/tasks.json';
import hiConversations from '@/locales/hi/conversations.json';
import hiGuests from '@/locales/hi/guests.json';
import hiReservations from '@/locales/hi/reservations.json';
import hiSettings from '@/locales/hi/settings.json';
import hiAutomations from '@/locales/hi/automations.json';
import hiKnowledge from '@/locales/hi/knowledge.json';
import hiSetup from '@/locales/hi/setup.json';

import ruCommon from '@/locales/ru/common.json';
import ruAuth from '@/locales/ru/auth.json';
import ruDashboard from '@/locales/ru/dashboard.json';
import ruTasks from '@/locales/ru/tasks.json';
import ruConversations from '@/locales/ru/conversations.json';
import ruGuests from '@/locales/ru/guests.json';
import ruReservations from '@/locales/ru/reservations.json';
import ruSettings from '@/locales/ru/settings.json';
import ruAutomations from '@/locales/ru/automations.json';
import ruKnowledge from '@/locales/ru/knowledge.json';
import ruSetup from '@/locales/ru/setup.json';

import zhCommon from '@/locales/zh/common.json';
import zhAuth from '@/locales/zh/auth.json';
import zhDashboard from '@/locales/zh/dashboard.json';
import zhTasks from '@/locales/zh/tasks.json';
import zhConversations from '@/locales/zh/conversations.json';
import zhGuests from '@/locales/zh/guests.json';
import zhReservations from '@/locales/zh/reservations.json';
import zhSettings from '@/locales/zh/settings.json';
import zhAutomations from '@/locales/zh/automations.json';
import zhKnowledge from '@/locales/zh/knowledge.json';
import zhSetup from '@/locales/zh/setup.json';

// Define available namespaces
export const namespaces = [
  'common',
  'auth',
  'dashboard',
  'tasks',
  'conversations',
  'guests',
  'reservations',
  'settings',
  'automations',
  'knowledge',
  'setup',
] as const;

export type Namespace = (typeof namespaces)[number];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: enCommon,
        auth: enAuth,
        dashboard: enDashboard,
        tasks: enTasks,
        conversations: enConversations,
        guests: enGuests,
        reservations: enReservations,
        settings: enSettings,
        automations: enAutomations,
        knowledge: enKnowledge,
        setup: enSetup,
      },
      es: {
        common: esCommon,
        auth: esAuth,
        dashboard: esDashboard,
        tasks: esTasks,
        conversations: esConversations,
        guests: esGuests,
        reservations: esReservations,
        settings: esSettings,
        automations: esAutomations,
        knowledge: esKnowledge,
        setup: esSetup,
      },
      ar: {
        common: arCommon,
        auth: arAuth,
        dashboard: arDashboard,
        tasks: arTasks,
        conversations: arConversations,
        guests: arGuests,
        reservations: arReservations,
        settings: arSettings,
        automations: arAutomations,
        knowledge: arKnowledge,
        setup: arSetup,
      },
      hi: {
        common: hiCommon,
        auth: hiAuth,
        dashboard: hiDashboard,
        tasks: hiTasks,
        conversations: hiConversations,
        guests: hiGuests,
        reservations: hiReservations,
        settings: hiSettings,
        automations: hiAutomations,
        knowledge: hiKnowledge,
        setup: hiSetup,
      },
      ru: {
        common: ruCommon,
        auth: ruAuth,
        dashboard: ruDashboard,
        tasks: ruTasks,
        conversations: ruConversations,
        guests: ruGuests,
        reservations: ruReservations,
        settings: ruSettings,
        automations: ruAutomations,
        knowledge: ruKnowledge,
        setup: ruSetup,
      },
      zh: {
        common: zhCommon,
        auth: zhAuth,
        dashboard: zhDashboard,
        tasks: zhTasks,
        conversations: zhConversations,
        guests: zhGuests,
        reservations: zhReservations,
        settings: zhSettings,
        automations: zhAutomations,
        knowledge: zhKnowledge,
        setup: zhSetup,
      },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'es', 'ar', 'hi', 'ru', 'zh'],
    // Default namespace
    defaultNS: 'common',
    // Load all namespaces (they're bundled anyway)
    ns: namespaces as unknown as string[],
    // Search other namespaces when key not found in default
    fallbackNS: ['auth', 'dashboard', 'tasks', 'conversations', 'guests', 'reservations', 'settings', 'automations', 'knowledge', 'setup'],
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'language',
    },
    interpolation: {
      escapeValue: false,
    },
  });

const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur'];

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'ru', label: 'Русский' },
  { code: 'zh', label: '中文' },
  { code: 'ar', label: 'العربية' },
] as const;

// Set initial direction based on detected language
document.documentElement.dir = RTL_LANGUAGES.includes(i18n.language) ? 'rtl' : 'ltr';

export function setLanguage(lang: string) {
  i18n.changeLanguage(lang);
  localStorage.setItem('language', lang);
  document.documentElement.dir = RTL_LANGUAGES.includes(lang) ? 'rtl' : 'ltr';
}

export function getLanguage(): string {
  return i18n.language;
}

export default i18n;
