# CS-II TA Console — Design System / Theme Spec

Reverse-engineered from the legacy Next.js app in `legacy/`. This document is the
authoritative visual reference for rebuilding the UI faithfully. Every value below
is quoted from the legacy source; file paths are given as references.

Design language summary: **"Amber × Blue"** — a deep academic-blue brand with a warm
amber accent, glassy translucent surfaces, soft ambient aurora blobs, ultra-rounded
cards (16–24px), generous whitespace, tabular monospace numerics, and restrained
spring motion.

---

## 1. Tech Stack & UI Libraries

From `legacy/package.json`:

| Concern | Package | Version |
|---|---|---|
| Framework | `next` | `^16.3.5` |
| UI runtime | `react` / `react-dom` | `^19.0.0` |
| Component library | `@heroui/react` | `^3.2.6` |
| HeroUI styles/CSS | `@heroui/styles` | `^3.2.6` |
| Icons | `@iconify/react` | `^5.2.0` |
| Motion | `motion` (import `motion/react`) | `^13.4.0` |
| Toasts | `sonner` | `^1.7.0` |
| Theming/dark mode | `next-themes` | `^0.4.4` |
| Class utils | `clsx` `^2.1.1` + `tailwind-merge` `^2.5.0` | |
| Styling engine | `tailwindcss` `^4.0.0` + `@tailwindcss/postcss` | v4 (CSS-first) |
| i18n | `next-intl` | `^4.14.6` |
| Data fetching | `swr` | `^2.2.5` |
| Animation (extra) | `motion` | `^13.4.0` |

- **Tailwind v4 CSS-first**: there is **no `tailwind.config.*`**. All tokens live in
  `legacy/src/app/globals.css` via `@theme inline { … }`.
- PostCSS config `legacy/postcss.config.mjs` is only `{ plugins: { "@tailwindcss/postcss": {} } }`.
- Path alias `@/*` → `./src/*` (`legacy/tsconfig.json`).
- HeroUI v3 uses **compound components** (e.g. `Switch.Content`, `Switch.Control`,
  `Switch.Thumb`), not v2 flat props. Import surfaces used: `Button`, `Spinner`,
  `Chip`, `Skeleton`, `Switch` from `@heroui/react`.
- `legacy/next.config.ts` wraps the config with `createNextIntlPlugin`.

---

## 2. Color Palette / CSS Variables

Defined in `legacy/src/app/globals.css`. Colors use hex (not oklch).

### Brand — deep academic blue
```
--brand-50  #eef4ff   --brand-500 #4f74dd   --brand-900 #1e2a5f
--brand-100 #dfe9fb   --brand-600 #3a56c9   --brand-950 #141c42
--brand-200 #c5d6f7   --brand-700 #3145a8
--brand-300 #a0bbf1   --brand-800 #2c3d87
--brand-400 #7397e8
```

### Accent — warm amber
```
--amber-50  #fffaeb   --amber-500 #f79009   --amber-900 #7a2e0e
--amber-100 #fef0c7   --amber-600 #dc6803   --amber-950 #4e1d09
--amber-200 #fedf89   --amber-700 #b54708
--amber-300 #fec84b   --amber-800 #93370d
--amber-400 #fdb022
```

### Semantic surfaces — LIGHT (`:root`)
```
--bg          #f6f7fb                    /* app background */
--bg-elevated #ffffff                    /* cards, panels */
--bg-sunken   #eceef5                    /* inset wells, inputs-on-sunken */
--fg          #131a2c                    /* primary text */
--fg-muted    #5b6478                    /* secondary text */
--fg-subtle   #8a92a8                    /* tertiary/placeholder text */
--line        rgba(19, 26, 44, 0.08)     /* hairline borders */
--glass       rgba(255, 255, 255, 0.72)  /* glass material fill */
--glass-line  rgba(255, 255, 255, 0.6)   /* glass border */

--success     #17b26a
--warning     #f79009
--danger      #f04438
```

