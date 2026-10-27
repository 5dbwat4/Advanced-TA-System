# fe-v2 migration conventions

This directory is a Vue 3 + Vite + Nuxt UI v4 port of `../fe` (React + HeroUI v3).
Port behaviour faithfully from the corresponding React file. Visual parity is **not**
required; functional parity is.

## Hard rules

- Do not run `vite build`, `vite dev`, or a browser. Only static type checking is allowed:
  `pnpm --filter fe-v2 typecheck` (runs `vue-tsc --noEmit`).
- Do not import from `@heroui/react`, `react`, `react-router-dom`, `sonner`,
  `next-themes`, `zustand`, `@assistant-ui/*`, `@ai-sdk/*`, `ai`, `@mdxeditor/editor`,
  `@uiw/react-md-editor`, `@xyflow/react`, `@dnd-kit/*`, `react-resizable-panels`,
  `echarts-for-react`, `motion/react`, `@hcaptcha/react-hcaptcha`, `qrcode.react`,
  `react-markdown`, `react-use`.
- AI features are intentionally removed. Do not port:
  `components/ai/**`, `components/checkoff/AiAudioGrade.tsx`, `components/settings/AiSection.tsx`,
  `lib/ai-*.ts`, `pages/console/LlmConnect.tsx`.
- Sonner is gone. Use `import { toast } from '@/lib/toast'` (`toast.success/error/info/warning/show`,
  `toast.add/update/remove/clear`).
- Use the shared `Spinner` component: `import Spinner from '@/components/ui/Spinner.vue'`.
- Markdown editing uses Nuxt UI `UEditor`. Do not reintroduce a markdown-editor choice.

## Imports

Nuxt UI auto-imports are disabled so type-checking works without running Vite.
Always import explicitly:

```ts
import { UButton, UModal, UInput, UApp } from '@/ui'
import { useOverlay } from '@nuxt/ui/composables'
```

`@/ui` is the barrel at `src/ui.ts`. If a Nuxt UI component is missing there, add it
(`export { default as UXxx } from '@nuxt/ui/components/Xxx.vue'`) or import the
component file directly. Never rely on `UButton` being globally available.

Use `@/` for all app imports. Keep the same relative file layout as `../fe/src`
(e.g. `pages/console/scores/Scores.tsx` becomes `pages/console/scores/Scores.vue`).

## Vue mapping

- `useState` -> `ref`; `useMemo` -> `computed`; `useCallback` -> plain `async function`.
- `useEffect(fn, deps)` -> `watch(deps, fn, { immediate: ... })` or `onMounted`.
- Cleanup returned from `useEffect` -> `onUnmounted` / `watch` cleanup.
- `useNavigate()` -> `const router = useRouter(); router.push(...)`.
- `<Link to>` -> `<RouterLink to>`; `NavLink` -> `<RouterLink>` with active classes.
- `className` -> `class`; `htmlFor` -> `for`; `onClick` -> `@click`; `onChange` -> `@change`/`v-model`.
- HeroUI `onPress` -> `@click`. `isDisabled` -> `disabled`. `isPending` -> `loading`.
- React `children` -> default slot; render-prop children -> scoped slot.
- React icon imports (`~icons/lucide/x`) -> `UIcon name="i-lucide-x"`.
- React `useRef` for DOM -> `useTemplateRef` / `ref`.
- React context -> Pinia store or composable.
- React `useAsyncData(fetcher, deps)` -> `useAsyncData(() => fetcher(), depsRefs)` from `@/lib/request`.

## Auth / app state

```ts
import { useAuthStore } from '@/lib/auth'
import { useAppStore, useCurrentClass, useHasXzzdPermission } from '@/lib/store'

const auth = useAuthStore()
const app = useAppStore()
```

`useCurrentClass()` is a plain function returning `ClassInfo | null` (not a ref).
If you need reactivity in a computed, use `useCurrentClassComputed()` or read
`auth.user`/`app.currentClassId` inside `computed`.

## Nuxt UI mapping (HeroUI -> Nuxt UI)

- Compound components become props + slots. Do not invent `Modal.Backdrop` etc.
- `Modal` + `useOverlayState` -> `<UModal v-model:open="open" title="..." :dismissible="false">`
  with `#body` / `#footer`; or `useOverlay()` for programmatic modals.
