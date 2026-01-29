import { useState, useEffect } from 'react';
import { PageContainer } from '@/components';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Plus,
  Trash2,
  Pencil,
  Search,
  X,
  Loader2,
  AlertCircle,
  Book,
} from 'lucide-react';
import { api } from '@/lib/api';

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
  faq: 'bg-blue-100 text-blue-800',
  policy: 'bg-purple-100 text-purple-800',
  amenity: 'bg-green-100 text-green-800',
  service: 'bg-orange-100 text-orange-800',
  dining: 'bg-red-100 text-red-800',
  room_type: 'bg-indigo-100 text-indigo-800',
  local_info: 'bg-cyan-100 text-cyan-800',
  contact: 'bg-yellow-100 text-yellow-800',
  other: 'bg-gray-100 text-gray-800',
};

export function KnowledgeBasePage() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
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
      if (search) params.set('search', search);

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
    fetchEntries();
    fetchCategories();
  }, [filterCategory]);

  const handleSearch = () => {
    fetchEntries();
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

  const startAdd = () => {
    resetForm();
    setIsAddingNew(true);
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

  const totalCount = categories.reduce((sum, c) => sum + c.count, 0);

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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar - Categories */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Categories</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="space-y-1">
                <li>
                  <button
                    onClick={() => setFilterCategory('')}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      filterCategory === ''
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <span className="flex justify-between">
                      <span>All</span>
                      <span className="text-xs opacity-70">{totalCount}</span>
                    </span>
                  </button>
                </li>
                {categories.map((cat) => (
                  <li key={cat.id}>
                    <button
                      onClick={() => setFilterCategory(cat.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        filterCategory === cat.id
                          ? 'bg-gray-900 text-white'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <span className="flex justify-between">
                        <span>{cat.label}</span>
                        <span className="text-xs opacity-70">{cat.count}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Main content */}
        <div className="lg:col-span-3 space-y-6">
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
                  <Button onClick={handleSave} disabled={saving}>
                    {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {editingEntry ? 'Update' : 'Add'} Entry
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Search and Actions */}
          <div className="flex gap-4">
            <div className="flex-1 flex gap-2">
              <Input
                placeholder="Search entries..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <Button variant="outline" onClick={handleSearch}>
                <Search className="w-4 h-4" />
              </Button>
            </div>
            {!isAddingNew && !editingEntry && (
              <Button onClick={startAdd}>
                <Plus className="w-4 h-4 mr-2" />
                Add Entry
              </Button>
            )}
          </div>

          {/* Entries Table */}
          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <div className="py-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-gray-400" />
                  <p className="text-sm text-gray-500">Loading entries...</p>
                </div>
              ) : entries.length === 0 ? (
                <div className="py-12 text-center">
                  <Book className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p className="text-gray-500">No entries found</p>
                  <p className="text-sm text-gray-400 mt-1">
                    {filterCategory || search
                      ? 'Try changing your filters'
                      : 'Add your first entry or use the Site Scraper to import content'}
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Content</TableHead>
                      <TableHead className="w-24">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <span
                            className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                              categoryColors[entry.category] || categoryColors.other
                            }`}
                          >
                            {entry.category.replace(/_/g, ' ')}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium max-w-[200px]">
                          <div className="truncate" title={entry.title}>
                            {entry.title}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div
                            className="max-h-20 overflow-y-auto text-sm text-gray-600 whitespace-pre-wrap"
                            title={entry.content}
                          >
                            {entry.content.length > 200
                              ? `${entry.content.substring(0, 200)}...`
                              : entry.content}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => startEdit(entry)}
                              title="Edit"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(entry.id)}
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
