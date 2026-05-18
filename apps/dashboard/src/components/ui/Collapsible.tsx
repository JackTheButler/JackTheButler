import { createContext, useContext, useId, useState } from 'react';
import { cn } from './cn';

/** Minimal disclosure: a trigger toggles an animated content region.
 *  Children use CollapsibleTrigger / CollapsibleContent. */
type Ctx = { open: boolean; toggle: () => void; id: string };
const CollapsibleCtx = createContext<Ctx | null>(null);

function useCollapsible() {
  const ctx = useContext(CollapsibleCtx);
  if (!ctx) throw new Error('Collapsible.* must be used within <Collapsible>');
  return ctx;
}

export function Collapsible({
  children,
  defaultOpen = false,
  className,
}: {
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <CollapsibleCtx.Provider value={{ open, toggle: () => setOpen((o) => !o), id }}>
      <div className={className}>{children}</div>
    </CollapsibleCtx.Provider>
  );
}

export function CollapsibleTrigger({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { open, toggle, id } = useCollapsible();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={open}
      aria-controls={id}
      data-state={open ? 'open' : 'closed'}
      className={cn('group', className)}
    >
      {children}
    </button>
  );
}

export function CollapsibleContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { open, id } = useCollapsible();
  return (
    <div
      id={id}
      className={cn(
        'grid transition-[grid-template-rows] duration-200 ease-out',
        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
      )}
    >
      <div className={cn('overflow-hidden', className)} aria-hidden={!open}>
        {children}
      </div>
    </div>
  );
}