### Semantic surfaces — DARK (`.dark`)
```
--bg          #0a0e1a
--bg-elevated #101527
--bg-sunken   #070a12
--fg          #e8ecf6
--fg-muted    #9aa3ba
--fg-subtle   #626b84
--line        rgba(232, 236, 246, 0.09)
--glass       rgba(16, 21, 39, 0.66)
--glass-line  rgba(255, 255, 255, 0.08)
```
`--success` / `--warning` / `--danger` are **not** overridden in dark mode.

### Tailwind token bridge (`@theme inline`)
Utilities are generated from these variables:
```
--color-brand-50 … --color-brand-950
--color-amber-50 … --color-amber-950
--color-bg         --color-elevated   --color-sunken
--color-fg         --color-fg-muted   --color-fg-subtle
--color-line
--color-success    --color-warning    --color-danger
```
So class names are: `bg-bg`, `bg-elevated`, `bg-sunken`, `text-fg`, `text-fg-muted`,
`text-fg-subtle`, `border-line`, `text-brand-600`, `bg-brand-500/10`, `text-amber-500`,
`text-success`, `text-danger`, etc. Opacity modifiers (`/5`, `/10`, `/15`, `/25`) are
used heavily.

> Note: the theme intentionally does **not** redefine HeroUI's own accent tokens; HeroUI
> components are mostly transparent/unstyled and the app layers its own `className`
> gradients on top.

---

## 3. Typography

Fonts declared in `legacy/src/lib/fonts.ts` and wired in `legacy/src/app/[locale]/layout.tsx`
(`next/font/google`, CSS variables on `<html>`):

```ts
manrope          // Manrope, subsets ["latin"], variable --font-manrope, display swap
notoSansSC       // Noto Sans SC, weight ["400","500","700"], variable --font-noto-sans-sc
jetbrainsMono    // JetBrains Mono, subsets ["latin"], variable --font-jetbrains-mono
```

Font stack (`@theme`):
```
--font-sans: var(--font-manrope), var(--font-noto-sans-sc), system-ui, sans-serif;
--font-mono: var(--font-jetbrains-mono), ui-monospace, monospace;
```

`body` features (`globals.css`):
```css
font-feature-settings: "ss01", "cv11", "tnum";
-webkit-font-smoothing: antialiased;
text-rendering: optimizeLegibility;
```
Body class: `min-h-screen font-sans antialiased` (`[locale]/layout.tsx:36`).

Type scale in practice (Tailwind defaults):
- Page title: `text-2xl font-bold tracking-tight md:text-3xl`
- Card/section title: `font-bold` or `text-base font-bold`
- Body: `text-sm`
- Meta/caption: `text-xs`, micro-labels `text-[10px]` / `text-[11px]`
- Numeric hero: `tabular text-3xl font-bold tracking-tight` (up to `text-5xl` in score panel)
- Uppercase eyebrow labels: `text-xs font-semibold uppercase tracking-wider text-fg-subtle`
  or `tracking-widest` / `uppercase tracking-[0.2em]`.

**`.tabular` utility** (numeric display) — very widely used (85+ usages):
```css
.tabular { font-variant-numeric: tabular-nums; font-family: var(--font-mono); }
```
Apply to every ID, score, date, count, timer, code.

---

## 4. Spacing, Radius, Shadow, Border Tokens

**Spacing** — Tailwind default 4px scale. Recurring values:
- Page container horizontal padding: `px-4` mobile / `md:px-8` (in `AppShell` main).
- Card padding: `p-5` (stat/feed cards), `p-6` (settings/section cards).
- Grid gaps: `gap-3` (dense card grids), `gap-4` (stat grids), `gap-6` (hero rows).
- Section rhythm: `space-y-6`, or `mt-6` between blocks.
- Top page padding: `pt-6`; bottom: `pb-24 md:pb-10` (mobile bottom-nav clearance).

