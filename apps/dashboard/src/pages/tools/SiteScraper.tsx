import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageContainer, EmptyState } from '@/components';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Sparkles, Download, CheckCircle2, ArrowRight, AlertTriangle, ChevronDown, ChevronUp, Search, Check, Globe, RefreshCw, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { formatTimeAgo } from '@/lib/formatters';
import { usePermissions, PERMISSIONS } from '@/hooks/usePermissions';

interface AIExtractedEntry {
  title: string;
  content: string;
  category: string;
  keywords: string[];
  confidence: number;
}

interface DuplicatePair {
  newIndex: number;
  matchTitle: string;
  isExisting: boolean;
  similarity: number;
}

interface GeneratedQA {
  question: string;
  answer: string;
  entryIndex: number;
}

interface ProcessedEntry {
  id: string;
  category: string;
  title: string;
  content: string;
  keywords: string[];
  priority: number;
  sourceUrl: string;
  confidence: number;
  selected: boolean;
  duplicateOf?: string;
  duplicateSimilarity?: number;
  qaPairs: GeneratedQA[];
}

type Step = 'urls' | 'fetching' | 'generatingQA' | 'review' | 'importing' | 'done';

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

interface ImportedSource {
  url: string;
  entryCount: number;
  lastImportedAt: string;
}

