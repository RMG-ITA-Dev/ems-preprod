# Responsive Design QA Documentation

## Breakpoints

| Breakpoint | Width | Usage |
|------------|-------|-------|
| `sm` | 640px | Small tablets, landscape phones |
| `md` | 768px | Tablets |
| `lg` | 1024px | Laptops |
| `xl` | 1280px | Desktops |

## Patterns Implemented

### 1. Sidebar (AppSidebar.tsx)
- **Mobile**: Collapsible sheet overlay, full-width when open
- **Desktop**: Fixed 13rem sidebar

### 2. DataTable Mobile Cards (DataTable.tsx)
- **Mobile (<768px)**: Card-based layout with expandable sections
  - `mobilePriority: 'primary'` - Always visible
  - `mobilePriority: 'secondary'` - Hidden in collapsible "Show more"
- **Desktop (≥768px)**: Traditional table layout

### 3. Form Grids
- **Mobile**: `grid-cols-1` (single column)
- **Desktop**: `sm:grid-cols-2` or `lg:grid-cols-4`

### 4. Form Buttons
- **Mobile**: Full-width, stacked vertically (Cancel on top via `flex-col-reverse`)
- **Desktop**: Inline, right-aligned
- Touch target: `min-h-[44px]` on mobile

### 5. Container Padding
- **Mobile**: `p-3`
- **Tablet**: `sm:p-4`
- **Desktop**: `md:p-6`

## Pages Updated

| Page | Mobile Cards | Responsive Forms |
|------|--------------|------------------|
| Clients | ✅ | ✅ |
| Engagements | ✅ | ✅ |
| Staff | ✅ | ✅ |
| Settings (all tabs) | ✅ | ✅ |
| Expenses | - | ✅ |

## Testing Checklist

- [ ] 375px (iPhone SE)
- [ ] 414px (iPhone 12)
- [ ] 768px (iPad)
- [ ] 1024px (Laptop)
- [ ] 1920px (Desktop)

## CSS Utilities Used

```css
/* Touch targets */
min-h-[44px] sm:min-h-0

/* Full-width mobile buttons */
w-full sm:w-auto

/* Reversed button order mobile */
flex-col-reverse sm:flex-row

/* Responsive grids */
grid-cols-1 sm:grid-cols-2 lg:grid-cols-4

/* Responsive padding */
p-3 sm:p-4 md:p-6
```