**Radius** — Tailwind defaults, no custom radius vars:
- `rounded-lg` (8px): small buttons/wells, kbd, icon tiles inside rows.
- `rounded-xl` (12px): inputs, nav items, nav active pill, role/step pills, icon tiles.
- `rounded-2xl` (16px): **default card/panel radius**, primary buttons' containers, modals' inner tiles, icon tiles `rounded-2xl`.
- `rounded-3xl` (24px): modals/dialogs (`.glass … rounded-3xl`), hero gradient panels, big brand tiles.
- `rounded-full`: avatars, dots, pills/chips, progress tracks.

**Shadows** — mostly Tailwind defaults + colored glows:
- Hover card lift: `hover:shadow-lg hover:shadow-brand-500/5`
- Brand CTA: `shadow-lg shadow-brand-600/25`
- Brand tile (sidebar logo): `shadow-lg shadow-brand-500/25`
- Hero panels: `shadow-xl shadow-brand-950/5`, hover `hover:shadow-2xl hover:shadow-brand-600/20`
- Quick-action tiles: `shadow-lg shadow-{brand|amber|emerald}-600/25`
- Input focus ring: `focus:ring-4 focus:ring-brand-500/15`

**Borders**:
- Hairline token `border-line` everywhere (1px).
- Dashed empty states: `border-2 border-dashed border-line`.
- Ring utilities: `ring-1 ring-line`, `ring-1 ring-brand-500/25`, `ring-2 ring-purple-500/25`.

**Glass material** (`globals.css`):
```css
.glass {
  background: var(--glass);
  backdrop-filter: blur(18px) saturate(1.4);
  -webkit-backdrop-filter: blur(18px) saturate(1.4);
  border: 1px solid var(--glass-line);
}
```

**Scrollbar** (`globals.css`): width/height 10px, transparent track, thumb `var(--fg-subtle)`,
`rounded 8px`, `border: 2px solid var(--bg)`; hover `var(--fg-muted)`.

---

## 5. Component Styling Conventions

### 5.1 Button — HeroUI `Button` (`@heroui/react`)
Used with these props/variants:
- `variant`: default/`primary`, `ghost`, `secondary`, `danger-soft`.
- `size`: `sm`, `md`, `lg`.
- `fullWidth`, `isIconOnly`, `isPending`, `isDisabled`, `onPress`, `type`.
- Render-prop for pending: `{({ isPending }) => (isPending ? <Spinner color="current" size="sm"/> : <Icon .../>) }`.

Canonical gradient CTAs (className overrides):
```
bg-gradient-to-r from-brand-600 to-brand-700                     (brand actions)
bg-gradient-to-r from-emerald-600 to-emerald-700 ...             (save/confirm)
bg-gradient-to-r from-blue-600 to-indigo-600                     (board create)
bg-gradient-to-r from-purple-600 to-indigo-600                   (quiz create)
bg-purple-600                                                     (fast grade)
bg-white/10 text-white backdrop-blur hover:bg-white/20           (ghost on dark hero)
```
Icon-only ghost button is the standard top-bar/nav action (`isIconOnly variant="ghost" size="sm"`).

### 5.2 Card / Panel — **not** HeroUI `Card`, it's a raw class string
Dominant literal (23 occurrences of the exact substring):
```
rounded-2xl border border-line bg-elevated p-5|p-6
```
With hover lift: `… transition-shadow hover:shadow-lg hover:shadow-brand-500/5`.
Dark "hero" panel variant:
```
relative overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-brand-950 to-brand-900 p-6 text-white
```
plus a decorative amber blur blob: `pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-amber-500/20 blur-[60px]`.

Section card wrapper `SettingsCard` (`legacy/src/components/settings/SettingsCard.tsx`):
```tsx
<motion.section className="rounded-2xl border border-line bg-elevated p-6">
  <div className="mb-4 flex items-start gap-3">
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500/15 to-amber-500/10 text-brand-600 dark:text-brand-300">
      <Icon icon={icon} width={19} />
    </div>
    …
```

