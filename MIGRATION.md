# 前端迁移方案：React (`fe/`) → Vue + Nuxt UI (`fe-v2/`)

> 状态：方案已定稿（2026-09-29），待开工。
> 目标：**展示样式不变**，`be/` 后端零改动。
> 本文件是迁移的「唯一事实来源」：每个 Phase 的范围、文件、验收点、风险都记在这里，跨会话可恢复。

---

## 1. 目标与硬约束

| 项 | 内容 |
|---|---|
| 目标 | 把整个前端从 React 迁到 Vue，产物落在 `fe-v2/`，UI 与交互保持一致 |
| 后端 | `be/` **一行不改**（纯 REST + socket.io，前端零耦合） |
| 样式 | 视觉尽量像素级一致；**唯一有意偏差**是 toast（见 2.4） |
| 数据库 | 无 schema 变更、无数据迁移（`user.preferences.markdownEditor` 字段保留不动） |
| 分支/目录 | 建议从 `main` 切 `feat/nuxt-fe`；新目录 `fe-v2/`；`fe/` 原样保留直到验收通过 |
| 协作约定 | 代码由 subagent 分批写；**主 agent 只做复核，不跑测试/类型检查/lint/构建**；每批交付「启动命令 + 肉眼比对清单」，由人工验收 |
| 工具 | 组件文档走 Nuxt UI MCP（已配好：`opencode.json` 的 `nuxt-ui` → `https://ui.nuxt.com/mcp`） |

---

## 2. 已定决策

### 2.1 框架：Nuxt 4 + `ssr: false`

- 理由：Nuxt UI v4 只支持 Nuxt，Vue 形态基本锁死；本应用是**登录后使用的控制台**（localStorage / socket.io / WebAuthn / 视口 API 全在客户端），SSR 收益≈0 而坑很多；`ssr: false` 保留文件路由、Nuxt UI、auto-import、vite 插件能力，行为与现有 SPA 完全一致。
- 附带好处：`@internationalized/date`、`pinyin-pro`、`socket.io-client`、`@simplewebauthn/browser` 都是框架无关，可直接搬。

### 2.2 移除 `@mdxeditor/editor`（只保留 `@uiw/vue-md-editor`）

- 现状：`components/ui/MarkdownEditor.tsx` 按 `user.preferences.markdownEditor` 在 `uiw` 与 `mdxeditor` 之间切换，切换 UI 在 `components/settings/MarkdownEditorChoice.tsx`。
- 处理：
  - `MarkdownEditor.tsx` 只保留 uiw 实现（`@uiw/vue-md-editor` + `@codemirror/language-data`，同样支持 `remarkPlugins` / `rehypePlugins`）；
  - `MarkdownEditorChoice.tsx` 的二选一卡片**移除/隐藏**；
  - 后端偏好字段与 API **不动**（将来若要加回第三种编辑器无需数据迁移）；
  - `index.css` 中 106 行 `.mdx-editor-content` 覆盖（`index.css:323-428`）不带过去，改为编写 `.w-md-editor`（uiw 的类名前缀）的亮/暗覆盖。

### 2.3 图标：`unplugin-icons`（`compiler: 'vue'`）

- 保留 `~icons/lucide/xxx` 直接导入写法（现有 40+ 处），`lib/nav.ts` 里「数组元素挂 `.icon` 组件」的模式不变。
- `@iconify-json/lucide` 已在依赖中，Nuxt UI 内部用的 `UIcon` 也能正常解析。
- `@svgr/core` / `@svgr/plugin-jsx` 在 React 版里其实**没被用到**（只是 `unplugin-icons` 的 peer），Vue 版不装。

### 2.4 Toast：统一到 Nuxt UI toast（唯一有意视觉偏差）

