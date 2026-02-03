import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { LucideIcon } from 'lucide-react';

interface SectionCardProps {
  title: string;
  icon?: LucideIcon;
  /** Optional badge/count to show in header */
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * A Card with an icon + title header pattern.
 *
 * @example
 * <SectionCard title="Conversations" icon={MessageSquare} badge={<Badge>5</Badge>}>
 *   <p>Content here</p>
 * </SectionCard>
 */
export function SectionCard({
  title,
  icon: Icon,
  badge,
  children,
  className,
}: SectionCardProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4" />}
          {title}
          {badge && <span className="ml-auto">{badge}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
