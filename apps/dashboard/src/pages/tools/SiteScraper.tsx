import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageContainer } from '@/components';
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
import { Spinner } from '@/components/ui/spinner';
import { Plus, Trash2, Sparkles, Download, CheckCircle2, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';

interface ParseResult {
  url: string;
  title: string;
  status: 'success' | 'error';
  error?: string;
  sectionCount?: number;
  sections?: Array<{
    heading?: string;
    content?: string;
    type?: string;
    question?: string;
  }>;
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
}

type Step = 'urls' | 'fetching' | 'processing' | 'review' | 'importing' | 'done';

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

export function SiteScraperPage() {
  const { t } = useTranslation();
  const [urls, setUrls] = useState<string[]>(['']);
  const [step, setStep] = useState<Step>('urls');
  const [entries, setEntries] = useState<ProcessedEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'embedding' | 'general' | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);

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
      // Fetch and parse URLs
      const fetchData = await api.post<{ results: ParseResult[] }>('/tools/site-scraper/parse', {
        urls: validUrls,
      });

      // Now process with AI
      setStep('processing');

      // Collect all sections from successful fetches
      const allSections = fetchData.results
        .filter((r) => r.status === 'success' && r.sections)
        .flatMap((r) =>
          (r.sections || []).map((s) => ({ ...s, sourceUrl: r.url }))
        );

      if (allSections.length === 0) {
        throw new Error('No content found on the provided URLs');
      }

      // Process sections into entries
      const processedEntries = allSections.map((section, index) => ({
        id: `entry-${index}`,
        category: guessCategory(section),
        title: section.heading || section.question || `Entry ${index + 1}`,
        content: section.content || '',
        keywords: [],
        priority: 5,
        sourceUrl: section.sourceUrl || validUrls[0] || '',
        confidence: 0.7,
        selected: true,
      }));

      setEntries(processedEntries);
      setStep('review');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      // Check if it's an embedding provider error
      if (message.toLowerCase().includes('embedding provider')) {
        setErrorType('embedding');
      } else {
        setErrorType('general');
      }
      setError(message);
      setStep('urls');
    }
  };

  const guessCategory = (section: { type?: string; heading?: string; content?: string }): string => {
    if (section.type === 'faq') return 'faq';
    const text = ((section.heading || '') + ' ' + (section.content || '')).toLowerCase();
    if (text.includes('check-in') || text.includes('check-out') || text.includes('policy')) return 'policy';
    if (text.includes('pool') || text.includes('gym') || text.includes('spa') || text.includes('wifi')) return 'amenity';
    if (text.includes('restaurant') || text.includes('breakfast') || text.includes('dining')) return 'dining';
    if (text.includes('room') || text.includes('suite')) return 'room_type';
    if (text.includes('service') || text.includes('concierge')) return 'service';
    return 'other';
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

  const importEntries = async () => {
    setError(null);
    setErrorType(null);
    setStep('importing');

    const selectedEntries = entries.filter((e) => e.selected);

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
  };

  const selectedCount = entries.filter((e) => e.selected).length;

  return (
    <PageContainer>
      {/* Embedding provider error */}
      {error && errorType === 'embedding' && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>{t('siteScraper.embeddingRequired')}</AlertTitle>
          <AlertDescription className="flex items-end justify-between">
            <span>{t('siteScraper.embeddingRequiredDesc')}</span>
            <Link to="/settings/extensions/ai?provider=local" className="flex items-center gap-1 font-medium hover:underline ms-4 whitespace-nowrap">
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

      {/* Step 2: Fetching */}
      {step === 'fetching' && (
        <Card>
          <CardContent className="py-12 text-center">
            <Spinner size="lg" className="mx-auto mb-4 text-primary" />
            <p className="text-lg font-medium">{t('siteScraper.fetchingContent')}</p>
            <p className="text-sm text-muted-foreground">
              {validUrls.length > 1
                ? t('siteScraper.scrapingUrlsPlural', { count: validUrls.length })
                : t('siteScraper.scrapingUrls', { count: validUrls.length })}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Processing */}
      {step === 'processing' && (
        <Card>
          <CardContent className="py-12 text-center">
            <Spinner size="lg" className="mx-auto mb-4 text-primary" />
            <p className="text-lg font-medium">{t('siteScraper.processingWithAi')}</p>
            <p className="text-sm text-muted-foreground">{t('siteScraper.categorizingContent')}</p>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Review */}
      {step === 'review' && (
        <div className="space-y-6">
          <Card>
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
                    <TableHead>Category</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Content</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id} className={entry.selected ? '' : 'opacity-50'}>
                      <TableCell>
                        <Checkbox
                          checked={entry.selected}
                          onCheckedChange={() => toggleEntry(entry.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <select
                          value={entry.category}
                          onChange={(e) => updateEntryCategory(entry.id, e.target.value)}
                          className="text-xs border rounded px-2 py-1"
                        >
                          {CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat.replace(/_/g, ' ')}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={entry.title}
                          onChange={(e) => updateEntryTitle(entry.id, e.target.value)}
                          className="text-sm font-medium min-w-[180px]"
                        />
                      </TableCell>
                      <TableCell>
                        <Textarea
                          value={entry.content}
                          onChange={(e) => updateEntryContent(entry.id, e.target.value)}
                          className="text-sm min-w-[300px] min-h-[80px] max-h-[200px]"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteEntry(entry.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={reset}>
              {t('siteScraper.startOver')}
            </Button>
            <Button  onClick={importEntries} disabled={selectedCount === 0}>
              <Download className="w-4 h-4 me-2" />
              {t('siteScraper.importEntries', { count: selectedCount })}
            </Button>
          </div>
        </div>
      )}

      {/* Step 5: Importing */}
      {step === 'importing' && (
        <Card>
          <CardContent className="py-12 text-center">
            <Spinner size="lg" className="mx-auto mb-4 text-primary" />
            <p className="text-lg font-medium">{t('siteScraper.importingEntries')}</p>
            <p className="text-sm text-muted-foreground">
              {t('siteScraper.savingToKnowledge')}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Step 6: Done */}
      {step === 'done' && importResult && (
        <Card>
          <CardContent className="py-12 text-center">
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
              <Button  onClick={() => window.location.href = '/tools/knowledge-base'}>
                {t('siteScraper.viewKnowledgeBase')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