- 现状是双系统并存：`sonner`（115 处调用 + 自定义玻璃拟态 `components/ui/Toaster.tsx`）+ HeroUI `Toast.Provider`（1 处，`pages/Checkoff.tsx`）。
- 处理：全部改用 `useToast()`；删除 `components/ui/Toaster.tsx`；`app.config.ts` 里把 `ui.toast` 的 slot 样式调成接近现在的玻璃拟态（`bg-elevated/80` + blur + 细边 + `bottom-right`），把差异压到最小。

---

## 3. 现状盘点（迁移的「事实清单」）

- **代码量**：`fe/src` 74 个 `.ts/.tsx` + 6 个 css，约 **11.8k 行**。
- **结构**：22 个页面 + 26 个组件 + 16 个 lib 文件。
- **栈**：React 19.2 / HeroUI 3.2.6 / Tailwind 4.3 / react-router 7.18 / zustand 5 / motion 13 / sonner 2 / next-themes / socket.io-client 4.8 / pinyin-pro / @simplewebauthn/browser / @internationalized/date / katex + remark-math + rehype-katex。
- **路由（20 条）**：
  ```
  /                       → /console
  /login                  Login           （守卫外，已登录反向跳走）
  /setup                  Setup           （守卫内）
  /console                AppShell 布局容器
    ├ index               Dashboard
    ├ checkoff            Checkoff
    ├ boards              Boards
    ├ experiments         Experiments
    ├ experiments/:id     ExperimentDetail
    ├ questions           Questions
    ├ reports             Reports
    ├ llm-connect         LlmConnect
    ├ more                More
    ├ scores              Scores
    ├ courses/new         NewCourse
    ├ courses/settings    CourseSettings
    ├ courses/checkpoints Checkpoints
    ├ courses/focus-students FocusStudents
    └ settings            Settings
  /terms                  Terms           （守卫外）
  /checkin                Checkin         （守卫外）
  /checkin/:token         CheckinSession  （守卫外）
  *                       → /console
  ```
- **全局状态**：`lib/store.ts`（zustand，persist `tasaas.app`，只存 `currentClassId` + `sidebarCollapsed`；另有 `zjuamCourses/zjuamStatus/zjuamError/hasLocalCredential`）+ `lib/auth.tsx`（唯一 Context，`useAuth`）。
  ⚠️ 已知坑：`store.ts` 的 `useCurrentClass()` / `useHasXzzdPermission()` 内部调用 `useAuth()`，形成 Context ↔ Store 循环依赖；Vue 端把 auth 也做成 Pinia store 即可解掉。
- **副作用热点**（39 处 `useEffect`）：
  - 300ms 防抖搜索：`pages/Questions.tsx`、`components/questions/SetQuestionsEditor.tsx`
  - 全局快捷键 Ctrl+Enter：`components/checkoff/ScoreForm.tsx`
  - `IntersectionObserver` 目录：`components/ui/TableOfContents.tsx`
  - 防挂载水合标志：`ThemeToggle.tsx` / `Markdown.tsx` / `MarkdownEditor.tsx`
  - 三套 socket 状态机：`lib/checkoff-socket.ts`（master / watch / slave，4 个 effect）
  - 分数实时推送：`lib/realtime.ts`
  - TOTP 倒计时：`lib/totp.ts`
- **样式地基**：`fe/src/index.css`（428 行）
  - `:root` / `.dark` 两套 CSS 变量；`@theme inline`（Tailwind v4）导出语义类；
  - **6 个高频语义类在 33 个文件出现 600+ 次**：`text-fg`(≈40) / `text-fg-muted`(102) / `text-fg-subtle`(126) / `border-line`(135) / `bg-elevated`(≈64) / `bg-sunken`(≈44)；
  - 注意非对称命名：`--color-elevated: var(--bg-elevated)`、`--color-sunken: var(--bg-sunken)`；
  - `@keyframes fade-up/shimmer` **嵌套在 `@theme inline` 内部**（Tailwind v4 语法），`drift-a/drift-b` 在外部；
  - 自定义类：`.glass`(2 处) `.aurora`(1) `.grid-overlay`(1) `.diagonal-bg`(2) `.tabular`(≈48)；
  - 死代码：`.skeleton-shimmer`（0 处使用）、`.score-slider`（53 行、0 处使用，实际用 HeroUI `Slider`）→ **不带过去**；
  - 字体：Manrope / Noto Sans SC / JetBrains Mono 走 Google Fonts `<link>`（`fe/index.html`），国内不可达 → 建议改自托管。
