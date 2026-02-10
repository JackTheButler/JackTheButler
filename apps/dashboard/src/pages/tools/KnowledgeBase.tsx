import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { PageContainer, DataTable, EmptyState } from '@/components';
import { usePageActions } from '@/contexts/PageActionsContext';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import type { Column } from '@/components/DataTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Spinner } from '@/components/ui/spinner';
import {
  Plus,
  Book,
  MoreHorizontal,
  MessageSquare,
  Send,
  RefreshCw,
  ArrowRight,
  AlertTriangle,
  Check,
  Search,
  Sparkles,
  ChevronDown,
  Globe,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { FilterTabs } from '@/components/ui/filter-tabs';

interface KnowledgeEntry {
  id: string;
  category: string;
  title: string;
  content: string;
  keywords: string[];
  priority: number;
  status: string;
  sourceUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Category {
  id: string;
  label: string;
  count: number;
}

interface TestMatch {
  id: string;
  title: string;
  category: string;
  similarity: number;
}

interface TestResult {
  response: string;
  matches: TestMatch[];
}

type AskStep = 'idle' | 'searching' | 'found' | 'generating' | 'complete';

const CATEGORIES = [
  'faq',
  'policy',
  'amenity',
  'service',
  'dining',
  'room_type',
  'local_info',
  'contact',
  'other',
];

export function KnowledgeBasePage() {
  const { t } = useTranslation();
  const { setActions } = usePageActions();
  const { providers, knowledgeBase: kbStatus } = useSystemStatus();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterSource, setFilterSource] = useState<string>(() => {
    return searchParams.get('source') || '';
  });
  const [editingEntry, setEditingEntry] = useState<KnowledgeEntry | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [saving, setSaving] = useState(false);

  // Test knowledge base state
  const [testQuery, setTestQuery] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [askStep, setAskStep] = useState<AskStep>('idle');
  const [searchMatches, setSearchMatches] = useState<TestMatch[]>([]);
  const [matchesExpanded, setMatchesExpanded] = useState(true);

  // Reindex state
  const [reindexing, setReindexing] = useState(false);
  const [showReindexConfirm, setShowReindexConfirm] = useState(false);
  const [showEmbeddingWarning, setShowEmbeddingWarning] = useState(false);

  // Delete state
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    category: 'other',
    title: '',
    content: '',
    keywords: '',
    priority: 5,
  });

  const fetchEntries = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterCategory) params.set('category', filterCategory);
      if (searchQuery) params.set('search', searchQuery);
      if (filterSource) params.set('source', filterSource);

      const data = await api.get<{ entries: KnowledgeEntry[]; total: number }>(
        `/knowledge?${params.toString()}`
      );
      setEntries(data.entries);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load entries');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const data = await api.get<{ categories: Category[] }>('/knowledge/categories');
      setCategories(data.categories);
    } catch (err) {
      // Non-critical, ignore
    }
  };

  useEffect(() => {
    if (!isAddingNew && !editingEntry) {
      setActions([
        {
          id: 'reindex',
          label: t('knowledge.reindex'),
          icon: RefreshCw,
          variant: 'outline',
          onClick: () => providers?.embedding ? setShowReindexConfirm(true) : setShowEmbeddingWarning(true),
          disabled: reindexing,
        },
        {
          id: 'add-entry',
          label: t('knowledge.addEntry'),
          icon: Plus,
          onClick: startAdd,
        },
      ]);
    } else {
      setActions([]);
    }
    return () => setActions([]);
  }, [setActions, isAddingNew, editingEntry, reindexing, t, providers?.embedding]);

  useEffect(() => {
    fetchEntries();
    fetchCategories();
  }, [filterCategory, filterSource, searchQuery]);

  const handleSearch = () => {
    setSearchQuery(search);
  };

  const resetForm = () => {
    setFormData({
      category: 'other',
      title: '',
      content: '',
      keywords: '',
      priority: 5,
    });
    setEditingEntry(null);
    setIsAddingNew(false);
  };

  const startAdd = () => {
    resetForm();
    setIsAddingNew(true);
  };

  const startEdit = (entry: KnowledgeEntry) => {
    setEditingEntry(entry);
    setFormData({
      category: entry.category,
      title: entry.title,
      content: entry.content,
      keywords: entry.keywords.join(', '),
      priority: entry.priority,
    });
    setIsAddingNew(false);
  };

  const handleSave = async () => {
    if (!formData.title.trim() || !formData.content.trim()) {
      setError(t('knowledge.titleContentRequired'));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        category: formData.category,
        title: formData.title.trim(),
        content: formData.content.trim(),
        keywords: formData.keywords
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean),
        priority: formData.priority,
      };

      if (editingEntry) {
        await api.put(`/knowledge/${editingEntry.id}`, payload);
      } else {
        await api.post('/knowledge', payload);
      }

      resetForm();
      fetchEntries();
      fetchCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save entry');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/knowledge/${id}?permanent=true`);
      setDeleteEntryId(null);
      fetchEntries();
      fetchCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete entry');
      setDeleteEntryId(null);
    }
  };

  const handleTest = async () => {
    if (!testQuery.trim()) return;

    setTestLoading(true);
    setTestError(null);
    setTestResult(null);
    setSearchMatches([]);
    setAskStep('searching');
    setMatchesExpanded(true);

    try {
      // Step 1: Search for matches
      const searchResult = await api.post<{ matches: TestMatch[] }>('/knowledge/search', { query: testQuery });
      setSearchMatches(searchResult.matches);
      setAskStep('found');

      // Brief pause to show the matches
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Step 2: Generate AI response
      setAskStep('generating');
      const result = await api.post<TestResult>('/knowledge/ask', { query: testQuery });
      setTestResult(result);
      setAskStep('complete');
      setMatchesExpanded(false);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Failed to test knowledge base');
      setTestResult(null);
      setAskStep('idle');
    } finally {
      setTestLoading(false);
    }
  };

  const handleReindex = async () => {
    setShowReindexConfirm(false);
    setReindexing(true);
    setError(null);

    try {
      const result = await api.post<{ message: string; total: number; success: number; failed: number }>(
        '/knowledge/reindex',
        {}
      );
      setReindexResult(`Reindex complete: ${result.success}/${result.total} entries processed`);
      // Refresh system status to update the warning banner
      queryClient.invalidateQueries({ queryKey: ['system-status'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reindex knowledge base');
    } finally {
      setReindexing(false);
    }
  };

  // Success message state
  const [reindexResult, setReindexResult] = useState<string | null>(null);

  const columns: Column<KnowledgeEntry>[] = [
    {
      key: 'category',
      header: t('knowledge.category'),
      render: (entry) => (
        <Badge>
          {entry.category.replace(/_/g, ' ')}
        </Badge>
      ),
    },
    {
      key: 'title',
      header: t('knowledge.title'),
      render: (entry) => (
        <div className="flex items-center gap-1.5 font-medium truncate max-w-[200px]" title={entry.title}>
          {entry.sourceUrl && (
            <span title={entry.sourceUrl}>
              <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            </span>
          )}
          {entry.title}
        </div>
      ),
    },
    {
      key: 'content',
      header: t('knowledge.content'),
      render: (entry) => (
        <div className="text-sm text-muted-foreground truncate max-w-[300px]" title={entry.content}>
          {entry.content.length > 100 ? `${entry.content.substring(0, 100)}...` : entry.content}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-16',
      render: (entry) => (
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button className="p-1.5 rounded hover:bg-muted text-muted-foreground">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => startEdit(entry)}>
              {t('common.edit')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDeleteEntryId(entry.id)}>
              {t('common.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const categoryOptions = [
    { value: '', label: t('knowledge.allCategories') },
    ...categories.map((cat) => ({ value: cat.id, label: cat.label })),
  ];

  const sourceOptions = [
    { value: '', label: t('common.all') },
    { value: 'manual', label: t('knowledge.sourceManual') },
    { value: 'scraped', label: t('knowledge.sourceScraped') },
  ];

  return (
    <PageContainer>
      {/* Embedding provider warnings */}
      {!providers?.embedding && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>{t('knowledge.embeddingRequired')}</AlertTitle>
          <AlertDescription className="flex items-end justify-between">
            <span>{t('knowledge.embeddingRequiredDesc')}</span>
            <Link to="/engine/apps/ai?provider=local" className="flex items-center gap-1 font-medium hover:underline ms-4 whitespace-nowrap">
              {t('common.configure')} <ArrowRight className="h-3 w-3 rtl:rotate-180" />
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* Reindex needed warning */}
      {providers?.embedding && kbStatus?.needsReindex && (
        <Alert variant="warning" className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t('knowledge.reindexNeeded')}</AlertTitle>
          <AlertDescription className="flex items-end justify-between">
            <span>
              {t('knowledge.indexedStats', {
                indexed: kbStatus.total - kbStatus.withoutEmbeddings,
                total: kbStatus.total,
              })}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowReindexConfirm(true)}
              disabled={reindexing}
              className="ms-4"
            >
              <RefreshCw className={cn('w-4 h-4 me-1.5', reindexing && 'animate-spin')} />
              {t('knowledge.reindex')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive" className="mb-6" onDismiss={() => setError(null)}>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {reindexResult && (
        <Alert variant="success" className="mb-6" onDismiss={() => setReindexResult(null)}>
          <AlertDescription>{reindexResult}</AlertDescription>
        </Alert>
      )}

      {/* Test Knowledge Base */}
      <Card className="mb-6">
        <CardContent className="pt-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <MessageSquare className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !testLoading && handleTest()}
                placeholder={t('knowledge.askQuestion')}
                className="ps-10"
              />
            </div>
            <Button
              onClick={handleTest}
              disabled={testLoading || !testQuery.trim()}
                          >
              {testLoading ? (
                <Spinner size="sm" />
              ) : (
                <>
                  <Send className="w-4 h-4 me-1.5" />
                  {t('knowledge.ask')}
                </>
              )}
            </Button>
          </div>

          {testError && (
            <Alert variant="destructive" className="mt-3">
              <AlertDescription>{testError}</AlertDescription>
            </Alert>
          )}

          {/* Progress Stepper */}
          {askStep !== 'idle' && (
            <div className="mt-4 p-4 bg-muted/30 rounded-lg">
              <div className="flex items-center justify-between mb-4">
                {/* Step 1: Searching */}
                <div className="flex items-center gap-2">
                  <div className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all',
                    askStep === 'searching' && 'bg-primary text-primary-foreground animate-pulse',
                    askStep !== 'searching' && 'bg-primary text-primary-foreground'
                  )}>
                    {askStep === 'searching' ? (
                      <Search className="w-3.5 h-3.5 animate-pulse" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <span className={cn(
                    'text-sm',
                    askStep === 'searching' ? 'text-foreground font-medium' : 'text-muted-foreground'
                  )}>
                    {askStep === 'searching' ? t('knowledge.searching') : t('knowledge.searched')}
                  </span>
                </div>

                {/* Connector */}
                <div className="flex-1 h-0.5 mx-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
                    style={{ width: askStep !== 'searching' ? '100%' : '0%' }}
                  />
                </div>

                {/* Step 2: Found */}
                <div className="flex items-center gap-2">
                  <div className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all',
                    askStep === 'searching' && 'bg-muted text-muted-foreground',
                    askStep === 'found' && 'bg-primary text-primary-foreground animate-pulse',
                    (askStep === 'generating' || askStep === 'complete') && 'bg-primary text-primary-foreground'
                  )}>
                    {askStep !== 'searching' ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <span>2</span>
                    )}
                  </div>
                  <span className={cn(
                    'text-sm',
                    askStep === 'found' ? 'text-foreground font-medium' : 'text-muted-foreground'
                  )}>
                    {askStep !== 'searching'
                      ? t('knowledge.foundMatches', { count: searchMatches.length })
                      : t('knowledge.analyzing')}
                  </span>
                </div>

                {/* Connector */}
                <div className="flex-1 h-0.5 mx-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
                    style={{ width: (askStep === 'generating' || askStep === 'complete') ? '100%' : '0%' }}
                  />
                </div>

                {/* Step 3: Generating */}
                <div className="flex items-center gap-2">
                  <div className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all',
                    askStep === 'generating' && 'bg-primary text-primary-foreground animate-pulse',
                    askStep === 'complete' && 'bg-primary text-primary-foreground',
                    (askStep === 'searching' || askStep === 'found') && 'bg-muted text-muted-foreground'
                  )}>
                    {askStep === 'generating' ? (
                      <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                    ) : askStep === 'complete' ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <span>3</span>
                    )}
                  </div>
                  <span className={cn(
                    'text-sm',
                    askStep === 'generating' ? 'text-foreground font-medium' : 'text-muted-foreground'
                  )}>
                    {t('knowledge.generating')}
                  </span>
                </div>
              </div>

              {/* Show matches */}
              {askStep !== 'searching' && searchMatches.length > 0 && (
                <div className="pt-3 border-t border-border/50">
                  {/* Collapsible header - only clickable when complete */}
                  {askStep === 'complete' ? (
                    <button
                      onClick={() => setMatchesExpanded(!matchesExpanded)}
                      className="flex items-center justify-between w-full text-left mb-2 group"
                    >
                      <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                        {t('knowledge.matchedEntries')} ({searchMatches.length})
                      </span>
                      <ChevronDown className={cn(
                        'w-4 h-4 text-muted-foreground group-hover:text-foreground transition-all duration-300',
                        matchesExpanded && 'rotate-180'
                      )} />
                    </button>
                  ) : null}

                  {/* Matches list with smooth height animation */}
                  <div
                    className="grid transition-[grid-template-rows] duration-300 ease-out"
                    style={{ gridTemplateRows: matchesExpanded ? '1fr' : '0fr' }}
                  >
                    <div className="overflow-hidden">
                      <div className="space-y-1.5">
                        {searchMatches.map((match, index) => (
                          <div
                            key={match.id}
                            className="flex items-center justify-between py-1.5 px-2 bg-background/50 rounded text-sm"
                            style={{
                              opacity: askStep === 'complete' ? 1 : 0,
                              transform: askStep === 'complete' ? 'translateY(0)' : 'translateY(-8px)',
                              animation: askStep !== 'complete' ? `fadeSlideIn 0.3s ease-out ${index * 150}ms forwards` : 'none',
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">
                                {match.category.replace(/_/g, ' ')}
                              </Badge>
                              <span className="text-foreground">{match.title}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary rounded-full"
                                  style={{ width: `${match.similarity}%` }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground w-8">{match.similarity}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* AI Response - appears in complete state */}
              {askStep === 'complete' && testResult && (
                <div className="mt-4 p-4 bg-background/50 rounded-lg border border-border/50 animate-in fade-in slide-in-from-bottom-2">
                  <div className="text-xs font-medium text-muted-foreground mb-2">{t('knowledge.aiResponse')}</div>
                  <div className="text-sm text-foreground">{testResult.response}</div>
                </div>
              )}

              {/* No matches message */}
              {askStep === 'complete' && searchMatches.length === 0 && (
                <div className="text-sm text-muted-foreground pt-3 border-t border-border/50">
                  {t('knowledge.noMatches')}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Form */}
      {(isAddingNew || editingEntry) && (
            <Card>
              <CardHeader>
                <CardTitle>{editingEntry ? t('knowledge.editEntry') : t('knowledge.addNewEntry')}</CardTitle>
                <CardDescription>
                  {editingEntry
                    ? t('knowledge.updateEntry')
                    : t('knowledge.addNewEntryDesc')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">{t('knowledge.category')}</label>
                    <select
                      value={formData.category}
                      onChange={(e) =>
                        setFormData({ ...formData, category: e.target.value })
                      }
                      className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">{t('knowledge.priority')} (0-10)</label>
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      value={formData.priority}
                      onChange={(e) =>
                        setFormData({ ...formData, priority: parseInt(e.target.value, 10) || 5 })
                      }
                      className="mt-1"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">{t('knowledge.title')}</label>
                  <Input
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder={t('knowledge.entryTitle')}
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">{t('knowledge.content')}</label>
                  <Textarea
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    placeholder={t('knowledge.content')}
                    className="mt-1 min-h-[150px]"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">{t('knowledge.keywordsHint')}</label>
                  <Input
                    value={formData.keywords}
                    onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                    placeholder="wifi, internet, connection"
                    className="mt-1"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={resetForm}>
                    {t('common.cancel')}
                  </Button>
                  <Button onClick={handleSave} loading={saving}>
                    {editingEntry ? t('common.update') : t('common.add')} {t('knowledge.addEntry').split(' ')[1]}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

      {/* Entries Table */}
      <DataTable
        data={entries}
        columns={columns}
        keyExtractor={(entry) => entry.id}
        filters={
          <div className="flex items-center gap-4">
            <FilterTabs
              options={sourceOptions}
              value={filterSource}
              onChange={setFilterSource}
            />
            <Select value={filterCategory || '_all'} onValueChange={(v) => setFilterCategory(v === '_all' ? '' : v)}>
              <SelectTrigger className="w-[140px] h-8 text-sm focus:ring-0 focus:ring-offset-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map((opt) => (
                  <SelectItem key={opt.value || '_all'} value={opt.value || '_all'}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
        search={{
          value: search,
          onChange: setSearch,
          onSearch: handleSearch,
          onClear: () => setSearchQuery(''),
          placeholder: t('knowledge.searchEntries'),
        }}
        loading={loading}
        emptyState={
          <EmptyState
            icon={Book}
            title={t('knowledge.noEntries')}
            description={
              filterCategory || searchQuery
                ? t('knowledge.noEntriesFilter')
                : t('knowledge.noEntriesEmpty')
            }
          />
        }
      />

      {/* Reindex Confirmation Dialog */}
      <ConfirmDialog
        open={showReindexConfirm}
        onOpenChange={setShowReindexConfirm}
        title={t('knowledge.reindexTitle')}
        description={t('knowledge.reindexDesc')}
        confirmLabel={t('knowledge.reindex')}
        onConfirm={handleReindex}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!deleteEntryId}
        onOpenChange={(open) => !open && setDeleteEntryId(null)}
        title={t('knowledge.deleteEntry')}
        description={t('knowledge.deleteEntryDesc')}
        confirmLabel={t('common.delete')}
        variant="destructive"
        onConfirm={() => deleteEntryId && handleDelete(deleteEntryId)}
      />

      {/* Embedding Not Configured Warning */}
      <ConfirmDialog
        open={showEmbeddingWarning}
        onOpenChange={setShowEmbeddingWarning}
        title={t('knowledge.embeddingRequired')}
        description={t('knowledge.embeddingNotConfigured')}
        confirmLabel={t('knowledge.goToSettings')}
        onConfirm={() => {
          setShowEmbeddingWarning(false);
          navigate('/engine/apps/ai?provider=local');
        }}
      />

    </PageContainer>
  );
}