### 5.3 Input / Form controls — raw `<input>` with a shared `inputClass`
From `StudentLoginForm.tsx`, `LiftModal`, `quizzes`, etc.:
```
w-full rounded-xl border border-line bg-elevated px-4 py-3 text-sm text-fg placeholder:text-fg-subtle outline-none transition-all focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15
```
`settingsInputClass` (settings page) is the sunken variant:
```
w-full rounded-xl border border-line bg-sunken px-3.5 py-2.5 text-sm outline-none transition-all focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15
```
Table inline cell (`assignments`):
```
tabular w-16 rounded-lg border border-line bg-sunken px-2 py-1.5 text-center text-sm outline-none transition-all focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15
```
Labels: `mb-1.5 block text-xs font-semibold text-fg-muted`. Required asterisk: `<span className="text-danger">*</span>`.
Search inputs prepend an absolute icon: `pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fg-subtle`.
Custom segmented tab switcher: container `flex rounded-xl border border-line bg-sunken p-1`; active segment `bg-elevated text-fg shadow-sm`, inactive `text-fg-subtle hover:text-fg`.

### 5.4 Segmented control / pill tabs (repeated pattern)
A `<div className="grid grid-cols-3 gap-2 rounded-2xl border border-line bg-sunken p-1.5">` or
`flex rounded-xl border border-line bg-sunken p-1`; the active item gets an animated
`motion.span layoutId="…"` with `absolute inset-0 rounded-xl bg-elevated shadow-sm ring-1 ring-line`
(or a brand gradient pill). Shared-layout `layoutId`s in use: `nav-active`, `nav-dot`,
`mobile-nav-pill`, `role-pill`, `ta-method-pill`, `step-pill`, `board-filter`, `exp-tab`.

### 5.5 Table
Wrapper + structure (`quizzes`, `assignments`):
```tsx
<div className="overflow-x-auto rounded-2xl border border-line bg-elevated">
  <table className="w-full text-sm">           {/* quizzes: text-left; assignments: min-w-[760px] */}
    <thead className="border-b border-line bg-sunken/50 text-xs font-semibold uppercase tracking-wider text-fg-muted">
      <tr><th className="px-5 py-3">…</th><th className="px-5 py-3 text-right">操作</th></tr>
    </thead>
    <tbody className="divide-y divide-line">
      <tr className="transition-colors hover:bg-sunken/40"> … </tr>
    </tbody>
  </table>
</div>
```
Assignments table uses `border-b border-line/60 … last:border-0 hover:bg-sunken/50` on `<motion.tr>`.
Numeric/ID cells: `tabular font-mono px-5 py-3`. Empty/loading states: `p-12 text-center text-sm text-fg-subtle`.

### 5.6 Modal / Dialog
Implemented as a `motion.div` overlay + `motion.div` panel (no HeroUI Modal):
```tsx
<motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center" onClick={onClose}>
  <motion.div
    initial={{ opacity: 0, y: 32, scale: 0.97 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: 16, scale: 0.98 }}
    transition={{ type: "spring", stiffness: 380, damping: 30 }}
    onClick={(e) => e.stopPropagation()}
    className="glass w-full max-w-lg rounded-3xl p-6"
  >
```
Header pattern: `mb-5 flex items-center justify-between` with `<h3 className="text-lg font-bold">`
+ `<p className="text-sm text-fg-muted">`, close via `Button isIconOnly variant="ghost" size="sm"` + `lucide:x`.

### 5.7 Badges / Chips — HeroUI `Chip`
Always `size="sm" variant="soft"`. Colors used: `success`, `warning`, `default`, `accent`, `danger`.
Examples: board status (`warning`/`success`), checkpoint (`accent`), plagiarised (`danger` + `lucide:alert-triangle`),
published (`success`/`default`).

### 5.8 Avatars / identity tiles
No `Avatar` component; a rounded square with the first character:
```tsx
<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-sm font-bold text-brand-600 dark:text-brand-300">
  {name.slice(0, 1)}
</div>
```
Circular variant in sidebar footer: `rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400`.
Larger identity tiles use the shared gradient: `rounded-xl bg-gradient-to-br from-brand-500/15 to-amber-500/10`.

