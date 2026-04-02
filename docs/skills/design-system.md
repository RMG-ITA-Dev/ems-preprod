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
| **Cancel** | `cancel` | Foreground outline, visible in both themes | `bg-background border border-foreground/40 text-foreground/80 hover:bg-foreground/15` |
| **Delete / Reject** | `destructive` | Crimson, softened at rest | `bg-destructive/70 text-destructive-foreground hover:bg-destructive` |
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

### Architecture

- **Toggle mechanism**: `.dark` CSS class on `<html>` element (Tailwind `darkMode: ["class"]`)
- **Supported modes**: Light, Dark, System (three-way toggle)
- **Storage**: `localStorage` key `theme` for persistence
- **Default**: OS preference first (`prefers-color-scheme`), then user override
- **FOUC prevention**: Inline `<script>` in `<head>` reads localStorage before first paint
- **Browser-native UI**: `color-scheme: light dark` on `:root` for scrollbars/form controls
- **Browser chrome**: `<meta name="theme-color">` with `media` attribute for light/dark
- **Provider**: Custom `ThemeProvider` component (lightweight, no SSR baggage)

### Dark Mode Palette — Complete Token Map

The dark palette uses **desaturated deep blues** (not pure black) to maintain the Ruizmier brand identity while reducing eye strain in low-light environments.

#### Surface Hierarchy (Background → Card → Elevated)

| Token | Current HSL | Proposed HSL | Approx Hex | Rationale |
|-------|------------|-------------|------------|-----------|
| `--background` | `206 100% 17%` | `210 60% 12%` | `#0c1a2b` | Desaturated from 100%→60%; darker (17%→12%) for better card contrast; reduces eye fatigue |
| `--foreground` | `215 50% 98%` | `210 20% 95%` | `#eff1f4` | Slightly warmer white; less blue cast for readability |
| `--card` | `217 58% 20%` | `212 50% 18%` | `#172336` | Clearer distinction from background (+6% lightness gap); less saturated |
| `--card-foreground` | `215 50% 98%` | `210 20% 95%` | `#eff1f4` | Matches foreground |
| `--popover` | `206 100% 17%` | `212 50% 16%` | `#142030` | Slightly elevated from background; matches card family |
| `--popover-foreground` | `215 50% 98%` | `210 20% 95%` | `#eff1f4` | Matches foreground |

#### Interactive & Accent Colors

| Token | Current HSL | Proposed HSL | Approx Hex | Rationale |
|-------|------------|-------------|------------|-----------|
| `--primary` | `186 100% 29%` | `186 100% 35%` | `#009eb3` | Slight brightness boost (+6%) for dark bg visibility |
| `--primary-foreground` | `0 0% 100%` | `0 0% 100%` | `#ffffff` | No change |
| `--secondary` | `219 42% 68%` | `215 40% 65%` | `#8fa4c2` | Slightly desaturated for softer appearance |
| `--secondary-foreground` | `206 100% 17%` | `210 60% 12%` | `#0c1a2b` | Updated to match new background |
| `--muted` | `217 58% 25%` | `212 40% 20%` | `#1f2e42` | Less saturated; better hierarchy above card |
| `--muted-foreground` | `215 50% 81%` | `210 25% 70%` | `#a0adb8` | Desaturated for softer secondary text |
| `--accent` | `252 2% 46%` | `210 15% 35%` | `#4b5768` | Warmer neutral; picks up blue family |
| `--accent-foreground` | `0 0% 100%` | `210 20% 95%` | `#eff1f4` | Matches foreground |

#### Borders & Inputs

| Token | Current HSL | Proposed HSL | Approx Hex | Rationale |
|-------|------------|-------------|------------|-----------|
| `--border` | `217 58% 39%` | `212 35% 28%` | `#2e3f56` | Subtler borders; less saturated; visible but not distracting |
| `--input` | `217 58% 39%` | `212 35% 28%` | `#2e3f56` | Matches border |
| `--ring` | `186 100% 29%` | `186 100% 35%` | `#009eb3` | Matches primary for focus rings |

#### Destructive & Status Colors