- **构建**：`fe/vite.config.ts` — `react()` / `tailwindcss()` / `Icons({compiler:'jsx'})` / `progressBar()`；`build.cssCodeSplit:false` + rolldown `codeSplitting:false`；dev 端口 5173；代理 `/api`、`/socket.io`(ws)、`/mcp` → `http://localhost:3001`。
  ⚠️ `vite-plugin-load-with-progress-bar` 是**仓库外**依赖：`file:../../load-with-progress-bar/plugin`（位于 `/mnt/e/Projects/load-with-progress-bar/plugin`）。`fe-v2/` 与 `fe/` 同深度，相对路径可继续使用。
- **CI**：仓库无 GitHub Actions，部署/静态托管脚本在仓库外 → 切换时需同步告知。

---

## 4. 总体架构

### 4.1 兼容层（核心决策）

HeroUI v3 与 Nuxt UI v4 的 API 差异极大：`onPress` vs `@press`、`variant="danger-soft"`、`slot="close"`、`useOverlayState`、`useFilter`、`ListBox.onAction(Key)`、`ToggleButtonGroup` 受控值、`DateField` 四层 render-prop、`isPending` render-prop……而 `Button` 用了 111 次、`Modal` 11 个实例、`useOverlayState` 10 处。

**方案**：在 `fe-v2/app/components/ui/` 建一层薄封装，保持现有 JSX 写法 1:1。

- 页面文件变成「逐行翻译」：`className`→`class`、`onPress`→`@press`、`useState`→`ref`、JSX 逻辑结构不动 → 回归风险最低；
- 所有视觉偏差收敛在约 12 个 wrapper 内，逐个用 `ui` prop + class 校准即可；
- 未来若要脱掉兼容层，也是局部替换，不牵动页面。

代价：兼容层约 1200~1500 行。**这是整个迁移最划算的投入。**

### 4.2 样式地基

1. `app/assets/css/main.css` **逐字搬运** `fe/src/index.css`：
   - `@import "tailwindcss"` → Nuxt UI 的 CSS → **自定义 `@theme inline` 放在最后**（避免被 Nuxt UI 的 `@theme` 覆盖）；
   - `:root` / `.dark` 变量块、`@theme inline` 全量（含非对称命名与内嵌 `@keyframes`）、`.glass` / `.aurora` / `.grid-overlay` / `.diagonal-bg` / `.tabular` / 自定义滚动条 / `::selection` / `body { font-feature-settings }`；
   - **不搬**：`.skeleton-shimmer`、`.score-slider`、`.mdx-editor-content`。
2. `app.config.ts`：`ui.colors.primary = 'brand'`，直接复用搬过来的 `--color-brand-50..950`，让所有 `UButton`/`UInput` 默认主色就是那套学术蓝（而不是 Nuxt 默认绿）。`amber` 同理，供时间线「今天」标记与强调色使用。
3. 暗色：Nuxt UI 默认 `class` 策略 ↔ 现有 `@custom-variant dark (&:is(.dark *))` + `next-themes attribute="class"` → `@nuxtjs/color-mode`（`classSuffix: ''`，`attribute: 'class'`，跟随系统）。
4. 字体：改自托管 woff2（`app/assets/fonts/` 或 `@fontsource/*`），`app.head.link` 只留 preconnect 或一并去掉。
5. 迁移过程中若发现 HeroUI 与 Nuxt UI 的圆角/阴影/字号/焦点环/过渡不一致，**只在兼容层调整**，页面不动。

### 4.3 状态与副作用

