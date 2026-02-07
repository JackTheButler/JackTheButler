import { useTranslation } from 'react-i18next';
import { Cpu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface BootstrapScreenProps {
  onContinue: () => void;
  isLoading?: boolean;
}

export function BootstrapScreen({ onContinue, isLoading }: BootstrapScreenProps) {
  const { t } = useTranslation('setup');

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center max-w-md mx-auto">
      <div
        className="relative w-16 h-16 flex items-center justify-center mb-6 opacity-0 animate-fade-in-up"
        style={{ animationDelay: '0ms' }}
      >
        {isLoading && (
          <div className="absolute inset-0 rounded-full border-4 border-foreground/20 border-t-foreground animate-spin" />
        )}
        <div className={cn(
          'w-16 h-16 rounded-full bg-foreground flex items-center justify-center',
          isLoading && 'w-14 h-14'
        )}>
          <Cpu className={cn('text-background animate-spin-once', isLoading ? 'w-7 h-7' : 'w-8 h-8')} />
        </div>
      </div>

      <h2
        className="text-xl font-semibold text-foreground mb-3 opacity-0 animate-fade-in-up"
        style={{ animationDelay: '150ms' }}
      >
        {t('bootstrap.title')}
      </h2>

      <p
        className="text-muted-foreground mb-8 opacity-0 animate-fade-in-up"
        style={{ animationDelay: '300ms' }}
      >
        {t('bootstrap.message')}
      </p>

      <Button
        onClick={onContinue}
        disabled={isLoading}
        loading={isLoading}
        size="lg"
        className="min-w-32 opacity-0 animate-fade-in-up"
        style={{ animationDelay: '450ms' }}
      >
        {t('bootstrap.continue')}
      </Button>
    </div>
  );
}
