import { useState, useEffect } from 'react';
import { PageContainer, DataTable, EmptyState } from '@/components';
import { usePageActions } from '@/contexts/PageActionsContext';
import type { Column } from '@/components/DataTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus,
  X,
  Loader2,
  AlertCircle,
  Book,
  MoreHorizontal,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

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

const categoryColors: Record<string, string> = {
  faq: '!bg-gray-100 !text-gray-600',
  policy: '!bg-gray-100 !text-gray-600',
  amenity: '!bg-gray-100 !text-gray-600',
  service: '!bg-gray-100 !text-gray-600',
  dining: '!bg-gray-100 !text-gray-600',
  room_type: '!bg-gray-100 !text-gray-600',
  local_info: '!bg-gray-100 !text-gray-600',
  contact: '!bg-gray-100 !text-gray-600',
  other: '!bg-gray-100 !text-gray-600',
};

export function KnowledgeBasePage() {
  const { setActions } = usePageActions();
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
        <Button size="xs" className="bg-gray-900 hover:bg-gray-800" onClick={startAdd}>
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Add Entry
        </Button>
      ) : null
    );
    return () => setActions(null);
  }, [setActions, isAddingNew, editingEntry]);

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
      setError('Title and content are required');
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
    if (!confirm('Are you sure you want to delete this entry?')) return;

    try {
      await api.delete(`/knowledge/${id}`);
      fetchEntries();
      fetchCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete entry');
    }
  };

  const columns: Column<KnowledgeEntry>[] = [
    {
      key: 'category',
      header: 'Category',
      render: (entry) => (
        <Badge className={categoryColors[entry.category] || categoryColors.other}>
          {entry.category.replace(/_/g, ' ')}
        </Badge>
      ),
    },
    {
      key: 'title',
      header: 'Title',
      render: (entry) => (
        <div className="font-medium truncate max-w-[200px]" title={entry.title}>
          {entry.title}
        </div>
      ),
    },
    {
      key: 'content',
      header: 'Content',
      render: (entry) => (
        <div className="text-sm text-gray-600 truncate max-w-[300px]" title={entry.content}>
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
            <button className="p-1.5 rounded hover:bg-gray-100 text-gray-500">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => startEdit(entry)}>
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDelete(entry.id)}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const filters = (
    <div className="flex gap-1 flex-nowrap">
      <button
        onClick={() => setFilterCategory('')}
        className={cn(
          'px-3 py-1 text-sm rounded whitespace-nowrap',
          filterCategory === ''
            ? 'bg-gray-900 text-white'
            : 'text-gray-600 hover:bg-gray-100'
        )}
      >
        All
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => setFilterCategory(cat.id)}
          className={cn(
            'px-3 py-1 text-sm rounded whitespace-nowrap',
            filterCategory === cat.id
              ? 'bg-gray-900 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          )}
        >
          {cat.label}
        </button>
      ))}
    </div>
  );

  return (
    <PageContainer>
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <span className="text-sm text-red-700">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4 text-red-500" />
          </button>
        </div>
      )}

      {/* Add/Edit Form */}
      {(isAddingNew || editingEntry) && (
            <Card>
              <CardHeader>
                <CardTitle>{editingEntry ? 'Edit Entry' : 'Add New Entry'}</CardTitle>
                <CardDescription>
                  {editingEntry
                    ? 'Update the knowledge base entry'
                    : 'Add a new entry to the knowledge base'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Category</label>
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
                    <label className="text-sm font-medium">Priority (0-10)</label>
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
                  <label className="text-sm font-medium">Title</label>
                  <Input
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Entry title"
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Content</label>
                  <Textarea
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    placeholder="Entry content..."
                    className="mt-1 min-h-[150px]"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Keywords (comma-separated)</label>
                  <Input
                    value={formData.keywords}
                    onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                    placeholder="wifi, internet, connection"
                    className="mt-1"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                  <Button className="bg-gray-900 hover:bg-gray-800" onClick={handleSave} disabled={saving}>
                    {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {editingEntry ? 'Update' : 'Add'} Entry
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
        filters={filters}
        search={{
          value: search,
          onChange: setSearch,
          onSearch: handleSearch,
          onClear: () => setSearchQuery(''),
          placeholder: 'Search entries...',
        }}
        loading={loading}
        emptyState={
          <EmptyState
            icon={Book}
            title="No entries found"
            description={
              filterCategory || searchQuery
                ? 'Try changing your filters'
                : 'Add your first entry or use the Site Scraper to import content'
            }
          />
        }
      />
    </PageContainer>
  );
}
