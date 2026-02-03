# Dashboard Guidelines

> UI patterns and component usage for the Butler dashboard.

## Component Library

The dashboard uses a combination of:
- **shadcn/ui** - Base components (`components/ui/`)
- **Custom components** - Built on top of shadcn (`components/`)

### UI Components (`components/ui/`)

| Component | Purpose |
|-----------|---------|
| `Alert` | Page-level notifications with title, description, dismiss |
| `InlineAlert` | Compact card-level errors/warnings |
| `Badge` | Status indicators, labels, counts |
| `Button` | Actions - use `variant` and `size` props |
| `Card` | Content containers with header, content, footer |
| `Checkbox` | Form checkboxes |
| `ConfirmDialog` | Confirmation modals for destructive actions |
| `DropdownMenu` | Action menus, context menus |
| `ErrorAlert` | Error display with optional title and dismiss |
| `FilterTabs` | Tab-style filter buttons for tables |
| `Input` | Text inputs |
| `SectionCard` | Card with icon + title header pattern |
| `Skeleton` | Animated loading placeholder |
| `Spinner` | Loading spinner with size variants (xs, sm, md, lg) |
| `Table` | Data tables (for custom layouts) |
| `Tabs` | Tab navigation with icon support |
| `Textarea` | Multi-line text inputs |
| `Tooltip` | Hover tooltips (portal-based, works with overflow) |

### Shared Components (`components/`)

| Component | Purpose |
|-----------|---------|
| `PageContainer` | Page wrapper with consistent padding |
| `DataTable` | Full-featured table with search, filters, pagination |
| `EmptyState` | Empty/no-data states with icon and message |
| `StatsBar` | Row of stat cards at top of pages |
| `SearchInput` | Search input with icon |

---

## Alert Patterns

### Page-Level Alerts (`Alert`)

Use for errors, warnings, success messages at the top of a page.

```tsx
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// Error with dismiss
{error && (
  <Alert variant="destructive" className="mb-6" onDismiss={() => setError(null)}>
    <AlertDescription>{error}</AlertDescription>
  </Alert>
)}

// Error with title and action
<Alert variant="destructive" className="mb-6">
  <AlertTitle>Configuration Required</AlertTitle>
  <AlertDescription className="flex items-end justify-between">
    <span>Description text here.</span>
    <Link to="/settings" className="flex items-center gap-1 font-medium hover:underline ml-4 whitespace-nowrap">
      Configure <ArrowRight className="h-3 w-3" />
    </Link>
  </AlertDescription>
</Alert>

// Success message
<Alert variant="success" className="mb-6" onDismiss={() => setMessage(null)}>
  <AlertDescription>{message}</AlertDescription>
</Alert>
```

**Variants:** `default`, `info`, `success`, `warning`, `destructive`

### Card-Level Alerts (`InlineAlert`)

Use for compact errors/warnings inside cards.

```tsx
import { InlineAlert } from '@/components/ui/inline-alert';

{item.lastError && (
  <InlineAlert variant="error" className="mt-3">
    {item.lastError}
  </InlineAlert>
)}
```

**Variants:** `default`, `info`, `success`, `warning`, `error`

---

## Filter Tabs

Use for filtering table data with toggle-style buttons.

```tsx
import { FilterTabs } from '@/components/ui/filter-tabs';

// Define options (usually at module level)
const statusFilters = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
];

// In component
const [status, setStatus] = useState('all');

<DataTable
  filters={
    <FilterTabs
      options={statusFilters}
      value={status}
      onChange={setStatus}
    />
  }
  // ...
/>
```

For dynamic options (e.g., categories from API):
```tsx
const categoryOptions = [
  { value: '', label: 'All' },
  ...categories.map((cat) => ({ value: cat.id, label: cat.label })),
];
```

---

## Button Patterns

```tsx
import { Button } from '@/components/ui/button';

// Primary action (uses --primary CSS variable, true black)
<Button>
  <Plus className="w-4 h-4 mr-1.5" />
  Add Item
</Button>

// Secondary action
<Button variant="outline">Cancel</Button>

// Destructive action
<Button variant="destructive">Delete</Button>

// Small button (for headers)
<Button size="xs" variant="outline">
  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
  Refresh
</Button>

// Header/navbar action button (standard)
<Button size="sm">
  <Plus className="w-4 h-4 mr-1.5" />
  Add New
</Button>

// Compact button for tight spaces (table rows, inline)
<Button size="xs">
  <Plus className="w-3.5 h-3.5 mr-1.5" />
  Add
</Button>

// Loading state (use Spinner component)
<Button disabled={loading}>
  {loading ? <Spinner size="sm" className="mr-2" /> : <Save className="w-4 h-4 mr-2" />}
  Save
</Button>
```

**Important:** Never hardcode button colors like `bg-gray-900`. Always use the Button component's default variant which uses the `--primary` CSS variable from `index.css`.

