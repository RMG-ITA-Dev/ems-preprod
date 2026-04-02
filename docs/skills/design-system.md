# Ruizmier Design System

The visual identity for all Ruizmier ERM applications. Every color, font, and spacing decision flows from this document.

**Source of truth**: `src/index.css` (CSS variables) + `tailwind.config.ts` (Tailwind extensions)

---

## Color System

All colors are defined as HSL CSS variables in `src/index.css` and consumed via Tailwind classes. **Never hardcode hex values** — always use the design tokens so themes can be changed in one place.

### Brand Colors

| Token | CSS Variable | HSL | Hex | Usage |
|-------|-------------|-----|-----|-------|
| `brand-teal` | `--brand-teal` | `186 100% 29%` | `#008795` | Primary theme color, sidebar background |
| `brand-navy` | `--brand-navy` | `213 77% 25%` | `#0f3c73` | Text foreground, secondary role |
| `brand-purple` | `--brand-purple` | `255 82% 65%` | `#7c3aed` | Primary action buttons (Add, Save), user name, switches |
| `brand-gold` | `--brand-gold` | `41 76% 61%` | `#c9a040` | Accent highlights |
| `brand-blue` | `--brand-blue` | `217 58% 39%` | `#355a8c` | Sidebar active highlight |
| `brand-blue-light` | `--brand-blue-light` | `226 33% 57%` | `#7085a8` | Sidebar accent |
| `brand-gray` | `--brand-gray` | `215 12% 40%` | `#5a6370` | Neutral accent |

### Semantic Colors

| Token | Tailwind Class | Light Mode HSL | Purpose |
|-------|---------------|---------------|---------|
| `primary` | `bg-primary` | `186 100% 29%` | Teal — focus rings, primary highlights |
| `secondary` | `bg-secondary` | `213 77% 25%` | Navy — secondary surfaces |
| `success` | `bg-success` | `142 76% 36%` | Green — approved, active status |
| `warning` | `bg-warning` | `38 92% 50%` | Amber — attention needed |
| `destructive` | `bg-destructive` | `348 83% 47%` | Crimson — delete, reject, errors |
| `info` | `bg-info` | `217 91% 60%` | Blue — submit actions, informational |
| `muted` | `bg-muted` | `215 20% 96%` | Light gray — pending, inactive |

### Surface Colors

| Token | Light Mode | Dark Mode | Purpose |
|-------|-----------|-----------|---------|
| `background` | `215 50% 98%` | `206 100% 17%` | Page background (cool gray tint) |
| `card` | `0 0% 100%` | `217 58% 20%` | Card/panel surfaces |
| `popover` | `0 0% 100%` | `206 100% 17%` | Dropdowns, tooltips |
| `border` | `219 42% 85%` | `217 58% 39%` | Borders, dividers |

### Sidebar Colors

| Token | Light Mode | Dark Mode | Purpose |
|-------|-----------|-----------|---------|
| `sidebar-background` | `186 100% 29%` (Teal) | `186 100% 20%` | Sidebar background |
| `sidebar-foreground` | `0 0% 100%` (White) | `215 50% 98%` | Sidebar text |
| `sidebar-primary` | `217 58% 39%` (Blue) | `226 32% 51%` | Active item highlight |
| `sidebar-accent` | `226 33% 57%` | `226 33% 57%` | Hover/accent state |
| `sidebar-border` | `186 100% 22%` | `186 100% 15%` | Separator lines |
| `sidebar-muted` | `0 0% 100% / 0.6` | `215 50% 98% / 0.6` | Section labels |

---

## Typography

### Font Families

| Context | Font | CSS Variable |
|---------|------|-------------|
| **Desktop** | IBM Plex Sans | `--font-regular` |
| **Mobile (auto)** | IBM Plex Sans Condensed | `--font-narrow` |
| **Compact mode** | IBM Plex Sans Condensed (forced) | `--app-font` with `data-compact-font="true"` |

The active font is set via `--app-font` CSS variable. On screens <= 768px, it auto-switches to the condensed variant unless compact mode is manually enabled.

### Numeric Display

- **Font feature**: `font-feature-settings: "tnum"` + `font-variant-numeric: tabular-nums` via `.font-mono` class
- **Decimals**: Zero decimal places for display (no trailing `.00`)
- **Currency signs**: Never in cells — show currency in column headers only
- **Alignment**: Numbers always right-aligned (`text-right`)

### Text Sizes

| Element | Size | Weight |
|---------|------|--------|
| Page title (header) | `text-sm md:text-base` | `font-semibold` |
| Section headings | `text-lg` | `font-medium` to `font-semibold` |
| Form labels | `text-xs` to `text-sm` | Default |
| Table data | `text-sm` | Default |
| Mobile nav labels | `text-[10px]` | `font-medium` |
| Brand name (header) | `text-lg md:text-xl` | `font-bold` |
| Muted/secondary text | `text-xs` | Default, `text-muted-foreground` |

---

## Button Color Rules

Defined in `src/components/ui/button.tsx` via `class-variance-authority`:

