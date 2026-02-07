import { useTranslation } from 'react-i18next';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Tooltip } from '@/components/ui/tooltip';
import { useTheme } from '@/contexts/ThemeContext';
import { Progress } from '@/components/ui/progress';

interface SetupHeaderProps {
  onSkip?: () => void;
  showSkip?: boolean;
  progressCurrent?: number;
  progressTotal?: number;
  showProgress?: boolean;
}

export function SetupHeader({
  onSkip,
  showSkip = true,
  progressCurrent = 0,
  progressTotal = 3,
  showProgress = false,
}: SetupHeaderProps) {
  const { t } = useTranslation('setup');
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // Show partial progress: first step shows ~10%, progresses through steps
  const progressValue = ((progressCurrent + 0.3) / progressTotal) * 100;

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between p-4 bg-background/80 backdrop-blur-sm shadow-sm">
      <div className="flex items-center">
        {showProgress && (
          <Progress value={progressValue} className="w-24 sm:w-40 h-2" />
        )}
      </div>

      <div className="flex items-center gap-2">
        <Tooltip content={isDark ? t('common:common.switchToLight') : t('common:common.switchToDark')} side="bottom">
          <span>
            <ThemeToggle />
          </span>
        </Tooltip>

        {showSkip && onSkip && (
          <button
            onClick={onSkip}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5"
          >
            {t('skip')}
          </button>
        )}
      </div>
    </header>
  );
}
