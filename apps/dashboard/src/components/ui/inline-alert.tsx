import { cva, type VariantProps } from 'class-variance-authority';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

const inlineAlertVariants = cva(
  'rounded-lg border p-2.5',
  {
    variants: {
      variant: {
        default: 'bg-gray-50 border-gray-100 text-gray-700',
        info: 'bg-blue-50 border-blue-100 text-blue-700',
        success: 'bg-green-50 border-green-100 text-green-700',
        warning: 'bg-yellow-50 border-yellow-100 text-yellow-700',
        error: 'bg-red-50 border-red-100 text-red-700',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

const iconMap = {
  default: Info,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
};

interface InlineAlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof inlineAlertVariants> {
  children: React.ReactNode;
}

export function InlineAlert({ className, variant, children, ...props }: InlineAlertProps) {
  const Icon = iconMap[variant || 'default'];

  return (
    <div className={cn(inlineAlertVariants({ variant }), className)} {...props}>
      <p className="text-sm flex items-start gap-2">
        <Icon className="w-4 h-4 mt-0.5 shrink-0" />
        {children}
      </p>
    </div>
  );
}
