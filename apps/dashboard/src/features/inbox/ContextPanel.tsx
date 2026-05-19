import type { ReactNode } from 'react';
import { AtSign, Hash, MessageSquare, ChevronLeft } from 'lucide-react';
import type { ConversationDetail } from '@janetheoperator/shared';
import { Avatar, Button, cn } from '@/components/ui';
import { channelLabel } from './channel';
import { customerLabel } from './format';

function Row({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 py-1.5 text-sm">
      <span className="text-muted">{icon}</span>
      <span className="w-20 text-xs text-muted">{label}</span>
      <span className="flex-1 truncate font-medium">{value}</span>
    </div>
  );
}

function ContextBody({ convo }: { convo: ConversationDetail }) {
  const name = customerLabel(convo.customer?.name);
  return (
    <div className="px-3 py-4 md:px-4">
      <div className="flex items-center gap-3">
        <Avatar name={name} size="md" tone="accent" />
        <div>
          <div className="text-sm font-semibold">{name}</div>
          <div className="text-xs text-muted">
            {convo.customer ? 'Customer' : 'Anonymous visitor'}
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-line pt-3">
        {convo.customer?.contact && (
          <Row icon={<AtSign size={14} />} label="Contact" value={convo.customer.contact} />
        )}
        <Row
          icon={<MessageSquare size={14} />}
          label="Channel"
          value={channelLabel(convo.channel)}
        />
        <Row icon={<Hash size={14} />} label="Ref" value={`#${convo.ref}`} />
      </div>
    </div>
  );
}

export function ContextPanel({
  convo,
  mobileShow = false,
  onBack,
}: {
  convo: ConversationDetail;
  mobileShow?: boolean;
  onBack?: () => void;
}) {
  return (
    <>
      <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-line bg-panel xl:block">
        <ContextBody convo={convo} />
      </aside>

      <div
        onClick={onBack}
        className={cn(
          'fixed inset-0 z-40 hidden bg-black/40 transition-opacity duration-300 md:block xl:hidden',
          mobileShow ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      <div
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-panel transition-transform duration-300 ease-out md:w-[26rem] md:border-l md:border-line xl:hidden',
          mobileShow ? 'translate-x-0' : 'pointer-events-none translate-x-full',
        )}
      >
        <header className="flex items-center gap-2 border-b border-line px-3 py-3">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to conversation">
            <ChevronLeft size={20} />
          </Button>
          <span className="text-sm font-semibold">Customer details</span>
        </header>
        <div className="flex-1 overflow-y-auto">
          <ContextBody convo={convo} />
        </div>
      </div>
    </>
  );
}