### 5.9 Toasts — `sonner`
Configured in `legacy/src/app/[locale]/providers.tsx`:
```tsx
<Toaster theme={resolvedTheme === "dark" ? "dark" : "light"} position="bottom-right"
  toastOptions={{ style: { background: "var(--glass)", backdropFilter: "blur(16px)",
    border: "1px solid var(--line)", color: "var(--fg)" } }} richColors closeButton />
```
Usage: `toast.success(...)`, `toast.error(...)`, `toast.info(...)`, custom icon via `{ icon: <Icon …/> }`.

### 5.10 Skeletons — HeroUI `Skeleton`
`<Skeleton className="h-3 w-24 rounded" />`, `h-32 rounded-2xl`, `h-14 rounded-xl`, etc.
Custom shimmer available via `.skeleton-shimmer`.

### 5.11 Switch — HeroUI v3 compound
`legacy/src/components/settings/PrefsSection.tsx`:
```tsx
<Switch isSelected={multi} onChange={(selected) => setMode(selected ? "multi" : "single")}>
  <Switch.Content>
    <Switch.Control><Switch.Thumb /></Switch.Control>
  </Switch.Content>
</Switch>
```

### 5.12 Custom range slider — `.score-slider`
`globals.css`: 8px tall, `rounded-full`, brand→amber gradient fill driven by `--fill` CSS var,
22px round thumb with `border 3px solid var(--brand-500)`, hover glow `0 0 0 6px rgba(79,116,221,.18)`,
active turns amber. Usage in `ScoreForm.tsx`:
```tsx
<input type="range" className="score-slider mt-4 w-full" style={{ "--fill": `${value}%` } as React.CSSProperties} />
```

### 5.13 Kbd hints
`<kbd className="rounded-md border border-line bg-sunken px-1.5 py-0.5 font-mono text-[10px]">⌘</kbd>`.

---

## 6. Layout Patterns

### 6.1 App shell (`legacy/src/components/layout/AppShell.tsx`)
Used by `/console` and `/me` via their `layout.tsx`. Structure:

```tsx
<div className="flex min-h-screen">
  {/* Desktop sidebar */}
  <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-elevated/60 backdrop-blur-xl md:flex">
    <div className="flex h-16 items-center gap-3 px-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/25">
        <Icon icon="lucide:cpu" width={20} />
      </div>
      <div className="leading-tight">
        <div className="text-sm font-bold tracking-tight">{appName}</div>
        <div className="text-[10px] font-medium uppercase tracking-widest text-fg-subtle">ZJU · CS-II</div>
      </div>
    </div>
    <nav className="mt-4 flex flex-1 flex-col gap-1 px-3"> … </nav>
    <div className="border-t border-line p-3"> … user / logout … </div>
  </aside>

  {/* Main column, offset by sidebar width */}
  <div className="flex min-h-screen flex-1 flex-col md:pl-60">
    <header className="glass sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line px-4 md:px-8">
      … language toggle · theme toggle · mobile logout …
    </header>
    <nav className="glass fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-line pb-[env(safe-area-inset-bottom)] md:hidden">
      … mobile bottom nav …
    </nav>
    <main className="flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10">{children}</main>
  </div>
</div>
```

Sidebar nav item:
```tsx
className={cn(
  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
  active ? "text-fg" : "text-fg-muted hover:text-fg",
)}
```
Active background (animated): `absolute inset-0 rounded-xl bg-brand-500/10 ring-1 ring-brand-500/25 dark:bg-brand-400/10`
plus a right dot `h-1.5 w-1.5 rounded-full bg-amber-500`. Active icon `text-brand-600 dark:text-brand-300`.

**Nav items** (`STAFF_NAV`): `/console` `lucide:layout-dashboard`, `/console/checkoff`
`lucide:clipboard-check`, `/console/quizzes` `lucide:file-question`, `/console/boards`
`lucide:circuit-board`, `/console/experiments` `lucide:flask-conical`, `/console/assignments`
`lucide:pen-line`, `/console/settings` `lucide:settings-2`. Student nav: `/me` `lucide:user-round`.