| React 版 | Vue 版 |
|---|---|
| `AuthContext` + `useAuth()` | `app/stores/auth.ts`（Pinia）+ `useAuthStore()` |
| zustand `lib/store.ts` + persist | `app/stores/app.ts`（Pinia，手写 localStorage 同步，只存 `currentClassId` + `sidebarCollapsed`） |
| `useCurrentClass()` / `useHasXzzdPermission()` | 同名 composable，内部读两个 store（循环依赖自然解开） |
| `useOverlayState()` | `app/composables/useOverlayState.ts`（返回 `{ isOpen, open, close, toggle }`，支持 `onOpenChange` 回调，用于「关闭时重置表单」语义） |
| `useMasterSocket/useWatchSocket/useSlaveSocket` | 同名 composable（`onMounted`/`onUnmounted` + `watch`），214 行状态机逐行对照翻译 |
| `useFilter({sensitivity:'base'})` | 自实现 `useFilter`（`includes`/拼音匹配接 `lib/pinyin.ts`） |
| `next-themes` `useTheme()` | `@nuxtjs/color-mode` 的 `useColorMode()` |
| `sonner` `toast.*` | Nuxt UI `useToast().add({...})` |
| `motion` | `motion-v`（同引擎 Vue 版）；`layoutId` 行为需验证，失败退化为 CSS transition |
| `react-router` `useSearchParams` / `useParams` / `Navigate state.from` | `useRoute().query` / `route.params` / 中间件 `navigateTo('/login?redirect=...')` |

---

## 5. 目录映射（Nuxt 4 默认 `app/` 作 srcDir）

```
fe-v2/
├── nuxt.config.ts            ssr:false · css · vite.plugins(icons/vue, progressBar) · vite.server.proxy(/api,/socket.io,/mcp) · colorMode
├── app.config.ts             ui.colors.primary='brand' · ui.toast 玻璃拟态覆盖
├── app.vue                   aurora + grid-overlay + <NuxtLayout><NuxtPage/> + <UToaster/>
├── error.vue
├── public/                   favicon.svg · icons.svg · fonts/
├── app/
│   ├── assets/css/main.css   ← fe/src/index.css（逐字搬运）
│   ├── layouts/
│   │   ├── default.vue       空壳（Terms / Checkin / CheckinSession 用）
│   │   └── console.vue       ← AppShell.tsx（桌面侧栏 + 顶栏 + 移动底部导航 + <slot/>）
│   ├── middleware/auth.global.ts   ← RequireAuth + RedirectIfAuthed（白名单 /terms /checkin*）
│   ├── stores/{auth,app}.ts
│   ├── composables/          useCurrentClass · useOverlayState · useFilter · useMasterSocket · useWatchSocket · useSlaveSocket · useRealtimeScores
│   ├── lib/                  api · experiments · nav · pinyin · scores · zjuam · totp · passkey · last-user · checkoff-socket · utils · icon（纯 TS，基本 1:1）
│   ├── content/terms.ts
│   ├── components/
│   │   ├── ui/               兼容层（AppButton/AppModal/…）+ Card · PageHeader · ProgressRing · TableOfContents · Markdown · MarkdownEditor · ThemeToggle · Toaster(删)
│   │   ├── auth/ console/ checkin/ checkoff/ experiments/ questions/ settings/
│   └── pages/
│       ├── index.vue  login.vue  setup.vue  terms.vue
│       ├── checkin/index.vue   checkin/[token].vue
│       └── console/
│           ├── index.vue(Dashboard) checkoff.vue boards.vue experiments.vue
│           ├── experiments/[id].vue questions.vue reports.vue llm-connect.vue more.vue scores.vue settings.vue
│           └── courses/{new,settings,checkpoints,focus-students}.vue
```

路由映射：`pages/console/xxx.vue` + 每页 `definePageMeta({ layout: 'console' })`（布局在子页切换间常驻，store / socket 不会重建），不采用嵌套 `pages/console.vue` 父页写法。

---

## 6. 映射表