| Action | Variant | Color | Tailwind Classes |
|--------|---------|-------|-----------------|
| **Add / Save / Create** | `default` | Brand Purple | `bg-brand-purple text-primary-foreground hover:bg-brand-purple/90` |
| **Cancel** | `cancel` | Gray/White border | `bg-background border border-input text-muted-foreground hover:bg-muted` |
| **Delete / Reject** | `destructive` | Crimson | `bg-destructive text-destructive-foreground hover:bg-destructive/90` |
| **Submit / Confirm** | `submit` | Light Blue | `bg-info text-info-foreground hover:bg-info/90` |
| **Secondary** | `secondary` | Navy | `bg-secondary text-secondary-foreground hover:bg-secondary/80` |
| **Subtle / Icon** | `ghost` | Transparent | `hover:bg-accent hover:text-accent-foreground` |
| **Outline** | `outline` | Border only | `border border-input bg-background hover:bg-accent` |

### Button Sizes

| Size | Class | Height |
|------|-------|--------|
| Default | `h-10 px-4 py-2` | 40px |
| Small | `h-9 px-3` | 36px |
| Large | `h-11 px-8` | 44px |
| Icon | `h-10 w-10` | 40x40px |

### Mobile Button Rules

- Full width on mobile, auto width on desktop: `w-full sm:w-auto`
- Minimum touch target: `min-h-[44px] sm:min-h-0`
- Action button minimum width: `min-w-28` (via `.btn-action`)

---

## Switch Toggles

All Radix switches use **Brand Purple** when checked:
```css
[data-state="checked"][data-radix-switch-root] {
  background-color: hsl(var(--brand-purple)) !important;
}
```

---

## Status Badges

| Status | Style |
|--------|-------|
| Active / Approved | `bg-success/10 text-success border-success/20` |
| Inactive / Pending | `bg-muted text-muted-foreground` |
| Rejected | `bg-destructive/10 text-destructive border-destructive/20` |

---

## Spacing & Density

Ruizmier apps use **high information density** — tighter spacing than typical SaaS apps.

| Context | Spacing |
|---------|---------|
| Page padding | `p-3 sm:p-4 md:p-6` |
| Card padding | `p-4` to `p-6` |
| Form sections | `space-y-6` between sections, `space-y-4` within |
| Form fields (grid) | `gap-4` (full) or `gap-3` (compact) |
| Table cells (dense) | `py-1.5 px-2` |
| Table headers (dense) | `py-1.5 px-2` |
| Button bar | `gap-3 sm:gap-4 pt-4` |

### Custom Utility Classes

| Class | Purpose |
|-------|---------|
| `.table-dense` | Compressed table padding (`py-1.5 px-2`) |
| `.form-dense` | Reduced form gaps |
| `.btn-action` | `min-w-28` for consistent button sizing |
| `.hide-spinners` | Removes number input up/down arrows |
| `.font-mono` | Tabular figures (not monospace — uses app font with `tnum`) |
| `.safe-area-bottom` | Bottom padding for notched phones |

---

## Responsive Breakpoints

| Breakpoint | Width | UI Change |
|-----------|-------|-----------|
| `sm` | 640px | Buttons go side-by-side, form fields expand |
| `md` | 768px | **Key breakpoint**: Sidebar shows, mobile nav hides, padding increases |
| `lg` | 1024px | Wider form grids |
| `xl` | 1280px | Max container width |

The `md` breakpoint (768px) is the primary mobile/desktop boundary:
- Below `md`: Mobile layout (bottom nav, cards, condensed font)
- At/above `md`: Desktop layout (sidebar, tables, regular font)

---

## Dark Mode

Full dark mode support via `.dark` class on `<html>`. All colors have dark mode variants defined in `src/index.css`. The dark mode palette uses deep blue backgrounds (`#003055`) with adjusted foreground and surface colors.

Key dark mode differences:
- Background: Deep blue (`206 100% 17%`) instead of light gray
- Cards: Darker blue (`217 58% 20%`) instead of white
- Sidebar: Darker teal (`186 100% 20%`)
- Status colors: Slightly adjusted saturation for contrast

---

## Animations

| Animation | Duration | Use |
|-----------|----------|-----|
| `fade-in` | 0.3s ease-out | Page transitions |
| `slide-in-left` | 0.3s ease-out | Sidebar reveal |
| `pulse-subtle` | 2s ease-in-out infinite | Loading indicators |
| `accordion-down/up` | 0.2s ease-out | Collapsible sections |

---

## How to Modify the Color Scheme

To rebrand for a different client or update brand guidelines:

1. Edit `src/index.css` — change the HSL values under `:root` (light) and `.dark` (dark)
2. The brand tokens (`--brand-teal`, `--brand-navy`, `--brand-purple`, etc.) are the primary targets
3. Semantic tokens (`--primary`, `--secondary`, etc.) reference brand tokens, so most changes cascade automatically
4. Button variants in `src/components/ui/button.tsx` reference `bg-brand-purple` — update there if the action button color changes
5. Sidebar theme (`--sidebar-*` variables) may need separate adjustment

**No other files need to change** — the entire color system flows from CSS variables.