| Token | Current HSL | Proposed HSL | Approx Hex | Rationale |
|-------|------------|-------------|------------|-----------|
| `--destructive` | `348 83% 40%` | `348 80% 50%` | `#e02a50` | Brighter on dark bg for visibility; reduced saturation slightly |
| `--destructive-foreground` | `0 0% 100%` | `0 0% 100%` | `#ffffff` | No change |
| `--success` | `142 70% 45%` | `142 65% 50%` | `#3ebd6e` | Slightly brighter for dark readability |
| `--success-foreground` | `0 0% 100%` | `0 0% 100%` | `#ffffff` | No change |
| `--warning` | `38 92% 50%` | `38 90% 55%` | `#f0a81a` | Slight brightness boost |
| `--warning-foreground` | `0 0% 100%` | `0 0% 100%` | `#ffffff` | No change |
| `--info` | `217 91% 65%` | `215 85% 60%` | `#4a8ad9` | Slightly desaturated; distinguished from secondary |
| `--info-foreground` | `0 0% 100%` | `0 0% 100%` | `#ffffff` | No change |

#### Brand Color Overrides (Dark Mode)

These tokens are NOT overridden in the current `.dark` class. Proposed additions:

| Token | Light Mode HSL | Dark Mode Proposed HSL | Approx Hex | Rationale |
|-------|---------------|----------------------|------------|-----------|
| `--brand-teal` | `186 100% 29%` | `186 100% 35%` | `#009eb3` | Brighter for dark bg visibility |
| `--brand-navy` | `213 77% 25%` | `213 60% 70%` | `#8aaccf` | Inverted: dark→light for readability as text |
| `--brand-purple` | `255 82% 65%` | `255 80% 72%` | `#9b6ef5` | Slightly brighter for dark bg contrast |
| `--brand-gold` | `41 76% 61%` | `41 80% 65%` | `#e8b832` | Slight brightness boost |
| `--brand-gray` | `215 12% 40%` | `210 15% 55%` | `#7a8899` | Lighter for dark bg visibility |

#### Sidebar (Dark Mode)

| Token | Current HSL | Proposed HSL | Approx Hex | Rationale |
|-------|------------|-------------|------------|-----------|
| `--sidebar-background` | `186 100% 20%` | `186 80% 15%` | `#082e33` | Desaturated; darker to match overall tone |
| `--sidebar-foreground` | `215 50% 98%` | `210 20% 95%` | `#eff1f4` | Matches foreground |
| `--sidebar-primary` | `226 32% 51%` | `226 40% 55%` | `#6078ad` | Slightly brighter for visibility |
| `--sidebar-primary-foreground` | `0 0% 100%` | `0 0% 100%` | `#ffffff` | No change |
| `--sidebar-accent` | `226 33% 57%` | `226 35% 55%` | `#6580a8` | Minor adjustment for consistency |
| `--sidebar-accent-foreground` | `215 50% 98%` | `210 20% 95%` | `#eff1f4` | Matches foreground |
| `--sidebar-border` | `186 100% 15%` | `186 60% 12%` | `#0c2e33` | Desaturated to match |
| `--sidebar-muted` | `215 50% 98% / 0.6` | `210 20% 95% / 0.6` | — | Matches foreground at 60% opacity |

### Design Principles for Dark Mode

1. **No pure black** (`#000000`): Use deep desaturated blues (`#0c1a2b`) to maintain brand identity
2. **Desaturate backgrounds**: 100% saturation blues cause eye fatigue; keep hue but reduce to 40-60%
3. **Increase surface hierarchy**: Background → Card should have at least 5-6% lightness difference
4. **Brighten interactive colors**: Primary, destructive, success, info all need +5-10% lightness on dark backgrounds
5. **Override brand tokens**: Purple, teal, gold, navy all need dark-mode-specific values for readability
6. **Warm the whites**: Pure white (`#ffffff`) text on dark blue is harsh; use `#eff1f4` (slightly warm)
7. **WCAG AA minimum**: 4.5:1 for normal text, 3:1 for large text and UI components

### Contrast Verification Checklist

