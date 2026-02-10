import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

export function PageContainer({ children, className }: PageContainerProps) {
  return <div className={cn('p-4 sm:p-6 space-y-4 sm:space-y-6 min-h-full bg-muted/50', className)}>{children}</div>;
}
