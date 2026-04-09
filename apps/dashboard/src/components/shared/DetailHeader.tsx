import { ArrowLeft } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

interface DetailHeaderProps {
  backTo: string;
  backLabel: string;
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  actions?: ReactNode;
}

export function DetailHeader({ backTo, backLabel, icon, title, subtitle, action, actions }: DetailHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    if (location.key !== 'default') navigate(-1);
    else navigate(backTo);
  };

  return (
    <>
      <button
        onClick={handleBack}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
        {backLabel}
      </button>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {icon && (
            <div className="p-3 rounded-xl bg-foreground/5 shrink-0">
              {icon}
            </div>
          )}
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle && <div className="text-muted-foreground">{subtitle}</div>}
            {action && <div className="mt-1">{action}</div>}
          </div>
        </div>
        {actions && <div className="flex gap-2 shrink-0">{actions}</div>}
      </div>
    </>
  );
}