### 6.2 Page container + header
Content is centered per page with a max width:
- Console dashboard: `mx-auto max-w-6xl`
- Assignments: `mx-auto max-w-6xl`; Quizzes: `mx-auto max-w-5xl space-y-6`
- Checkoff / Me: `mx-auto max-w-4xl`

Page header pattern:
```tsx
<motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }} className="mb-8">
  <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
  <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>
</motion.div>
```

### 6.3 Ambient background (global, in `[locale]/layout.tsx`)
```tsx
<div className="aurora" aria-hidden />
<div className="grid-overlay" aria-hidden />
```
`.aurora` (fixed, z-index -1) renders two blurred radial blobs — brand-500 top-right
(opacity .16, `drift-a 26s`) and amber-500 bottom-left (opacity .12, `drift-b 32s`);
opacity raised to .22/.16 in `.dark`. `.grid-overlay` is a 56px square grid masked with a
radial ellipse at top.

### 6.4 Auth pages
`LoginPage` is a two-column full-height flex: `LoginBrandPanel` (desktop only, `hidden lg:flex lg:w-[46%]`,
`bg-brand-950 p-12 text-white`) + `LoginPanel` (centered `max-w-sm`, role segmented control then animated form).
`/setup` is a single centered `max-w-sm` column.

### 6.5 Check-in (slave) pages
`/checkin` and `/checkin/[token]` use `checkin-bg` (diagonal hairline stripes, see §10) with a
centered `max-w-md` glass card:
```tsx
<div className="checkin-bg relative flex min-h-screen flex-col items-center justify-center px-5 py-10">
```

---

## 7. Icon Library & Common Icons

`@iconify/react`, wrapped by `legacy/src/components/ui/Icon.tsx`:
```tsx
<IconifyIcon icon={icon} width={width} className={cn("shrink-0", className)} />
// default width = 18
```
Icon set is **Lucide** (`lucide:*`). Common icons by area:

- Brand/nav: `lucide:cpu`, `lucide:layout-dashboard`, `lucide:clipboard-check`,
  `lucide:file-question`, `lucide:circuit-board`, `lucide:flask-conical`, `lucide:pen-line`,
  `lucide:settings-2`, `lucide:user-round`.
- Actions: `lucide:arrow-right`, `lucide:arrow-up-right`, `lucide:arrow-down-left`, `lucide:plus`,
  `lucide:x`, `lucide:check`, `lucide:check-circle-2`, `lucide:trash-2`, `lucide:pen`, `lucide:shuffle`,
  `lucide:chevron-left`, `lucide:chevron-right`, `lucide:search`, `lucide:scan-search`, `lucide:barcode`.
- Auth/security: `lucide:fingerprint`, `lucide:key-round`, `lucide:lock`, `lucide:lock-open`,
  `lucide:shield-check`, `lucide:graduation-cap`, `lucide:book-open-check`, `lucide:university`, `lucide:ticket`.
- Misc: `lucide:activity`, `lucide:clipboard-list`, `lucide:user-search`, `lucide:help-circle`,
  `lucide:percent`, `lucide:dices`, `lucide:monitor-smartphone`, `lucide:smartphone`, `lucide:laptop`,
  `lucide:id-card`, `lucide:sliders-horizontal`, `lucide:list-checks`, `lucide:triangle-alert`,
  `lucide:alert-triangle`, `lucide:unlink`, `lucide:code-2`, `lucide:phone`, `lucide:user`, `lucide:users`,
  `lucide:clock`, `lucide:circle-dashed`, `lucide:eye`, `lucide:eye-off`, `lucide:languages`,
  `lucide:sun`, `lucide:moon`, `lucide:log-out`, `lucide:user-cog`.

Sizes in practice: `width={12|13|14}` inline meta, `15|16` buttons/nav, `18` default/labels,
`20` prominent tiles, `24–32` hero/brand marks.