### 6.1 HeroUI → 兼容层 → Nuxt UI

| 现有用法（HeroUI v3） | 兼容层 | Nuxt UI v4 落地 | 备注 |
|---|---|---|---|
| `Button variant=primary/secondary/ghost/danger/danger-soft`、`size=sm/lg`、`isIconOnly`、`isPending`+render-prop、`fullWidth`、`onPress` | `AppButton.vue` | `UButton` 的 `color`/`variant`/`size`/`icon` | 唯一映射最频繁的组件（111 处） |
| `Button slot="close"`（11 处） | `AppModal.vue` | `UModal` + `@close` / `:ui` | 兼容层内部把 `slot="close"` 语义转成 emit |
| `Modal.Backdrop/Container/Dialog/Header/Icon/Heading/Body/Footer`（11 个实例，6 层） | `AppModal.vue` | `UModal` 同名子组件 | 结构一一对应，页面 JSX 基本照抄 |
| `Modal.Trigger` 包整块卡片（`SystemSection.tsx:130,280`） | `AppModal.vue` | `v-model:open` + `@click` | DOM 结构需微调 |
| `Input`（含 `fullWidth` / `pl-10` / `placeholder:` 变体） | `AppInput.vue` | `UInput` | 25 处 |
| `InputOTP.Group/Slot/Separator` + `REGEXP_ONLY_DIGITS`（`Checkin.tsx`） | `AppInputOTP.vue` | `UPinInput` | 行为需对齐（分隔符、仅数字） |
| `Select.Trigger/Value/ClearButton/Indicator + Popover + ListBox` | `AppSelect.vue` | `USelect` | 3 处 |
| `Autocomplete` + `Autocomplete.Filter` + `useFilter` | `AppAutocomplete.vue` | `UCommandPalette` / `USelect`(searchable) | 拼音搜索语义自己实现 |
| `ListBox selectionMode="none" onAction(Key)` | `AppListBox.vue` | `UListbox` | `String(key)` 转换 |
| `ToggleButtonGroup` 受控单选 + `Separator` | `AppToggleGroup.vue` | 多个 `UButton` 组合 / `UTabs` | 用按钮组模拟 |
| `Chip variant="soft" color="accent"/动态` | `AppChip.vue` | `UChip` | 10 处 |
| `Tooltip.Trigger/Content(delay=0, showArrow, placement)` | `AppTooltip.vue` | `UTooltip` | 20 处 |
| `Switch.Content/Control/Thumb` | `AppSwitch.vue` | `USwitch` | 4 处 |
| `Checkbox.Content/Control/Indicator` | `AppCheckbox.vue` | `UCheckbox` | 3 组 |
| `Tabs.ListContainer/List/Tab/Indicator/Panel` | `AppTabs.vue` | `UTabs` | 1 处 |
| `Pagination.Content/Item/Link/Previous/Next/Ellipsis/*Icon`（8 子组件） | `AppPagination.vue` | `UPagination` | 1 处 |
| `DatePicker + DateField(Segment) + Calendar(GridHeader/GridBody/YearPicker/NavButton slot)`（4 层 render-prop） | `AppDateTimePicker.vue` | `UCalendar` + `UInputDate` + 自写时间段编辑 | **难点**：Nuxt UI 缺 HeroUI 那种 segment 式时间输入，计划直接用 `@internationalized/date` 自写一层 |
| `Slider`（`ScoreForm.tsx`） | `AppSlider.vue` | `USlider` | 1 处 |
| `Accordion variant="surface" allowsMultipleExpanded` | `AppAccordion.vue` | `UAccordion` | 1 处 |
| `SearchField variant="secondary"` | `AppInput.vue` | `UInput` + icon | 1 处 |
| `Skeleton` | 直接用 | `USkeleton` | 24 处 |
| `Label` | `AppLabel.vue` | `ULabel` | 18 处（有一处被当纯文本用） |
| `Toast.Provider` + `herouiToast` | — | `useToast()` | 已并入 toast 决策 |