**Button Sizes:**
| Size | Height | Use For |
|------|--------|---------|
| `sm` | 36px | Header/navbar actions, card actions |
| `default` | 40px | Form submit buttons, modals |
| `xs` | 28px | Table row actions, tight inline spaces |
| `lg` | 44px | Large CTAs, landing pages |

---

## Page Structure

### Standard Page Layout

```tsx
import { PageContainer, StatsBar, DataTable, EmptyState } from '@/components';
import { usePageActions } from '@/contexts/PageActionsContext';

export function MyPage() {
  const { setActions } = usePageActions();

  // Set header actions
  useEffect(() => {
    setActions(
      <Button size="sm">
        <Plus className="w-4 h-4 mr-1.5" />
        Add New
      </Button>
    );
    return () => setActions(null);
  }, [setActions]);

  return (
    <PageContainer>
      {/* Page-level alerts */}
      {error && (
        <Alert variant="destructive" className="mb-6" onDismiss={() => setError(null)}>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Stats bar (optional) */}
      <StatsBar items={[...]} />

      {/* Main content */}
      <DataTable
        data={items}
        columns={columns}
        loading={loading}
        emptyState={<EmptyState icon={Box} title="No items" description="..." />}
      />
    </PageContainer>
  );
}
```

### Card-Based Page

```tsx
<PageContainer>
  <Card>
    <CardHeader>
      <CardTitle>Section Title</CardTitle>
      <CardDescription>Optional description</CardDescription>
    </CardHeader>
    <CardContent>
      {/* Content */}
    </CardContent>
  </Card>
</PageContainer>
```

---

## Form Patterns

### Standard Form

```tsx
<Card>
  <CardHeader>
    <CardTitle>{editing ? 'Edit' : 'Add'} Item</CardTitle>
  </CardHeader>
  <CardContent className="space-y-4">
    <div>
      <label className="text-sm font-medium">Field Label</label>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Placeholder text"
        className="mt-1"
      />
    </div>

    <div className="flex justify-end gap-2 pt-4 border-t">
      <Button variant="outline" onClick={onCancel}>Cancel</Button>
      <Button onClick={onSave} disabled={saving}>
        {saving ? <Spinner size="sm" className="mr-2" /> : <Save className="w-4 h-4 mr-2" />}
        Save
      </Button>
    </div>
  </CardContent>
</Card>
```

---

## Table Patterns

### Using DataTable

```tsx
import { DataTable, EmptyState } from '@/components';
import type { Column } from '@/components/DataTable';

const columns: Column<Item>[] = [
  {
    key: 'name',
    header: 'Name',
    render: (item) => <span className="font-medium">{item.name}</span>,
  },
  {
    key: 'status',
    header: 'Status',
    render: (item) => <Badge>{item.status}</Badge>,
  },
  {
    key: 'actions',
    header: '',
    className: 'w-16',
    render: (item) => (
      <DropdownMenu>
        <DropdownMenuTrigger>
          <button className="p-1.5 rounded hover:bg-gray-100">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => onEdit(item)}>Edit</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onDelete(item)}>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

<DataTable
  data={items}
  columns={columns}
  keyExtractor={(item) => item.id}
  loading={loading}
  emptyState={<EmptyState icon={Box} title="No items" />}
/>
```

---

## Confirmation Dialogs

```tsx
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

<ConfirmDialog
  open={showConfirm}
  onOpenChange={setShowConfirm}
  title="Delete Item"
  description="Are you sure? This action cannot be undone."
  confirmLabel="Delete"
  variant="destructive"
  onConfirm={handleDelete}
/>
```

---

## Loading States

### Skeleton Loading (Lists/Tables)

Use skeleton placeholders for list and table pages - they show the expected layout structure.

```tsx
// DataTable has built-in skeleton loading
<DataTable
  data={items}
  columns={columns}
  loading={isLoading}  // Automatically shows skeleton rows
  skeletonRows={5}     // Optional: default is 5
/>

// Custom list skeletons
import { ConversationListSkeleton, AutomationCardSkeleton } from '@/components/skeletons';

{isLoading ? <ConversationListSkeleton count={6} /> : <ConversationList ... />}
{isLoading ? <AutomationCardSkeleton count={3} /> : <div>...</div>}
```

**Available Skeletons:**
| Component | Use For |
|-----------|---------|
| `Skeleton` | Base animated placeholder (`@/components/ui/skeleton`) |
| `ConversationListSkeleton` | Inbox conversation list |
| `ApprovalTableSkeleton` | Approval queue table rows |
| `AutomationCardSkeleton` | Automation rule cards |
| `ExtensionCardSkeleton` | Extension cards grid |

### Spinner Loading (Actions/Detail Pages)

Use `Spinner` for button states, detail pages, and processing indicators.