---

## 8. Dark Mode Strategy

- `next-themes` with `attribute="class" defaultTheme="system" enableSystem`
  (`legacy/src/app/[locale]/providers.tsx`).
- `<html suppressHydrationWarning>`; `.dark` class toggled on the root.
- Tailwind custom variant in `globals.css`:
  ```css
  @custom-variant dark (&:is(.dark *));
  ```
- Strategy: **semantic CSS variables flip in `.dark`** (see §2), so most components need
  no dark styles. Accent colors that need explicit dark variants use Tailwind `dark:`
  utilities (e.g. `text-brand-600 dark:text-brand-300`, `text-amber-600 dark:text-amber-400`,
  `text-emerald-600 dark:text-emerald-400`, `text-purple-600 dark:text-purple-400`).
- Theme toggle animates a sun/moon swap with `AnimatePresence` + rotate/y spring
  (`legacy/src/components/ui/ThemeToggle.tsx`).
- Toaster re-themes from `resolvedTheme`.

---

## 9. Animation / Motion Conventions

Library: `motion` v13, imported from `motion/react` (framer-motion API).

**Shared easings** (`globals.css` `@theme`):
```
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);      /* the workhorse, inline as [0.16, 1, 0.3, 1] */
--ease-spring:   cubic-bezier(0.34, 1.56, 0.64, 1);
--animate-fade-up: fade-up 0.5s var(--ease-out-expo) both;
--animate-shimmer: shimmer 1.8s linear infinite;
```

**Entrance (fade-up)** — standard for cards/sections:
```tsx
initial={{ opacity: 0, y: 16 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.45, delay: index * 0.08, ease: [0.16, 1, 0.3, 1] }}
```
Typical durations 0.25–0.7s; stagger `index * 0.04–0.08` (capped, e.g. `Math.min(i*0.02, 0.3)`).

**Page transition** (`PageTransition.tsx`): `AnimatePresence mode="wait"`, key = pathname,
`initial {opacity:0,y:14}` / `exit {opacity:0,y:-8}`, `duration: 0.28`.

**Wizard step transitions**: `AnimatePresence mode="wait"`, `x: 24 → 0 → -24`, `duration: 0.3`.

**Shared-layout pills**: `motion.span layoutId="…"` with
`transition={{ type: "spring", stiffness: 400–500, damping: 32–38 }}`.

**List add/remove**: `AnimatePresence mode="popLayout"` + `motion.li layout`
(scale/opacity exits), delays `i * 0.03–0.12`.

**Spring motion values**: `AnimatedNumber` springs to value (`stiffness: 120, damping: 22`);
`ProgressRing` uses `useSpring(mv, { stiffness: 60, damping: 18 })` with a brand→amber gradient stroke.

**Hover micro-interactions**: `whileHover={{ y: -3 }}`, `whileTap={{ scale: 0.98 }}`,
`hover:-translate-y-0.5`, icon `group-hover:scale-110 group-hover:rotate-3`.

**Ambient loops**: aurora `drift-a 26s` / `drift-b 32s`; idle chevrons pulse; login brand grid
animates `backgroundPosition` over 8s linear.

---

## 10. Notable Reused Class Strings / Patterns

Copy-paste these literals to match the legacy look exactly.

**Card shell (most reused — 23 occurrences):**
```
rounded-2xl border border-line bg-elevated p-5
rounded-2xl border border-line bg-elevated p-6
```

**Card hover lift:**
```
transition-shadow hover:shadow-lg hover:shadow-brand-500/5
```

**Dark hero panel:**
```
relative overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-brand-950 to-brand-900 p-6 text-white
```

**Primary input:**
```
w-full rounded-xl border border-line bg-elevated px-4 py-3 text-sm text-fg placeholder:text-fg-subtle outline-none transition-all focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15
```

**Settings input (sunken):**
```
w-full rounded-xl border border-line bg-sunken px-3.5 py-2.5 text-sm outline-none transition-all focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15
```