Nuxt UI 侧对应的「不存在项 → 替代方案」：`ToggleGroup`（按钮组）、`Autocomplete`/`Combobox`（CommandPalette / searchable Select）、`SearchField`（Input+icon）、`Menu`（DropdownMenu）、`SegmentedControl`（Tabs）、`InputNumber`（有）、`PinInput`（有，对应 InputOTP）。

### 6.2 第三方库

| 现有 | Vue 版 | 风险 |
|---|---|---|
| `react` / `react-dom` | `vue` | — |
| `react-router-dom` | Nuxt 文件路由 + `vue-router` | 低 |
| `zustand` | `pinia` | 低 |
| `motion` | `motion-v` | **中**：`layoutId`（AppShell 侧栏高亮块 `nav-active`/`nav-dot`、移动端 `mobile-nav-pill` 跨桌面/移动两棵树复用）需验证 |
| `next-themes` | `@nuxtjs/color-mode` | 低（要保证 `<html class>` 注入时机） |
| `sonner` | Nuxt UI `useToast` | 低（外观按 2.4 校准） |
| `@uiw/react-md-editor` | `@uiw/vue-md-editor` | 中：类名前缀 `w-md-editor`，主题靠 `data-color-mode` → 需自己写亮暗 CSS |
| `@mdxeditor/editor` | **移除** | — |
| `rehype-katex` / `remark-math` / `katex` | 原样保留 | 低（uiw vue 版同样支持这两个插件） |
| `socket.io-client` | 原样保留 | 中：状态机翻译（214 行） |
| `@simplewebauthn/browser` | 原样保留 | 低 |
| `pinyin-pro` | 原样保留 | 低 |
| `@internationalized/date` | 原样保留（自写 DateTimePicker 时直接用） | 中 |
| `@iconify-json/lucide` | 原样保留 | 低 |
| `unplugin-icons` | `compiler: 'vue'` | 低 |
| `tailwindcss` `@tailwindcss/vite` | 原样（版本保持 4.3.x，token 才能 1:1） | 低 |
| `@svgr/core`、`@svgr/plugin-jsx` | 移除（React 版本就未实际使用） | — |
| `vite-plugin-load-with-progress-bar` | 原样（`file:../../load-with-progress-bar/plugin`） | 低 |

---

## 7. 分阶段计划

每个 Phase = 一个或多个可独立验收的增量 + 独立 commit。范围外的文件一律不动。

### Phase A — 地基

- [ ] `fe-v2/` 脚手架：Nuxt 4 + `@nuxt/ui` + Tailwind v4 + `unplugin-icons`(vue) + `vite-plugin-load-with-progress-bar`；`package.json` / `tsconfig` / `npm install`
- [ ] `nuxt.config.ts`：`ssr: false`、`css: ['~/assets/css/main.css']`、`vite.plugins`、`vite.server.proxy`（`/api`、`/socket.io`(ws)、`/mcp` → `localhost:3001`）、`colorMode: { classSuffix: '', preference: 'system' }`
- [ ] `app/assets/css/main.css`：逐字搬运 `fe/src/index.css`（见 4.2），Nuxt UI CSS 在前、自定义 `@theme inline` 在后
- [ ] `app.config.ts`：`ui.colors.primary='brand'`（复用 `--color-brand-*`）、`ui.toast` 玻璃拟态覆盖
- [ ] 字体自托管（Manrope / Noto Sans SC / JetBrains Mono → woff2 + `@font-face`）
- [ ] 兼容层前 6 个：`AppButton` `AppInput` `AppChip` `AppTooltip` `AppSwitch` `AppLabel`
- [ ] `app/layouts/console.vue`（← `AppShell.tsx`）+ `app/layouts/default.vue`
- [ ] `app/middleware/auth.global.ts`（← `RequireAuth` + `RedirectIfAuthed`，白名单 `/terms` `/checkin*`，回跳 `?redirect=`）
- [ ] 路由骨架：`index` / `login` / `setup` / `terms` / `console/*` / `checkin/*` 空壳页（先只有标题）
- [ ] `app.vue`：`aurora` + `grid-overlay` + `<UToaster />`