```tsx
import { Spinner } from '@/components/ui/spinner';

// Button loading (replace icon with spinner)
<Button disabled={saving}>
  {saving ? <Spinner size="sm" className="mr-2" /> : <Save className="w-4 h-4 mr-2" />}
  Save
</Button>

// Detail page loading
if (loading) {
  return (
    <PageContainer>
      <div className="py-12 text-center">
        <Spinner size="lg" className="mx-auto mb-4" />
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    </PageContainer>
  );
}

// Processing state
<Card>
  <CardContent className="py-12 text-center">
    <Spinner size="lg" className="mx-auto mb-4 text-primary" />
    <p className="text-lg font-medium">Processing...</p>
  </CardContent>
</Card>
```

**Spinner Sizes:**
| Size | Use For |
|------|---------|
| `xs` | Tiny inline spinners |
| `sm` | Button loading states |
| `md` | Card/section loading |
| `lg` | Full page loading |

---

## Color Conventions

| Usage | How to Apply |
|-------|--------------|
| Primary buttons | Use `<Button>` default variant (uses `--primary` CSS variable) |
| Secondary buttons | `<Button variant="outline">` |
| Error/destructive | `variant="destructive"` or `bg-red-50 text-red-700` |
| Success | `variant="success"` or `bg-green-50 text-green-700` |
| Warning | `variant="warning"` or `bg-yellow-50 text-yellow-700` |
| Info | `variant="info"` or `bg-blue-50 text-blue-700` |
| Muted text | `text-gray-500` or `text-muted-foreground` |

**CSS Variables (defined in `index.css`):**
- `--primary: 0 0% 0%` - True black for primary actions
- `--primary-foreground: 0 0% 100%` - White text on primary

---

## Icon Usage

Import from `lucide-react`:

```tsx
import { Plus, AlertCircle, Check, X, MoreHorizontal } from 'lucide-react';
```

Use the `iconSize` constants from `@/lib/icons` for consistent sizing:

```tsx
import { iconSize } from '@/lib/icons';

<Plus className={iconSize.sm} />  // 16px - standard button/inline
<AlertCircle className={iconSize.xl} />  // 32px - feature icons
```

| Size | Class | Pixels | Use For |
|------|-------|--------|---------|
| `xs` | `w-3 h-3` | 12px | Tiny icons in compact badges |
| `xs-button` | `w-3.5 h-3.5` | 14px | Button icons (size="xs") |
| `sm` | `w-4 h-4` | 16px | Standard buttons and inline text |
| `md` | `w-5 h-5` | 20px | Medium icons |
| `lg` | `w-6 h-6` | 24px | Large icons |
| `xl` | `w-8 h-8` | 32px | Spinners, feature icons |
| `2xl` | `w-12 h-12` | 48px | Empty state icons |

---

## File Organization

```
apps/dashboard/src/
├── components/
│   ├── ui/              # Base UI components (shadcn-style)
│   │   ├── alert.tsx
│   │   ├── inline-alert.tsx
│   │   ├── button.tsx
│   │   └── ...
│   ├── shared/          # Shared business components
│   └── layout/          # Layout components
├── pages/               # Page components by feature
│   ├── guests/
│   ├── settings/
│   └── tools/
├── hooks/               # Custom React hooks
├── contexts/            # React contexts
├── lib/                 # Utilities (api, utils)
└── types/               # TypeScript types
```

---

## Refactoring To-Do (Temporary)

### High Priority
- [x] ~~Create `src/lib/colors.ts`~~ - Replaced with Badge component variants
- [x] Create `src/lib/formatters.ts` - formatDate, formatDateShort, formatTime, formatDateTime, formatTimeAgo, formatCurrency
- [x] Create `src/types/api.ts` - shared Guest, Reservation, Task, Conversation types
- [x] Create `src/lib/config.ts` - status filter options, priority options, badge variant mappings

### Medium Priority
- [x] Create `<Spinner />` component - replace repeated spinner markup
- [x] Create `<Tabs />` component - standardize tab navigation (GuestProfile)
- [x] Use `FilterTabs` consistently (fix Conversations, Automations pages)
- [x] Use `Button` component everywhere (fix plain `<button>` in Tasks reopen)
- [x] Create `useFilteredQuery()` hook - query + URLSearchParams pattern
- [x] Create `buildQueryString()` utility - reduce URLSearchParams duplication

### Lower Priority
- [x] ~~Create Badge variants for status types~~ - Done: default, success, warning, error, info, dark, gold
- [x] Define icon size constants (xs, sm, md, lg, xl) - `src/lib/icons.ts`
- [x] Extract `<GuestFormFields />` - `src/components/shared/GuestFormFields.tsx`
- [x] Create column factory functions for DataTable - `src/components/DataTable/columns.tsx` (createStatusColumn, createDateColumn, createTextColumn, createActionsColumn)
- [x] Extract `<SectionCard />` - `src/components/ui/section-card.tsx`
- [x] Standardize empty states - all pages use EmptyState component
- [x] Standardize loading states - all pages use Spinner component
- [x] Create `<ErrorAlert />` wrapper - `src/components/ui/error-alert.tsx`
