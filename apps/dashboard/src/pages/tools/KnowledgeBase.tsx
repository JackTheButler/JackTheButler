import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
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
  const { providers } = useSystemStatus();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [editingEntry, setEditingEntry] = useState<KnowledgeEntry | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [saving, setSaving] = useState(false);

  // Test knowledge base state
  const [testQuery, setTestQuery] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

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
    setActions(
      !isAddingNew && !editingEntry ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => providers?.embedding ? setShowReindexConfirm(true) : setShowEmbeddingWarning(true)}
            disabled={reindexing}
          >
            <RefreshCw className={cn('w-4 h-4 mr-1.5', reindexing && 'animate-spin')} />
            {t('knowledge.reindex')}
          </Button>
          <Button size="sm" onClick={startAdd}>
            <Plus className="w-4 h-4 mr-1.5" />
            {t('knowledge.addEntry')}
          </Button>
        </div>
      ) : null
    );
    return () => setActions(null);
  }, [setActions, isAddingNew, editingEntry, reindexing, t]);

  useEffect(() => {
    fetchEntries();
    fetchCategories();
  }, [filterCategory, searchQuery]);

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
      await api.delete(`/knowledge/${id}`);
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

    try {
      const result = await api.post<TestResult>('/knowledge/ask', { query: testQuery });
      setTestResult(result);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Failed to test knowledge base');
      setTestResult(null);
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
        <div className="font-medium truncate max-w-[200px]" title={entry.title}>
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
    { value: '', label: t('common.all') },
    ...categories.map((cat) => ({ value: cat.id, label: cat.label })),
  ];

  return (
    <PageContainer>
      {/* Embedding provider warnings */}
      {!providers?.embedding && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>{t('knowledge.embeddingRequired')}</AlertTitle>
          <AlertDescription className="flex items-end justify-between">
            <span>{t('knowledge.embeddingRequiredDesc')}</span>
            <Link to="/settings/extensions/ai?provider=local" className="flex items-center gap-1 font-medium hover:underline ml-4 whitespace-nowrap">
              {t('common.configure')} <ArrowRight className="h-3 w-3" />
            </Link>
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
              <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !testLoading && handleTest()}
                placeholder={t('knowledge.askQuestion')}
                className="pl-10"
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
                  <Send className="w-4 h-4 mr-1.5" />
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

          {testResult && (
            <div className="mt-4 space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="text-xs font-medium text-muted-foreground mb-2">{t('knowledge.aiResponse')}</div>
                <div className="text-sm text-foreground">{testResult.response}</div>
              </div>

              {testResult.matches.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">
                    {t('knowledge.matchedEntries')} ({testResult.matches.length})
                  </div>
                  <div className="space-y-2">
                    {testResult.matches.map((match) => (
                      <div
                        key={match.id}
                        className="flex items-center justify-between p-2 bg-card border rounded-lg text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <Badge>
                            {match.category.replace(/_/g, ' ')}
                          </Badge>
                          <span className="font-medium">{match.title}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{match.similarity}% {t('knowledge.match')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {testResult.matches.length === 0 && (
                <div className="text-sm text-muted-foreground">
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
          <FilterTabs
            options={categoryOptions}
            value={filterCategory}
            onChange={setFilterCategory}
          />
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
          navigate('/settings/extensions/ai?provider=local');
        }}
      />

    </PageContainer>
  );
}