**验收点**：① 明/暗两套主题下按钮、输入框、卡片、侧栏与旧版一致；② 未登录访问 `/console/scores` → 跳 `/login?redirect=/console/scores`，登录后回跳；③ `/terms`、`/checkin` 不被守卫拦截；④ 未知路径回落 `/console`；⑤ 桌面/移动两套导航都出现且高亮正确。

### Phase B — 基础设施

- [ ] `lib/*` 搬运（`api.ts` 563 行类型 1:1、`nav.ts`、`pinyin.ts`、`scores.ts`、`experiments.ts`、`zjuam.ts`、`totp.ts`、`passkey.ts`、`last-user.ts`、`utils.ts`、`checkoff-socket.ts`、`realtime.ts`）
- [ ] `stores/auth.ts`（← `lib/auth.tsx`）、`stores/app.ts`（← zustand，含 persist 等价逻辑）
- [ ] `composables/`：`useCurrentClass` `useHasXzzdPermission` `useOverlayState` `useFilter`
- [ ] 兼容层剩余：`AppModal` `AppSelect` `AppAutocomplete` `AppToggleGroup` `AppCheckbox` `AppTabs` `AppPagination` `AppSlider` `AppAccordion` `AppListBox` `AppInputOTP` `AppDateTimePicker`
- [ ] `components/ui/`：`Card`(`EmptyState`) `PageHeader` `ThemeToggle` `ProgressRing` `TableOfContents`
- [ ] `app.vue` 挂 `<UToaster />`；全量替换 toast 调用
- [ ] 落地页面：`More` `Login`(`LoginPanel`+`LoginBrandPanel`) `Setup` `Terms` + `AppShell` 完整化

**验收点**：① 登录/登出/通行密钥流程一致；② 课程切换与侧栏折叠刷新后保持；③ 拼音搜索可用；④ toast 位置与观感接近旧版；⑤ 移动端底部导航 + 「更多」页 10 项齐全。

### Phase C — 业务页（按复杂度升序，每批 1~3 页）

- [ ] C1 `Dashboard` `NewCourse` `CourseSettings` `Checkpoints` `Boards` `Reports`
- [ ] C2 `Experiments` `ExperimentDetail`（时间线 / 状态 Chip / hover tooltip）
- [ ] C3 **`FocusStudents`**（879 行：3 嵌套 Modal + Autocomplete 拼音筛选 + ToggleGroup 视图 + 冻结首列大表格 + 批量多选）
- [ ] C4 `Questions`（801 行：分页 + Tabs + URL query 同步 + 防抖 + 题目编辑抽屉联动 `SetQuestionsEditor` `QuestionDrawer` `ExperimentPicker` `StudentFinder`）
- [ ] C5 `Scores`（666 行：实时推送 + 逐列排序 + 分数区间编辑）
- [ ] C6 `Settings` + `SystemSection` `ZjuamSection` `FocusStudentsSection` `PreferenceSection`（Markdown 编辑器选择项按 2.2 移除）
- [ ] C7 **`LlmConnect`**（711 行：日志分页 + Accordion + 表单校验 + Modal）
- [ ] C8 `Checkoff` + `checkoff-socket` 三套 socket + `MasterSlavePanel` `DemoStep` `ScoreForm` `StepIndicator` `PreferenceOnboarding` + `Checkin` `CheckinSession` `SlaveCard` `CheckinScreen`

### Phase D — 内容与收尾

- [ ] `ui/Markdown.tsx`（只读渲染 + KaTeX）+ `ui/MarkdownEditor.tsx`（uiw Vue 版）+ `.w-md-editor` 亮暗样式覆盖
- [ ] `content/terms.ts`
- [ ] 全站走查：逐页明/暗主题对照清单；`tabular`、滚动条、`env(safe-area-inset-bottom)` 等细节
- [ ] 清理：确认未带入死代码；`be/` diff 为空校验

