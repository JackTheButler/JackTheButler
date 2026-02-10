import { useTranslation } from 'react-i18next';
import { Globe, ChevronDown } from 'lucide-react';
import { setLanguage, SUPPORTED_LANGUAGES } from '@/lib/i18n';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

interface LanguageToggleProps {
  iconOnly?: boolean;
}

export function LanguageToggle({ iconOnly }: LanguageToggleProps) {
  const { i18n } = useTranslation();

  const currentLanguage = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) || SUPPORTED_LANGUAGES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <button
          className="flex items-center gap-1.5 h-8 px-2 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          aria-label="Change language"
        >
          <Globe className="h-4 w-4" />
          {!iconOnly && (
            <>
              <span className="text-sm">{currentLanguage.label}</span>
              <ChevronDown className="h-3 w-3" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {SUPPORTED_LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => setLanguage(lang.code)}
            className={lang.code === i18n.language ? 'bg-muted' : ''}
          >
            {lang.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