After implementation, verify these specific combinations:

| Text/Element | Background | Required Ratio | Check |
|-------------|-----------|---------------|-------|
| Body text (`--foreground`) | `--background` | 4.5:1 | |
| Muted text (`--muted-foreground`) | `--background` | 4.5:1 | |
| Muted text (`--muted-foreground`) | `--card` | 4.5:1 | |
| Card text (`--card-foreground`) | `--card` | 4.5:1 | |
| Primary on dark (`--primary`) | `--background` | 3:1 (UI) | |
| Brand Purple buttons | `--card` | 3:1 (UI) | |
| Success badge text | `--card` | 4.5:1 | |
| Destructive badge text | `--card` | 4.5:1 | |
| Sidebar text | `--sidebar-background` | 4.5:1 | |
| Focus ring (`--ring`) | `--background` | 3:1 (UI) | |

### ThemeProvider Implementation Notes

Replace `next-themes` with a custom lightweight provider:

```
src/
├── components/
│   └── theme/
│       ├── ThemeProvider.tsx    # Context + localStorage + system detection
│       └── ThemeToggle.tsx      # Three-way toggle UI (Light/Dark/System)
```

**ThemeProvider responsibilities**:
- React Context providing `{ theme, setTheme }` where theme is `"light" | "dark" | "system"`
- On mount: read `localStorage.theme`, fall back to `"system"`
- On `"system"`: listen to `window.matchMedia("(prefers-color-scheme: dark)")` changes
- Apply/remove `.dark` class on `document.documentElement`
- Set `color-scheme` CSS property on `:root`
- Persist choice to `localStorage`

**FOUC prevention** (inline in `index.html <head>`):
```html
<script>
  (function() {
    var t = localStorage.getItem('theme');
    var d = t === 'dark' || (t !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (d) document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = d ? 'dark' : 'light';
  })();
</script>
```

**Browser chrome** (in `index.html <head>`):
```html
<meta name="theme-color" content="#008795" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0c1a2b" media="(prefers-color-scheme: dark)">
```

### Elements Requiring Dark Mode Attention

These components often have their own background/color logic and need explicit verification:

| Component | Risk | What to Check |
|-----------|------|--------------|
| Modals / AlertDialog | Own overlay + surface | Overlay opacity, content bg, text contrast |
| Dropdowns / Select | Own popover surface | Background, hover states, selected state |
| Tooltips | Own bg | Text contrast on dark tooltip |
| Toast notifications (Sonner) | Own surface | Success/error/warning variants |
| DataTable mobile cards | Card surfaces | Border visibility, expand/collapse |
| Status badges | Tinted backgrounds | `bg-success/10` etc. on dark surfaces |
| Charts (Recharts) | Axis labels, grid | Label text color, gridline visibility |
| Focus rings | `:focus-visible` outline | Visibility on dark backgrounds |
| Calendar / DatePicker | Own surface | Day cells, selected state, hover |
| Cancel button | `bg-background border` | Needs visible border on dark bg |
| Form inputs | `bg-background border-input` | Text and placeholder contrast |
| Skeleton loaders | `bg-muted` | Animation visibility on dark |

### Definition of Done — Dark Mode

- [ ] Three-way toggle works: Light / Dark / System
- [ ] User preference persists across reloads (localStorage)
- [ ] System mode respects OS `prefers-color-scheme`
- [ ] No FOUC / flash-of-wrong-theme on page load
- [ ] Browser-native controls themed (`color-scheme: light dark`)
- [ ] Browser chrome matches (`<meta name="theme-color">`)
- [ ] All shared components render correctly in both themes
- [ ] All role-specific views (admin, partner, staff) themed correctly
- [ ] WCAG AA contrast met in both modes (see checklist above)
- [ ] Toggle is keyboard-accessible with `aria-pressed`
- [ ] Focus rings visible in both modes
- [ ] `next-themes` dependency removed; custom ThemeProvider in place
- [ ] Sonner toast updated to use custom ThemeProvider
- [ ] All hardcoded color values removed (grep verification)
- [ ] Tests pass, lint passes, build succeeds

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