### Phase E — 切换

- [ ] 文档/脚本：README、`opencode.json` 无关项、启动与部署说明（静态托管指向 `fe-v2`）
- [ ] `fe/` 归档（建议 `git mv fe legacy/fe-react` 或打 tag 保留）或删除 —— 待人工验收后决定
- [ ] 旧分支收尾

---

## 8. 风险登记

| # | 风险 | 影响 | 应对 |
|---|---|---|---|
| 1 | `@mdxeditor/editor` 无 Vue 绑定 | 中 | 已决策：移除该选项，UI 收敛为单一编辑器 |
| 2 | HeroUI ↔ Nuxt UI 默认圆角/阴影/字号/焦点环/过渡不一致 | **高**（视觉） | 全部收敛到 12 个兼容层 wrapper 校准；Phase A 起逐组件对照 |
| 3 | `AppDateTimePicker`（Nuxt UI 无 segment 式时间输入） | 中高 | 用 `@internationalized/date` 自写一层，外观对齐现版 |
| 4 | `motion` `layoutId` 跨 DOM 分支复用 | 中 | 先试 `motion-v`；不行退化为 CSS transition / `layout` |
| 5 | `Autocomplete` + 拼音搜索语义差异 | 中 | 自实现 `useFilter`，接 `lib/pinyin.ts` |
| 6 | `checkoff-socket.ts` 214 行三套状态机（effect 依赖数组语义差异） | 中高 | 逐行对照翻译，`onMounted/onUnmounted` 精确清理，重点人工联调 |
| 7 | 双 toast 系统的 115 处调用改写 | 低 | 机械替换，Phase B 一次性完成 |
| 8 | 无 CI / 无自动化回归 | 中 | 每批交付肉眼比对清单；必要时在 Phase D 补 Playwright 截图对比（可选） |
| 9 | `load-with-progress-bar` 是仓库外 `file:` 依赖 | 低 | 同深度相对路径继续可用；若要解耦改为可选插件 |
| 10 | Google Fonts 国内不可达 | 低 | Phase A 一并改自托管 |
| 11 | 长时间迁移中 `be/` 继续演进导致 API 漂移 | 低 | 每 Phase 结束同步一次 `api.ts` 与 `be/src/routes/*` |

---

## 9. 协作与验收约定

- 代码由 subagent 按「Phase / 文件批次」切分并行写；主 agent 负责**复核**（读文件、查一致性、修小问题）。
- **不跑**测试 / 类型检查 / lint / 构建 / dev server。
- 每批交付时给出：
  1. 改动文件清单（新增 / 修改 / 删除）；
  2. 与旧版的**行为或视觉差异说明**；
  3. 启动命令 + 3~5 个**肉眼比对点**。
- 大文件（`FocusStudents` / `Questions` / `LlmConnect` / `Scores`）单独成批，先出兼容层设计再落页面。

---

## 10. 工作量估计（诚实值）

- 人工高质量迁移：**3~5 周**。
- subagent 并行：**8~12 轮迭代**，每轮 1 个可验收增量。
- 最耗时：Phase C 的 4 个大页面 + 兼容层 12 个组件 + Phase D 的 Markdown/编辑器样式。

---

## 附：相关文件速查

| 用途 | 路径 |
|---|---|
| 旧前端（迁移源） | `fe/` |
| 新前端（产物） | `fe-v2/` |
| 后端（不改） | `be/` |
| 迁移方案（本文） | `MIGRATION.md` |
| 待办 | `TODO.md` |
| 主题规范 | `THEME.md` |
| Nuxt UI MCP | `opencode.json` → `mcp.nuxt-ui` → `https://ui.nuxt.com/mcp` |
| 进度条插件（仓库外） | `/mnt/e/Projects/load-with-progress-bar/plugin` |