export function SiteScraperPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canManageKnowledge = can(PERMISSIONS.KNOWLEDGE_MANAGE);
  const [urls, setUrls] = useState<string[]>(['']);
  const [step, setStep] = useState<Step>('urls');
  const [entries, setEntries] = useState<ProcessedEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'embedding' | 'general' | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [expandedQA, setExpandedQA] = useState<Set<string>>(new Set());
  const [progressLog, setProgressLog] = useState<string[]>([]);
  const [sources, setSources] = useState<ImportedSource[]>([]);

  const PROGRESS_MESSAGES: Record<string, string[]> = {
    fetching: [
      t('siteScraper.progressFetching'),
      t('siteScraper.progressParsing'),
      t('siteScraper.progressAnalyzing'),
      t('siteScraper.progressExtracting'),
      t('siteScraper.progressCategorizing'),
    ],
    generatingQA: [
      t('siteScraper.progressBuildingQA'),
      t('siteScraper.progressFormulating'),
    ],
    importing: [
      t('siteScraper.progressSaving'),
      t('siteScraper.progressEmbedding'),
    ],
  };

  useEffect(() => {
    if (step !== 'fetching' && step !== 'generatingQA' && step !== 'importing') {
      return;
    }
    setProgressLog([]);
    const messages = PROGRESS_MESSAGES[step] || [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    messages.forEach((msg, i) => {
      timers.push(setTimeout(() => {
        setProgressLog((prev) => [...prev, msg]);
      }, (i + 1) * 1500));
    });
    return () => timers.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    api.get<{ sources: ImportedSource[] }>('/tools/site-scraper/sources')
      .then((data) => setSources(data.sources))
      .catch(() => {});
  }, []);

  const addUrl = () => {
    setUrls([...urls, '']);
  };

  const removeUrl = (index: number) => {
    setUrls(urls.filter((_, i) => i !== index));
  };

  const updateUrl = (index: number, value: string) => {
    const newUrls = [...urls];
    newUrls[index] = value;
    setUrls(newUrls);
  };

  const validUrls = urls.filter((url) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  });

  const fetchAndProcess = async () => {
    setError(null);
    setErrorType(null);
    setStep('fetching');

    try {
      // Fetch, parse, and extract with AI
      const parseData = await api.post<{
        results: Array<{
          url: string;
          status: 'success' | 'error';
          title?: string;
          entries?: AIExtractedEntry[];
          error?: string;
        }>;
        entries: AIExtractedEntry[];
        duplicates: DuplicatePair[];
      }>('/tools/site-scraper/parse', {
        urls: validUrls,
      });

      const allEntries = parseData.entries || [];
      const duplicates = parseData.duplicates || [];

      if (allEntries.length === 0) {
        throw new Error(t('siteScraper.noContentFound'));
      }

      // Build a map of duplicate info per entry index
      const dupMap = new Map<number, DuplicatePair>();
      for (const dup of duplicates) {
        dupMap.set(dup.newIndex, dup);
      }

      // Generate Q&A pairs
      setStep('generatingQA');

      let qaPairs: GeneratedQA[] = [];
      try {
        const qaData = await api.post<{ qaPairs: GeneratedQA[] }>('/tools/site-scraper/generate-qa', {
          entries: allEntries,
        });
        qaPairs = qaData.qaPairs || [];
      } catch {
        // Q&A generation is non-blocking
      }

      // Build Q&A map by entry index
      const qaMap = new Map<number, GeneratedQA[]>();
      for (const qa of qaPairs) {
        const existing = qaMap.get(qa.entryIndex) || [];
        existing.push(qa);
        qaMap.set(qa.entryIndex, existing);
      }

      // Build processed entries for review
      const processedEntries: ProcessedEntry[] = allEntries.map((entry, index) => {
        const dup = dupMap.get(index);
        return {
          id: `entry-${index}`,
          category: entry.category,
          title: entry.title,
          content: entry.content,
          keywords: entry.keywords || [],
          priority: 5,
          sourceUrl: parseData.results.find((r) => r.status === 'success')?.url || validUrls[0] || '',
          confidence: entry.confidence,
          selected: true,
          duplicateOf: dup?.matchTitle,
          duplicateSimilarity: dup?.similarity,
          qaPairs: qaMap.get(index) || [],
        };
      });

      setEntries(processedEntries);
      setStep('review');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      if (message.toLowerCase().includes('embedding provider')) {
        setErrorType('embedding');
      } else {
        setErrorType('general');
      }
      setError(message);
      setStep('urls');
    }
  };

  const toggleEntry = (id: string) => {
    setEntries(entries.map((e) => (e.id === id ? { ...e, selected: !e.selected } : e)));
  };

  const toggleAll = (selected: boolean) => {
    setEntries(entries.map((e) => ({ ...e, selected })));
  };

  const deleteEntry = (id: string) => {
    setEntries(entries.filter((e) => e.id !== id));
  };

  const updateEntryCategory = (id: string, category: string) => {
    setEntries(entries.map((e) => (e.id === id ? { ...e, category } : e)));
  };

  const updateEntryTitle = (id: string, title: string) => {
    setEntries(entries.map((e) => (e.id === id ? { ...e, title } : e)));
  };

  const updateEntryContent = (id: string, content: string) => {
    setEntries(entries.map((e) => (e.id === id ? { ...e, content } : e)));
  };


  const deleteQAPair = (entryId: string, qaIndex: number) => {
    setEntries(entries.map((e) => {
      if (e.id !== entryId) return e;
      return { ...e, qaPairs: e.qaPairs.filter((_, i) => i !== qaIndex) };
    }));
  };

  const toggleQAExpanded = (id: string) => {
    setExpandedQA((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const importEntries = async () => {
    setError(null);
    setErrorType(null);
    setStep('importing');

    const selectedEntries = entries.filter((e) => e.selected);

    // Collect all Q&A pairs from selected entries
    const allQAPairs: GeneratedQA[] = [];
    selectedEntries.forEach((e, idx) => {
      for (const qa of e.qaPairs) {
        allQAPairs.push({ ...qa, entryIndex: idx });
      }
    });

    try {
      const result = await api.post<{ imported: number; skipped: number }>('/tools/site-scraper/import', {
        entries: selectedEntries.map((e) => ({
          category: e.category,
          title: e.title,
          content: e.content,
          keywords: e.keywords,
          priority: e.priority,
          sourceUrl: e.sourceUrl,
        })),
        qaPairs: allQAPairs.length > 0 ? allQAPairs : undefined,
      });

      setImportResult(result);
      setStep('done');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      if (message.toLowerCase().includes('embedding provider')) {
        setErrorType('embedding');
      } else {
        setErrorType('general');
      }
      setError(message);
      setStep('review');
    }
  };

  const reset = () => {
    setUrls(['']);
    setStep('urls');
    setEntries([]);
    setError(null);
    setErrorType(null);
    setImportResult(null);
    setExpandedQA(new Set());
  };

  const selectedCount = entries.filter((e) => e.selected).length;

  const getConfidenceBadge = (confidence: number) => {
    if (confidence > 0.8) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    if (confidence > 0.5) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
  };

  return (
    <PageContainer>
      {/* Embedding provider error */}
      {error && errorType === 'embedding' && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>{t('siteScraper.embeddingRequired')}</AlertTitle>
          <AlertDescription className="flex items-end justify-between">
            <span>{t('siteScraper.embeddingRequiredDesc')}</span>
            <Link to="/engine/apps/ai?provider=local" className="flex items-center gap-1 font-medium hover:underline ms-4 whitespace-nowrap">
              {t('siteScraper.configure')} <ArrowRight className="h-3 w-3 rtl:rotate-180" />
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* General error */}
      {error && errorType === 'general' && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Step 1: Enter URLs */}
      {step === 'urls' && (
        <div className="space-y-6">
          {!canManageKnowledge ? (
            <Card>
              <CardContent className="py-12">
                <EmptyState
                  icon={Lock}
                  title={t('siteScraper.noPermission')}
                  description={t('siteScraper.noPermissionDesc')}
                />
              </CardContent>
            </Card>
          ) : (
          <Card>
            <CardHeader>
              <CardTitle>{t('siteScraper.enterUrls')}</CardTitle>
              <CardDescription>
                {t('siteScraper.enterUrlsDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {urls.map((url, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      placeholder={t('siteScraper.urlPlaceholder')}
                      value={url}
                      onChange={(e) => updateUrl(index, e.target.value)}
                    />
                    {urls.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => removeUrl(index)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              <Button variant="outline" size="sm" onClick={addUrl}>
                <Plus className="w-4 h-4 me-2" />
                {t('siteScraper.addAnotherUrl')}
              </Button>

              <div className="flex justify-end pt-4 border-t">
                <Button  onClick={fetchAndProcess} disabled={validUrls.length === 0}>
                  <Sparkles className="w-4 h-4 me-2" />
                  {t('siteScraper.fetchAndProcess')}
                </Button>
              </div>
            </CardContent>
          </Card>
          )}

          {/* Previously Imported */}
          {canManageKnowledge && sources.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('siteScraper.previouslyImported')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {sources.map((source) => (
                    <div key={source.url} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                      <button
                        onClick={() => navigate(`/tools/knowledge-base?source=scraped&sourceUrl=${encodeURIComponent(source.url)}`)}
                        className="flex items-center gap-2 text-sm text-foreground hover:text-primary truncate max-w-[60%] text-left"
                        title={source.url}
                      >
                        <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">{source.url.replace(/^https?:\/\//, '')}</span>
                      </button>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">
                          {source.entryCount} {source.entryCount === 1 ? t('siteScraper.entry') : t('siteScraper.entries')}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatTimeAgo(source.lastImportedAt, t)}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title={t('siteScraper.reScrape')}
                          onClick={() => {
                            setUrls([source.url]);
                          }}
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Review / Processing / Done */}
      {(step === 'fetching' || step === 'generatingQA' || step === 'review' || step === 'importing' || step === 'done') && (
        <div className="space-y-6">
          <Card className="min-h-[400px]">
            {/* Progress Stepper */}
            <div className="px-6 pt-6 pb-2">
              <div className="flex items-center justify-between">
                {/* Step 1: Extract */}
                <div className="flex items-center gap-2">
                  <div className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all',
                    step === 'fetching' && 'bg-primary text-primary-foreground animate-pulse',
                    step !== 'fetching' && 'bg-primary text-primary-foreground'
                  )}>
                    {step === 'fetching' ? (
                      <Search className="w-3.5 h-3.5 animate-pulse" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <span className={cn(
                    'text-sm',
                    step === 'fetching' ? 'text-foreground font-medium' : 'text-muted-foreground'
                  )}>
                    {t('siteScraper.stepExtract')}
                  </span>
                </div>

                {/* Connector */}
                <div className="flex-1 h-0.5 mx-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
                    style={{ width: step !== 'fetching' ? '100%' : '0%' }}
                  />
                </div>

                {/* Step 2: Generate Q&A */}
                <div className="flex items-center gap-2">
                  <div className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all',
                    step === 'fetching' && 'bg-muted text-muted-foreground',
                    step === 'generatingQA' && 'bg-primary text-primary-foreground animate-pulse',
                    (step === 'review' || step === 'importing' || step === 'done') && 'bg-primary text-primary-foreground'
                  )}>
                    {step === 'generatingQA' ? (
                      <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                    ) : (step === 'review' || step === 'importing' || step === 'done') ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <span>2</span>
                    )}
                  </div>
                  <span className={cn(
                    'text-sm',
                    step === 'generatingQA' ? 'text-foreground font-medium' : 'text-muted-foreground'
                  )}>
                    {t('siteScraper.stepGenerateQA')}
                  </span>
                </div>

                {/* Connector */}
                <div className="flex-1 h-0.5 mx-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
                    style={{ width: (step === 'importing' || step === 'done') ? '100%' : '0%' }}
                  />
                </div>

                {/* Step 3: Import */}
                <div className="flex items-center gap-2">
                  <div className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all',
                    step === 'importing' && 'bg-primary text-primary-foreground animate-pulse',
                    step === 'done' && 'bg-primary text-primary-foreground',
                    (step === 'fetching' || step === 'generatingQA' || step === 'review') && 'bg-muted text-muted-foreground'
                  )}>
                    {step === 'importing' ? (
                      <Download className="w-3.5 h-3.5 animate-pulse" />
                    ) : step === 'done' ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <span>3</span>
                    )}
                  </div>
                  <span className={cn(
                    'text-sm',
                    step === 'importing' ? 'text-foreground font-medium' : 'text-muted-foreground'
                  )}>
                    {t('siteScraper.stepImport')}
                  </span>
                </div>
              </div>
            </div>

            {/* Progress log during processing */}
            {(step === 'fetching' || step === 'generatingQA' || step === 'importing') && (
              <div className="px-6 pb-6 pt-4">
                <div className="space-y-1.5">
                  {progressLog.map((msg, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-sm text-muted-foreground py-1"
                      style={{
                        opacity: 0,
                        transform: 'translateY(-8px)',
                        animation: `fadeSlideIn 0.3s ease-out ${i * 150}ms forwards`,
                      }}
                    >
                      <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span>{msg}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Done content */}
            {step === 'done' && importResult && (
              <CardContent className="py-8 text-center">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-500" />
                <p className="text-lg font-medium">{t('siteScraper.importComplete')}</p>
                <p className="text-sm text-muted-foreground mt-2">
                  {t('siteScraper.importedEntries', { count: importResult.imported })}
                  {importResult.skipped > 0 && ` ${t('siteScraper.duplicatesSkipped', { count: importResult.skipped })}`}
                </p>
                <div className="mt-6 flex gap-3 justify-center">
                  <Button variant="outline" onClick={reset}>
                    {t('siteScraper.importMore')}
                  </Button>
                  <Button onClick={() => window.location.href = '/tools/knowledge-base'}>
                    {t('siteScraper.viewKnowledgeBase')}
                  </Button>
                </div>
              </CardContent>
            )}

            {/* Review header + content — only when review step */}
            {step === 'review' && (<>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{t('siteScraper.reviewEntries')}</CardTitle>
                  <CardDescription>
                    {t('siteScraper.entriesFound', { count: entries.length })}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => toggleAll(true)}>
                    {t('siteScraper.selectAll')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => toggleAll(false)}>
                    {t('siteScraper.deselectAll')}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>{t('knowledge.title')}</TableHead>
                    <TableHead>{t('knowledge.content')}</TableHead>
                    <TableHead>{t('siteScraper.confidence')}</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <>
                      <TableRow key={entry.id} className={entry.selected ? '' : 'opacity-50'}>
                        <TableCell className="align-top pt-4">
                          <Checkbox
                            checked={entry.selected}
                            onCheckedChange={() => toggleEntry(entry.id)}
                          />
                        </TableCell>
                        <TableCell className="align-top pt-4">
                          <div className="space-y-2 min-w-[200px]">
                            <Input
                              value={entry.title}
                              onChange={(e) => updateEntryTitle(entry.id, e.target.value)}
                              className="text-sm font-medium"
                            />
                            <Select
                              value={entry.category}
                              onValueChange={(value) => updateEntryCategory(entry.id, value)}
                            >
                              <SelectTrigger className="text-xs h-8 w-[130px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CATEGORIES.map((cat) => (
                                  <SelectItem key={cat} value={cat}>
                                    {t(`siteScraper.categories.${cat === 'room_type' ? 'roomType' : cat === 'local_info' ? 'localInfo' : cat}`)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-2">
                            <Textarea
                              value={entry.content}
                              onChange={(e) => updateEntryContent(entry.id, e.target.value)}
                              className="text-sm min-w-[300px] min-h-[80px] max-h-[200px]"
                            />

                            {/* Duplicate warning */}
                            {entry.duplicateOf && (
                              <div className="flex items-center gap-2 text-sm">
                                <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />
                                <span className="text-yellow-700 dark:text-yellow-400">
                                  {t('siteScraper.duplicateWarning')}: {t('siteScraper.similarTo')} &ldquo;{entry.duplicateOf}&rdquo; ({Math.round((entry.duplicateSimilarity || 0) * 100)}%)
                                </span>
                              </div>
                            )}

                            {/* Q&A pairs */}
                            {entry.qaPairs.length > 0 && (
                              <div className="rounded-lg border bg-muted/30 p-3">
                                <button
                                  onClick={() => toggleQAExpanded(entry.id)}
                                  className="flex items-center gap-1.5 text-sm font-medium hover:text-foreground w-full"
                                >
                                  {expandedQA.has(entry.id) ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                  {t('siteScraper.qaPairs')} ({entry.qaPairs.length} {t('siteScraper.questions')})
                                </button>
                                {expandedQA.has(entry.id) && (
                                  <div className="mt-3 space-y-2">
                                    {entry.qaPairs.map((qa, qi) => (
                                      <div key={qi} className="flex items-start gap-2 text-sm py-2 [&:not(:last-child)]:border-b">
                                        <div className="flex-1 space-y-1">
                                          <p className="font-medium">Q: {qa.question}</p>
                                          <p className="text-muted-foreground">A: {qa.answer}</p>
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="shrink-0 h-6 w-6"
                                          onClick={() => deleteQAPair(entry.id, qi)}
                                          title={t('siteScraper.deleteQuestion')}
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </Button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="align-top pt-4">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${getConfidenceBadge(entry.confidence)}`}>
                            {Math.round(entry.confidence * 100)}%
                          </span>
                        </TableCell>
                        <TableCell className="align-top pt-4">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteEntry(entry.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    </>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
            </>)}
          </Card>

          {step === 'review' && (
            <div className="flex justify-between">
              <Button variant="outline" onClick={reset}>
                {t('siteScraper.startOver')}
              </Button>
              <Button  onClick={importEntries} disabled={selectedCount === 0}>
                <Download className="w-4 h-4 me-2" />
                {t('siteScraper.importEntries', { count: selectedCount })}
              </Button>
            </div>
          )}
        </div>
      )}
    </PageContainer>
  );
}
