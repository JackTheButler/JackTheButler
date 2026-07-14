import type { KnowledgeHitDTO } from '@janetheoperator/shared';
import { Drawer } from '@/components/ui';
import { KnowledgeHitList } from '@/features/knowledge/KnowledgeHitList';

/**
 * Retrieval-transparency drawer: the knowledge entries a specific AI reply was
 * grounded in. Opened from an AI message's knowledge trigger. Always a contextual
 * overlay (it belongs to a tapped message, not a persistent column).
 */
export function KnowledgePanel({
  hits,
  open,
  onClose,
}: {
  hits: KnowledgeHitDTO[];
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`${hits.length} Knowledge used`}
      widthClass="sm:w-[34rem]"
      closeLabel="Close knowledge panel"
    >
      <div className="px-3 py-4 md:px-4">
        <p className="mb-3 text-xs text-muted">The entries Jane used to ground this reply.</p>
        {hits.length > 0 && (
          <KnowledgeHitList
            hits={hits}
            tone="panel"
            // The KB page will read ?edit=<id> to open that entry's editor.
            entryHref={(id) => `/knowledge?edit=${id}`}
          />
        )}
      </div>
    </Drawer>
  );
}