**Form label:**
```
mb-1.5 block text-xs font-semibold text-fg-muted
```

**Eyebrow / meta label:**
```
text-xs font-semibold uppercase tracking-wider text-fg-subtle
text-xs font-bold uppercase tracking-widest text-fg-subtle
```

**Icon tile (gradient brand→amber):**
```
flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500/15 to-amber-500/10 text-brand-600 dark:text-brand-300
```

**Identity square:**
```
flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-sm font-bold text-brand-600 dark:text-brand-300
```

**Brand logo tile:**
```
flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/25
```

**Brand gradient CTA:**
```
bg-gradient-to-r from-brand-600 to-brand-700 shadow-lg shadow-brand-600/25
```

**Section header icon + title:**
```
mb-4 flex items-center gap-2 text-sm font-bold
```

**Empty / loading state:**
```
py-8|py-10|py-12 text-center text-sm text-fg-subtle
```

**Skeleton:**
```
rounded-2xl border border-line bg-elevated p-5   /* container */
<Skeleton className="h-3 w-24 rounded" />
```

**Custom CSS utilities to port verbatim from `globals.css`:**
- `.glass` — translucent blurred surface.
- `.aurora` + `.aurora::before/::after` + `@keyframes drift-a/drift-b` — ambient blobs.
- `.grid-overlay` — masked 56px grid.
- `.tabular` — tabular-nums + mono.
- `.skeleton-shimmer` — gradient shimmer (uses `--animate-shimmer`).
- `.checkin-bg` — `repeating-linear-gradient(-45deg, transparent 0 9px, rgba(19,26,44,.08) 9px 10px)`
  on white (dark: `rgba(232,236,246,.05)` on `--bg-sunken`).
- `.checkin-card` — border `rgba(19,26,44,.08)` (dark `rgba(232,236,246,.05)`), fill `--bg-elevated`.
- `.score-slider` — see §5.12.
- `::selection` amber-400 bg / `#1c1005` text (dark: amber-500 / `#fff8ec`).
- Scrollbar styling.

**Accent per-feature color families** (used for icons, chips, borders, gradients):
- Checkoff / brand: `brand-*`
- Boards / warnings: `amber-*`
- Grading / success / save: `emerald-*`
- Quizzes: `purple-*` (e.g. `border-purple-500/20 bg-purple-500/[0.03]`)
- Danger / plagiarism: `red-*` / `danger`

---

## Reference File Map

| Concern | File |
|---|---|
| Tokens, glass, aurora, scrollbar, sliders | `legacy/src/app/globals.css` |
| Root layout, fonts, ambient layers | `legacy/src/app/[locale]/layout.tsx` |
| Providers (next-themes + sonner) | `legacy/src/app/[locale]/providers.tsx` |
| App shell / sidebar / header / mobile nav | `legacy/src/components/layout/AppShell.tsx` |
| Page transition | `legacy/src/components/layout/PageTransition.tsx` |
| Fonts | `legacy/src/lib/fonts.ts` |
| `cn()` class merge | `legacy/src/lib/utils.ts` |
| Icon wrapper | `legacy/src/components/ui/Icon.tsx` |
| Theme/language toggles, AnimatedNumber, ProgressRing | `legacy/src/components/ui/*` |
| StatCard, QuickActions, ActivityFeed, PasskeyCard | `legacy/src/components/console/*` |
| Login brand/panel, role forms, dividers | `legacy/src/components/auth/*` |
| Checkoff wizard + step/drawer/score/finder | `legacy/src/components/checkoff/*` |
| Boards grid/modals/return | `legacy/src/components/boards/*` |
| Settings cards/sections | `legacy/src/components/settings/*` |
| Grade timeline, board card | `legacy/src/components/me/*` |
| Slave (check-in) display | `legacy/src/components/checkin/SlaveCard.tsx` |
| Console/Quizzes/Assignments/Experiment pages | `legacy/src/app/[locale]/console/**` |
