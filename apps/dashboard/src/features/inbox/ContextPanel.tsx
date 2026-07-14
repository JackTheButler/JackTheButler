import type { ReactNode } from 'react';
import { AtSign, Hash, MessageSquare } from 'lucide-react';
import type { ConversationDetail } from '@janetheoperator/shared';
import { Avatar, Drawer } from '@/components/ui';
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
      {/* Wide screens: a persistent column. Below xl: a contextual drawer. */}
      <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-line bg-panel xl:block">
        <ContextBody convo={convo} />
      </aside>

      <Drawer
        open={mobileShow}
        onClose={onBack ?? (() => {})}
        title="Customer details"
        widthClass="md:w-[26rem]"
        closeLabel="Back to conversation"
        className="xl:hidden"
      >
        <ContextBody convo={convo} />
      </Drawer>
    </>
  );
}