- `Alert` -> `<UAlert color="error|warning|info|success" :title :description icon="i-lucide-..." />`.
- `Chip` text tag -> `UBadge`; status dot -> `UChip`.
- `CloseButton` -> `UButton icon="i-lucide-x" color="neutral" variant="ghost"`.
- `Description`/`FieldError`/`Label` + Input -> `UFormField` + `UInput`.
- `Select`/`ListBox` -> `USelect` (simple) or `USelectMenu` (searchable) or `UListbox`.
- `Autocomplete` -> `UInputMenu` (`multiple`, `v-model:search-term`, `#empty`, `#item`).
- `Dropdown` -> `UDropdownMenu` with `items` (supports `type: 'label' | 'separator'`, `children`).
- `Tabs` -> `UTabs` with `items` + `#content`; `variant="pill"` for segmented look.
- `ToggleButtonGroup` single-select -> `UTabs` (`variant="pill"`, `:content="false"`) or two
  `UButton`s with active styles. There is no Nuxt UI toggle-group component.
- `Tooltip` -> `<UTooltip text="..." arrow :content="{ side: 'right' }">`; rich content via `#content`.
- `Popover` -> `<UPopover><template #content>...</template></UPopover>`.
- `ProgressBar` -> `UProgress` (`:model-value="null"` for indeterminate).
- `Skeleton` -> `USkeleton`; `Separator` -> `USeparator`; `Spinner` -> `@/components/ui/Spinner.vue`.
- `InputOTP` -> `UPinInput` (`type="number"`, `:separator="3"` for 3+3 groups).
- `NumberField` -> `UInputNumber` (`min`, `max`, `step`, `increment`/`decrement` slots).
- `DatePicker`/`DateField`/`Calendar` -> `UInputDate` (`granularity="minute"`, `hour-cycle="24"`,
  `hide-time-zone`, `:model-value` accepts `ZonedDateTime`) and `UCalendar`.
- `SearchField` -> `UInput` with `icon="i-lucide-search"` and a trailing clear `UButton`.
- `toast` from HeroUI -> `import { toast } from '@/lib/toast'` (`toast.success/error/...`).

## Shared component APIs (already ported)

Always read the `.vue` file before using it; these are the important deviations:

- `PageHeader`: `title` prop; `#subtitle` and `#actions` slots.
- `SectionHeader`: `title`/`description` props; default slot for actions.
- `Card`, `BackLink`, `Logo`, `Markdown`, `ProgressRing`, `SkeletonList`: default export, `class` prop.
- `EmptyState`: `icon` (Iconify name), `title`, `hint`; `#icon` slot.
- `Markdown`: prop `text` (or default slot) rendered as GitHub markdown + KaTeX + highlight.js.
- `MarkdownEditor`: `v-model`, `height`; uses `UEditor` (markdown content type).
- `ConfirmDialog`: `v-model:open`, props `title`, `description`, `confirmText`, `cancelText`, `danger`, `loading`, `icon`; emits `confirm`/`cancel`; `#default` body and `#actions` slots.
- `PendingButton`: `loading`, `loadingLabel`, `icon` (Iconify name); other UButton props pass through.
- `SearchInput`: `v-model`, `placeholder`, `loading`, `autofocus`.
- `DateTimePicker`: `v-model` ISO string or null, `label`, `disabled`.
- `IconAction`: `label`, `icon` slot, `loading`, `disabled`, `tooltip` string + `#tooltip` slot; click handler is bound by the parent.
- `AvatarImage`: `id`, `size`; `#fallback` slot.
- `StudentIdentity`, `TableOfContents` (`TocItem` export), `ThemeToggle`, `ServiceWorkerUpdate` (not ported).
- `LoginPanel` / `LoginBrandPanel`: no props/emits; LoginPanel handles login + navigation itself.
- `EChart`: `option`, `height`, `onEvents`.
- `CheckinScreen`: `token` or `code`; emits `back`.
- `CheckinHeader`: `grader`, `student`.
- `SlaveCard`: `state`, `markdownStyle`.

## Removed pages/routes

- `/console/llm-connect` and `LlmConnect` are removed.
- AI assistant, AI grading, AI report, AI learning report are removed.
- If a page references an AI helper, delete that branch rather than porting it.

## Quality bar

- Every `.vue` file must type-check with `vue-tsc --noEmit`.
- Avoid `any` where a real type is available; use `unknown` + narrowing.
- Keep Chinese UI strings unchanged.
- No new comments unless they explain non-obvious behaviour.
- Do not create README/docs files.
