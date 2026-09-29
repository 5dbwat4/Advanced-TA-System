# 前端迁移方案：React (`fe/`) → Vue + Nuxt UI (`fe-v2/`)

> 状态：方案已定稿（2026-09-29），待开工。
> 目标：迁移到 Vue + Nuxt UI，**视觉基调一致、体验不退让**（动画/交互见 §4.4），`be/` 后端零改动。
> 本文件是迁移的「唯一事实来源」：每个 Phase 的范围、文件、验收点、风险都记在这里，跨会话可恢复。

---

## 1. 目标与硬约束

| 项 | 内容 |
|---|---|
| 目标 | 把整个前端从 React 迁到 Vue，产物落在 `fe-v2/`，UI 与交互保持一致 |
| 后端 | `be/` **一行不改**（纯 REST + socket.io，前端零耦合） |
| 样式 | **基调一致即可，允许轻微差异**（组件库不同，像素级一致不现实）；要保住品牌感、层次感与精致度 |
| **体验（最高优先）** | **丰富的动画 + 美观的页面 + 符合人类思维的交互，一个都不能退化**。清单见 §4.4，迁移动作逐条对照 |
| 交互一致性 | 表单校验时机、焦点管理、键盘可达性（`onPress` 的 Enter/Space 语义）、空态/错误态反馈都要对齐 |
| 数据库 | 无 schema 变更、无数据迁移（`user.preferences.markdownEditor` 字段保留不动） |
| 分支/目录 | 建议从 `main` 切 `feat/nuxt-fe`；新目录 `fe-v2/`；`fe/` 原样保留直到验收通过 |
| 协作约定 | 代码由 subagent 分批写；**主 agent 只做复核，不跑测试/类型检查/lint/构建**；每批交付「启动命令 + 肉眼比对清单」，由人工验收 |
| 工具 | 组件文档走 Nuxt UI MCP（已配好：`opencode.json` 的 `nuxt-ui` → `https://ui.nuxt.com/mcp`） |

### 1.1 技术栈版本锁定（2026-09-29 已核实 npm 最新版）

| 包 | 版本 | 备注 |
|---|---|---|
| `nuxt` | `^4.5.2` | `ssr: false` |
| `@nuxt/ui` | `^4.11.2` | 已内置 `motion-v`、`@nuxt/icon`、`@nuxt/fonts`、`fuse.js`、`reka-ui`、`tailwindcss` |
| `pinia` + `@pinia/nuxt` | `^4.0.3` + `^1.0.2` | peer 匹配（`@pinia/nuxt@1.0.2` 要求 `pinia ^4.0.3`） |
| `motion-v` | `^2.5.1` | 显式声明，与 Nuxt UI 内置版本去重 |
| `@nuxtjs/color-mode` | `^4.0.1` | 明暗切换 |
| `tailwindcss` + `@tailwindcss/vite` | `^4.3.3` | **必须与旧版同 minor**，token 才能 1:1 |
| `md-editor-v3` | `^7.1.0` | Markdown 编辑器 + 只读渲染（自带 KaTeX） |
| `unplugin-icons` + `@iconify-json/lucide` | `^24.0.0` + `^1.2.136` | `compiler: 'vue'`，导入写法不变 |
| `vite-plugin-load-with-progress-bar` | `file:../../load-with-progress-bar/plugin` | 仓库外依赖，同深度可用 |
| `typescript` | `~5.9.x` | 跟随 Nuxt 4 官方模板，**不要升 7.x** |

字体：改用 `@nuxt/fonts`（Nuxt UI 已内置）自托管，替代现在不可达的 Google Fonts `<link>`。

> ⚠️ **安装注意**：`fe/node_modules` 与 `be/node_modules` 都是在 **Windows** 上安装的（`be/node_modules` 只有 `@esbuild/win32-x64`）。本仓库的 shell 在 WSL 下跑，**不要在 WSL 里执行 `npm install`**，否则会装成 Linux 原生二进制、破坏你在 Windows 上的开发。安装与 `dev` 都在你平时的环境里执行。

---

## 2. 已定决策

### 2.1 框架：Nuxt 4 + `ssr: false`

- 理由：Nuxt UI v4 只支持 Nuxt，Vue 形态基本锁死；本应用是**登录后使用的控制台**（localStorage / socket.io / WebAuthn / 视口 API 全在客户端），SSR 收益≈0 而坑很多；`ssr: false` 保留文件路由、Nuxt UI、auto-import、vite 插件能力，行为与现有 SPA 完全一致。
- 附带好处：`@internationalized/date`、`pinyin-pro`、`socket.io-client`、`@simplewebauthn/browser` 都是框架无关，可直接搬。

### 2.2 移除 `@mdxeditor/editor`，Markdown 编辑器改用 `md-editor-v3`

- 现状：`components/ui/MarkdownEditor.tsx` 按 `user.preferences.markdownEditor` 在 `uiw`（`@uiw/react-md-editor`）与 `mdxeditor` 之间切换，切换 UI 在 `components/settings/MarkdownEditorChoice.tsx`。
- 事实修正：`@uiw/vue-md-editor` **在 npm 上不存在**（404），不存在「uiw 的 Vue 版」。Vue 侧的 Markdown 编辑器改用 **`md-editor-v3` ^7.1.0**（Vue 3 + CodeMirror 6，自带 KaTeX 渲染、暗/亮主题、上传钩子）。
- 处理：
  - `MarkdownEditor.tsx` 重写为基于 `md-editor-v3` 的单一实现（可编辑 + 只读预览两种模式，对应现有的 `MarkdownEditor` / `Markdown` 两个组件）；
  - `MarkdownEditorChoice.tsx` 的二选一卡片移除（编辑器不再可切换）；
  - 后端偏好字段 `user.preferences.markdownEditor` 与 API **不动**（将来加回第三种编辑器无需数据迁移）；
  - `index.css` 中 106 行 `.mdx-editor-content` 覆盖（`index.css:323-428`）不带过去，改写为 `md-editor-v3` 的类名（`.md-editor`）亮/暗覆盖；
  - 只读渲染（`components/ui/Markdown.tsx`）继续用 `remark-math` + `rehype-katex` + `katex`（`md-editor-v3` 原生支持 KaTeX）。
  - 代价：编辑器外观与旧版 uiw 不同（属于允许的轻微差异），需专门调一版主题让观感精致。

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

> **兼容层锁「行为与语义」，不锁「像素」。** 视觉上以 Nuxt UI 默认形态 + 我们的品牌 token 为主；只在与动效、交互手感、信息密度强相关的地方做覆盖（例如自定义圆角/过渡时长/焦点环）。这样既省力，又不会把 HeroUI 的旧样式硬套成一个四不像。

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

### 4.4 体验资产清单（不可退化，迁移动作逐条对照）

> 这是本项目的「灵魂清单」。每一条都要在 Vue 端找到落点，并在对应 Phase 的验收里被肉眼确认。

#### A. 共享布局动画（`layoutId`）—— 最有辨识度的一组

| 位置 | 现状 | Vue 落点 |
|---|---|---|
| `AppShell.tsx:104` | 侧栏激活项背景块 `layoutId="nav-active"`，`transition={{ type:'spring', stiffness:400, damping:32 }}` | `motion-v` 的 `<motion.div layout-id="nav-active">` + spring |
| `AppShell.tsx:120` | 侧栏激活小圆点 `layoutId="nav-dot"` | 同上 |
| `AppShell.tsx:292,312` | 移动端底部导航 pill，同一个 `layoutId="mobile-nav-pill"` 在桌面/移动两棵导航树里复用（跨 DOM 位置共享动画） | `layout-id` + `<LayoutGroup>`；若跨树匹配不稳，降级为 `layout` + CSS transition，**视觉必须保留「滑动指示块」效果** |

`motion-v` 官方支持 `layout`、`layoutId`、`LayoutGroup`、spring、`AnimatePresence`（已核实），风险低。

#### B. 手势 / 按压反馈

- 现状：多处 `whileTap` / `whileHover`（AppShell 按钮、导航项、卡片等）。
- 落点：`motion-v` 的 `:while-tap="{ scale: 0.96 }"` / `:while-hover`；或全局 CSS `active:scale-[0.97] transition-transform`。**凡是能点的东西都要有按压反馈**——这是「手感」的主要来源。

#### C. 进出场动画

| 位置 | 现状 | 落点 |
|---|---|---|
| `LoginBrandPanel.tsx:14-25` | `AnimatePresence` + `motion.div` variants，背景元素无限循环漂移 | `AnimatePresence` + variants |
| `SlaveCard.tsx:7-11` | `layout` + 3D 进出场 | `layout` + `rotateX/scale/opacity` |
| `CheckinScreen` / `Checkin` | 页面级进场 | Nuxt UI 的页面过渡 + 自定义 |

#### D. 数值动画

- `ProgressRing.tsx:17-22`：`useSpring` + `useTransform` 驱动 SVG 圆环插值。
- 落点：`motion-v` 的 spring transition / 自写 `requestAnimationFrame` 缓动；SVG `stroke-dashoffset` 保持一致。

#### E. 循环 / 状态动画

- `MasterSlavePanel.tsx:84-91` 呼吸点（运行态指示）、`StepIndicator` 状态切换、验收运行态脉冲。
- 落点：CSS `@keyframes` 搬进 `main.css`（保留 `drift-*`、`fade-up`、`shimmer`），其余用 motion-v 的 `repeat: Infinity`。

#### F. CSS 背景与全局质感（`index.css` → `main.css`，逐条搬运）

- `.aurora`：两个 `blur(120px)` 径向渐变球 + `drift-a`(26s) / `drift-b`(32s) 无限漂移（全局背景，`main.tsx` 挂载）
- `.grid-overlay`：56px 网格 + `mask-image` 径向遮罩
- `.diagonal-bg`：签到页全屏斜线底
- `.glass`：顶栏与移动底部导航的玻璃拟态
- 自定义 `::-webkit-scrollbar`（宽 10px、thumb `--fg-subtle` + 2px 边框）
- `::selection` 与 `.dark ::selection` 两套高亮色
- `html { scroll-behavior: smooth }`、`body { font-feature-settings: "ss01","cv11","tnum" }`（Manrope 特性 + 表格数字等宽）
- `@theme inline` 内的 `fade-up`(ease-out-expo) 与 `shimmer` 两个 keyframes

#### G. 微交互清单

hover 态（`hover:text-fg` / `hover:bg-sunken/40` / `group-hover:*`）、`transition-colors` 过渡、`:focus-visible` 焦点环（**迁移后必须确认仍然清晰可见**）、`tabular` 等宽数字（成绩/学号/倒计时/分数）、`env(safe-area-inset-bottom)` 安全区、表格 sticky 表头与冻结首列、按钮 pending 内嵌 Spinner、Skeleton 加载态（24 处）、EmptyState（3 处）、`Tooltip delay={0} + showArrow`、icon-only + tooltip 按钮范式、`Chip` 状态标签。

#### H. 交互范式清单

- hover 展示时间线（实验状态 Chip，`delay={0}`）
- `Ctrl+Enter` 提交（`ScoreForm.tsx`）
- 300ms 防抖搜索（题库、设置题目）
- 搜索框自动聚焦（重点关注学生）
- tab 状态同步 URL query（题库页，刷新/分享保持）
- 拼音全拼 + 首字母搜索（`pinyin-pro` + `matchStudent`）
- toast 反馈（success / error / loading / promise）
- 危险操作二次确认弹窗
- 登录失败、通行密钥错误的即时提示
- 课程切换器、侧栏折叠、状态记忆（localStorage）

#### I. 免费获得的 Nuxt UI 动效

Modal / Drawer / Slideover 弹出、Popover 与 Tooltip、Select 下拉、Toast 进出场、Tabs 指示器、Accordion 展开、Skeleton pulse、Switch 与 Checkbox 切换——这些自带过渡，**不要用自定义 class 覆盖掉**。

#### J. 需要补齐的差异点（Nuxt UI 默认 ≠ 我们的手感）

| 差异 | 处理 |
|---|---|
| `USkeleton` 默认 pulse 与旧版观感不同 | `app.config.ts` 里覆盖 `ui.skeleton`，回到 shimmer 观感 |
| 按钮按压反馈可能偏弱 | 全局 `active:scale-[0.97]` + `transition-transform` |
| 焦点环样式不同 | 全局统一 `:focus-visible` 规则（品牌色 + 偏移） |
| 圆角/过渡时长全局不统一 | 在 `@theme inline` 里统一 `--radius` 与过渡基准，避免各组件各一套 |

### 4.5 兼容层 API 契约（**并行开发的唯一约定**）

> 规则：**实现方（Phase B）必须严格照这张表实现；使用方（Phase C 页面）必须严格照这张表调用。**
> 谁都不许临时换成 Nuxt UI 原生组件、不许改名、不许改 prop 名。发现表不够用时**先改这张表**再改代码，并在文件头注释里标注偏离原因。
> 表格里凡是写「←」的都是从旧版 11.8k 行代码里实测出来的用法，不是设计幻想。

#### 通用约定

- 组件标签不带目录前缀（`pathPrefix: false`）：`app/components/ui/Xxx.vue` → `<Xxx>`。
- `class` 一律透传到**最内层的原生元素**（与 HeroUI 语义一致：旧版 `className` 加在哪个 DOM 上，新版就加在哪）。
- 布尔 prop 一律支持无值写法（`<AppCheckbox is-selected />`）。
- 旧版的 `isDisabled` / `isSelected` / `isPending` / `isIndeterminate` / `isIconOnly` / `isActive` / `fullWidth` **保留 `is` 前缀**（HeroUI 语义），不要改成 Nuxt 的 `disabled`/`modelValue`。
- 事件一律用 Vue 命名：`update:open` / `update:is-selected` / `press` / `open-change`。
- 每个组件文件头必须写「旧 props/slots → 新 props/slots → 底层 Nuxt UI 组件 + `ui` 覆盖」三段对照。

#### 1. `AppModal`（← `Modal` + `Modal.{Container,Dialog,Backdrop,Body,Header,Heading,Icon,Footer,CloseTrigger}`，全站 11 套）

旧版是 8 个子组件的复合结构；新版**收敛成单组件 + 具名插槽**，视觉等价但调用简单得多。

```
props: open: boolean                     // 受控，必需（配合 useOverlayState）
       size?: 'sm'|'md'|'lg'|'xl'|'full'  默认 'md'
       scroll?: 'inside'|'outside'        默认 'inside'（旧版多数 Dialog 可滚）
       hideClose?: boolean                默认 false
emits: update:open                        // 关闭/打开（遮罩点击、Esc、关闭按钮统一走它）
slots: header   // 标题区（旧版 Header+Heading+Icon 三合一）
       icon     // 标题左侧图标（旧版 Modal.Icon，10 处用）
       default  // 正文（旧版 Modal.Body）
       footer   // 底部按钮（旧版 Modal.Footer，10 处用）
```
- 底层 `UModal`（`v-model:open` + `#header`/`#body`/`#footer` + `:ui` 覆盖圆角/边框/阴影到本站 token）。
- **关闭语义**：`useOverlayState` 提供的 `onOpenChange(false)` 必须挂到 `@update:open`，这样旧版 `onClose` 里的重置逻辑（清空表单、清 timer）不会丢。
- 旧版 `<Button slot="close">` 取消/完成 → 新版就是普通 `@press` 里调 `onOpenChange(false)`，**不需要** slot 机制。
- 旧版 `Modal.CloseTrigger`（11 处）→ 新版 `hideClose` + 右上角 X 按钮自带。

#### 2. `useOverlayState`（← 旧版同名 composable，11 处 Modal 状态机）

```
const state = useOverlayState()
// state.isOpen / state.onOpenChange(open: boolean) / 旧版其它字段（见旧文件）
```
- 返回值结构与旧版**完全一致**（逐个旧文件抄字段名），只把 `useState` 换成 `ref`、`onOpenChange` 的实现改成「emit `update:open`」。

#### 3. `AppSelect`（← `Select` + `Select.{Trigger,Value,Indicator,Popover,ClearButton}` + `ListBox`，17 处）

```
props: modelValue: string | number | null          // v-model；旧版 onChange 给的是 key
       items: { label: string; value: string|number; disabled?: boolean; [extra]: unknown }[]
       placeholder?: string
       isDisabled?: boolean
       isClearable?: boolean                       // 旧版 Select.ClearButton
       size?: 'sm'|'md'|'lg'                        默认 'md'
emits: update:modelValue, clear
slots: item   // 作用域 { item, selected }，自定义单项（班级名 truncate 等）
       trigger // 完全自定义触发区（可选；默认内置 trigger+value+indicator）
```
- 底层 `USelect`（`items` + `#item` + `clearable`）。**注意**：旧版 `onChange` 返回 key（string），`USelect` 返回 value，两边都用 `value` 字段做 key，语义一致。

#### 4. `AppAutocomplete`（← `Autocomplete` + `Autocomplete.{Filter,ClearButton,Indicator,Popover,Value,Trigger}`，7 处：FocusStudents / StudentFinder / QuestionDrawer）

```
props: modelValue: string | number | null          // v-model，选中项的 value
       items: { label: string; value: string|number; keywords?: string; [extra]: unknown }[]
       placeholder?: string
       isDisabled?: boolean
       isClearable?: boolean
       emptyText?: string                           // 空结果文案
emits: update:modelValue
slots: item   // 作用域 { item, selected }
```
- **筛选**：`useFilter` 负责（见下）；拼音/首字母匹配由 `~/lib/pinyin` 提供，页面通过 `items[].keywords` 传候选关键字。`FocusStudents` / `StudentFinder` 必须能按「姓名拼音 + 首字母 + 学号」搜到人（对照旧版 `matchStudent`）。
- 底层：`UInput`（带 `icon`）+ `UCommandPalette` 或 `UListbox` 弹层（用 MCP 核实哪个更适合「输入即筛选 + 键盘上下选择」，并在文件头写明选择理由）。

#### 5. `useFilter`（← HeroUI `useFilter` + 旧版 pinyin 匹配）

```
const { contains, startsWith, fuzzy } = useFilter({ sensitivity?: 'base'|'accent'|'case' })
contains('haystack', 'needle') -> boolean
```
- 内部：先走中文拼音候选（`~/lib/pinyin` 的 `pinyin` / 首字母），再走不区分大小写的子串 + 模糊匹配。`Autocomplete` / 题目搜索 / 学生搜索都走它。
- 允许直接用 `@nuxt/ui` 已内置的 `fuse.js`，但**必须**保留拼音候选逻辑（`filter` prop 的旧行为）。

#### 6. `AppTabs`（← `Tabs` + `Tabs.{ListContainer,List,Tab,Indicator,Panel}`，9 处；`Questions` 页 tab 同步 URL）

```
props: modelValue: string        // v-model，= 旧版 selectedKey
       items: { label: string; value: string; icon?: Component; disabled?: boolean }[]
emits: update:modelValue
slots: tab     // 作用域 { item, active }（默认渲染 label，可加图标）
       panel   // 作用域 { item, active }（旧版 Tabs.Panel）
```
- 底层 `UTabs`。`Questions` 页要 tab ↔ URL query 双向同步，靠 `v-model` + `watch` 实现，`AppTabs` 本身不碰路由。

#### 7. `AppPagination`（← `Pagination` + `Pagination.{Content,Item,Link,Ellipsis,Previous,PreviousIcon,Next,NextIcon}`，12 处）

```
props: page: number                       // v-model:page，1 起
       total: number                      // 总条数
       siblingCount?: number              默认 1
       boundaries?: number                默认 1
       showEdges?: boolean                默认 true
       size?: 'sm'|'md'|'lg'              默认 'md'
       class?: string                     // 旧版 className="mt-4 justify-center"
emits: update:page
slots: item  // 作用域 { page, isActive }（自定义页码按钮内容；旧版 Pagination.Link）
```
- 底层 `UPagination`（`v-model:page` + `:page-count` + `:sibling-count` + `:total`）。旧版 `onPress` → `@update:page`。

#### 8. `AppCheckbox`（← `Checkbox` + `Checkbox.{Content,Control,Indicator}`，16 处）

```
props: modelValue: boolean | 'indeterminate'   // v-model；旧版 isIndeterminate
       isDisabled?: boolean
emits: update:modelValue
```
- 底层 `UCheckbox`（三态用 `indeterminate` prop，值用 `'indeterminate'` 哨兵——**在文件头写清**这个映射）。
- 旧版把 `Checkbox.Content` 当**可点整行**（`aria-label` + `mt-0.5`）：新版用 `<label>` 包 `UCheckbox` + `class` 透传保证点击区域一致。

#### 9. `AppAccordion`（← `Accordion` + `Accordion.{Item,Trigger,Heading,Indicator,Body,Panel}`，7 处 `LlmConnect`）

```
props: items: { label: string; value: string; icon?: Component; disabled?: boolean }[]
       type?: 'single'|'multiple'             默认 'multiple'（旧版 allowsMultipleExpanded）
emits: none（受控 value 由页面自己管；提供 v-model:modelValue: string[]）
slots: body  // 作用域 { item, open }
```
- 底层 `UAccordion`。旧版 `variant="surface"` → `:ui` 里给内容区加 `bg-sunken border border-line rounded-xl` 之类。

#### 10. `AppSlider`（← `Slider` + `Slider.{Track,Fill,Thumb}`，4 处 `ScoreForm`）

```
props: modelValue: number          // v-model
       minValue?: number           默认 0（旧版 prop 名 minValue）
       maxValue?: number           默认 100
       step?: number               默认 1
       isDisabled?: boolean
emits: update:modelValue
```
- 底层 `USlider`。旧版 `SCORE_MAX` 来自 `~/lib/scores`。
- 旧版 `.score-slider` 的自定义样式（`index.css` 里 53 行、**0 处使用**）不搬；`ScoreForm` 原来就是裸 `Slider`，用 Nuxt UI 默认观感即可。

#### 11. `AppInputOTP`（← `InputOTP` + `InputOTP.{Group,Slot,Separator}`，10 处：`Checkin` 6 位码、`ScoreForm` 等）

```
props: modelValue: string          // v-model
       length?: number             默认 6
       inputMode?: 'numeric'|'text' 默认 'numeric'
       pattern?: RegExp            逐位过滤（旧版 pattern=REGEXP_ONLY_DIGITS）
       autoFocus?: boolean
emits: update:modelValue
slots: separator // 分隔符（默认第 3 位后插 '-'，旧版 InputOTP.Separator）
```
- 底层 `UPinInput`（`v-model:model-value` + `length` + `type`）。

#### 12. `AppListBox`（← `ListBox` + `ListBox.{Item,ItemIndicator}`，14 处）

```
props: items: unknown[]
       selectionMode?: 'none'|'single'|'multiple'   默认 'none'
       modelValue?: unknown                        // 受控（multiple 时是数组）
emits: update:modelValue, action   // action(item) —— 旧版 onAction(key)
slots: item  // 作用域 { item, selected, toggle, select }
```
- 底层 `UListbox`。**参考实现已在 `pages/console/more.vue`**（`:items` + `#item` + `:highlight-on-hover="false"`），照它的写法建组件。

#### 13. `AppDateTimePicker`（← `DatePicker.{Trigger,Popover,TriggerIndicator}` + `Calendar.*` + `DateField.{Group,Segment}`，`components/ui/DateTimePicker.tsx` 内部 4 层 render-prop）

```
props: modelValue: ZonedDateTime | null       // v-model，用 @internationalized/date
       label?: string
       granularity?: 'minute'|'hour'|'day'     默认 'minute'（旧版两种粒度）
       isDisabled?: boolean
       class?: string
emits: update:modelValue
```
- 底层：`UCalendar`（或 `UCalendarRange`）+ 自己写的 segment 输入；**必须**用 `@internationalized/date` 的 `ZonedDateTime` / `DateFormatter` / `today()` / `getLocalTimeZone()`。
- 交互要求（对照旧版）：点触发器开面板、面板里上/下月切换、点日期+时分段、`Enter` 确认、`Esc` 关闭、底部「现在」快捷项、非法值回退到当前时间。
- 这是唯一一个**自写**的兼容层组件，Nuxt UI 没有等价物。单独立一个 subagent 做。

#### 14. Phase B 还要搬的 `lib`（1:1，函数名/类型名不许改）

| 文件 | 行数 | 导出 | 注意 |
|---|---|---|---|
| `app/lib/scores.ts` | 11 | `SCORE_MAX` `SCORE_TYPES` `scoreKey()` | 纯常量 |
| `app/lib/experiments.ts` | 92 | `TIMELINE_BUFFER_DAYS` `ExperimentTimelineEvent/Status/Info` `experimentTimeline()` `formatTimelineTime()` | 纯函数，含「今天」判定与状态推导 |
| `app/lib/totp.ts` | 89 | `totp()` `useTotp()` | `useTotp` 是 hook → Vue `ref` + 定时器，**必须在 `onScopeDispose`/`onUnmounted` 清理定时器** |
| `app/lib/passkey.ts` | 37 | `getAuthenticationOptions()` `registerPasskey()` | ⚠️ A3 的 `LoginPanel.vue` / `setup.vue` 目前把 `getAuthenticationOptions` **内联**了，本文件建好后请让这两个文件改成 import（Phase B 收尾时由主 agent 统一改） |
| `app/lib/realtime.ts` | 42 | `ScoreChangeEvent` `connectScoreSocket()` `disconnectScoreSocket()` `subscribeScores(socket)` | 旧版是模块级单例 socket，Vue 端保持单例语义 |
| `app/lib/checkoff-socket.ts` | 214 | `SlaveCardState` `getCheckoffSocket()` `MasterSession` `useCheckoffMaster()` `CheckoffStartedEvent` `useCheckoffWatch()` `notifyCheckoffStarted()` `useCheckoffSlave()` | **最高风险**：三套状态机。React `useEffect` 依赖数组 → Vue `watch` 源数组；清理逻辑放 `onScopeDispose` |

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
| `motion` | `motion-v` ^2.5.1（`@nuxt/ui` 已内置 ^2.4.4，`package.json` 里显式声明同一 major 以去重） | 低：官方支持 `layout` / `layoutId` / `LayoutGroup` / spring / `AnimatePresence` / 手势（已核实） |
| `next-themes` | `@nuxtjs/color-mode` | 低（要保证 `<html class>` 注入时机） |
| `sonner` | Nuxt UI `useToast` | 低（外观按 2.4 校准） |
| `@uiw/react-md-editor` + `@mdxeditor/editor` | `md-editor-v3` ^7.1.0（mdxeditor 选项已移除） | 中：主题/KaTeX/工具栏外观与旧版有差异，需专门写一版精致主题 |
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

> 进度：**A1 / A2 / A3 全部完成**（脚手架+地基 / 兼容层 10 件 / AppShell+登录+初始化+条款）。下一个 Phase 是 B。
> 复核记录：`api.ts` 563 行导出符号与旧版完全一致；`main.css` 的 `:root` / `.dark` / `@theme inline` 三块逐字一致（已用脚本比对）；A3 的 `console.vue` / `LoginPanel.vue` 由主 agent 逐行读过。
> ⚠️ A3 执行时 subagent 自行跑了 `npm install`：装出来的是 **win32-x64** 原生绑定（`@esbuild/win32-x64`、`@tailwindcss/oxide-win32-x64-msvc`），即在 Windows 侧完成，`fe-v2/node_modules` 可直接用于你的 Windows 开发；`package-lock.json` 已按仓库惯例（`fe/package-lock.json` 也入库）提交。

- [x] `fe-v2/` 脚手架：Nuxt 4 + `@nuxt/ui` + Tailwind v4 + `unplugin-icons`(vue) + `vite-plugin-load-with-progress-bar`；`package.json` / `tsconfig` / `public/` / `.gitignore` / `README.md`（**`npm install` 由用户在 Windows 侧执行**）
- [x] `nuxt.config.ts`：`ssr: false`、`css`、`vite.plugins`、`vite.server.proxy`（`/api`、`/socket.io`(ws)、`/mcp` → `localhost:3001`）、`colorMode: { classSuffix: '' }`、`icon.clientBundle.scan`、`fonts`、devServer 5173
- [x] `app/assets/css/main.css`：逐字搬运 `fe/src/index.css`（Nuxt UI CSS 在前、自定义 `@theme inline` 在后；`.score-slider` / `.mdx-editor-content` 不带过去）；末尾追加全局焦点环 + 按压反馈兜底（`:where()` + `@layer utilities`，支持 `data-no-press` 退出）
- [x] `app.config.ts`：`ui.colors.primary='brand'`、`ui.toast` 玻璃拟态（追加合并写法）、`ui.skeleton` 换 shimmer
- [x] 字体：`@nuxt/fonts` 配置三套字体的自托管（替代 Google Fonts `<link>`）—— 待用户 `npm run dev` 后确认实际生效
- [x] 兼容层前 6 个（实际做了 10 个）：`AppButton` `AppInput` `AppChip`（→ `UBadge`）`AppTooltip` `AppSwitch` `AppLabel`（→ 原生 `<label>`，Nuxt UI 无 `Label`）+ `Card` `EmptyState`（从旧版 `Card.tsx` 拆出）`PageHeader` `ThemeToggle`；外加 `composables/useToasts.ts`（sonner → Nuxt UI toast 封装，Phase B 替换 115 处调用时用）
- [x] `app/layouts/console.vue` 完整实现（← `AppShell.tsx` 327 行）+ `app/layouts/default.vue`
- [x] `components/auth/{LoginPanel,LoginBrandPanel}.vue` + `pages/{login,setup,terms}.vue` + `content/terms.ts` + `components/ui/Markdown.vue`（只读渲染器，A3 提前落地，Phase D 只做可编辑器 + 精调）
- [x] `app/middleware/auth.global.ts`（← `RequireAuth` + `RedirectIfAuthed`，白名单 `/terms` `/checkin*`，回跳 `?redirect=`）
- [x] 路由骨架：`index` / `[...all]` / `login` / `setup` / `terms` / `console/*` / `checkin/*` 空壳页
- [x] `app/app.vue`：`<UApp :toaster="{ position: 'bottom-right' }">` + `aurora` + `grid-overlay`（`UApp` 内部已渲染 `UToaster`，不要重复挂）
- [x] `app/stores/{auth,app}.ts` + `plugins/app-store-persist.client.ts`（localStorage key `tasaas.app`，结构与 zustand persist 兼容）
- [x] `app/composables/{useCurrentClass,useHasXzzdPermission}.ts`、`app/lib/{api,zjuam,last-user,pinyin,utils,nav}.ts`
- [x] A2：兼容层 6 个组件 + `components/ui/{Card,EmptyState,PageHeader,ThemeToggle}.vue` + `composables/useToasts.ts`
- [x] A3：`AppShell` 完整移植 + `More` + `Login` + `Setup` + `Terms`

### A 批落地时确认的事实（给 Phase B/C 直接用，别再重复调研）

| 事实 | 说明 |
|---|---|
| `AppButton` 默认 `variant='primary'` | 依据：旧版 22 处不写 variant，且 `LlmConnect.tsx:680` 的「完成」不写、同页「取消」写 `secondary` |
| HeroUI `.input` **默认不整宽** | 只有 `.input--full-width` 才 `w-full`。所以 `AppInput` 的做法是：内部 `<input>` 给 `w-full`，外层 wrapper 在页面写了定宽类（`w-16` 等）时收成 `w-fit` |
| HeroUI Button 的 `isPending` **不自带 spinner** | 旧版 30 处靠 render-prop 手写 `<Spinner>`；`data-pending` 只给 `status-pending` 样式。Nuxt UI 的 `loading` 自带 spinner 且保留文字，观感更好 → 迁移时删掉手写 Spinner |
| HeroUI 无 `Label` / `Chip` 同名组件 | `AppLabel` → 原生 `<label>`；`AppChip` → `UBadge`（Nuxt UI 的 Chip 是状态点） |
| 全站只有 `AppShell` 用 `Dropdown`（5 处） | 直接用 `UMenu` + `UDropdownMenu`，**不建 `AppDropdown`** |
| `UDropdownMenu` 没有受控单选 | 无 `modelValue`；勾选项用 `type:'checkbox'` + item 上的 `checked` / `onSelect`（`onUpdateChecked` 存疑，故 `onSelect` 兜底）。勾选标记在**行尾**（HeroUI 在行首，可接受差异） |
| `UListbox` 是 `ListBox` 的正确替代 | `pages/console/more.vue` 已是参考写法：`:items` + `#item` 作用域插槽 + `:highlight-on-hover="false"`；Phase B 的 `AppListBox` 按这个模式建 |
| `AppTooltip` 有 `disabled` prop | 侧栏导航项用 `:disabled="!sidebarCollapsed"` 一套树搞定两种状态，避免维护两套 JSX |
| `md-editor-v3@7.1.0` 只读渲染（已读源码确认） | `MdPreview` props：`modelValue`(必填) / `theme` / `previewTheme` / `noMermaid` / `noKatex` / `codeTheme` / `sanitize` …；必须 `import 'md-editor-v3/lib/preview.css'`；**katex 默认走 CDN**，要本地化：`config({ editorExtensions: { katex: { instance: katex } } })` + `import 'katex/dist/katex.min.css'`；可选预览主题：`default` / `vuepress` / `github` / `cyanosis` / `mk-cute` / `smart-blue` |
| `motion-v` 显式 import | Nuxt 不自动导入 `motion-v`，每个用到的地方写 `import { motion, AnimatePresence } from 'motion-v'` |
| 表单校验不引 zod | 依赖里没有 zod。`LoginPanel` / `Setup` 用普通 `validate()` 函数 + 红色 inline 文案（`text-xs text-danger`）+ 输入框 error 描边 + `<form novalidate>` |
| 全局 `import` auto-import 已开 | A2 的组件里写了 `import { computed } from 'vue'`，无害，不去动 |

**验收点**：① 明/暗两套主题下按钮、输入框、卡片、侧栏与旧版气质一致；② 未登录访问 `/console/scores` → 跳 `/login?redirect=/console/scores`，登录后回跳；③ `/terms`、`/checkin` 不被守卫拦截；④ 未知路径回落 `/console`；⑤ 桌面/移动两套导航都出现且高亮正确；⑥ **动效基线**：`aurora` 背景漂移、`.glass` 顶栏、导航激活块的 `layoutId` 滑动、按钮按压反馈、focus-visible 焦点环、骨架 shimmer 全部到位。

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

- [x] `ui/Markdown.vue`（只读渲染 + 本地 KaTeX + token 覆写样式，A3 已提前落地）
- [ ] `ui/MarkdownEditor.vue`（可编辑，← `MarkdownEditor.tsx`）+ `.md-editor` 亮暗主题精调（不能是「默认丑」）
  - 已有基础：`MdPreview` 的用法与 katex 本地化已确认（见上表）；编辑器用同包的 `MdEditor`，主题走 `theme` + `previewTheme` 双参
  - ⚠️ 旧版的 `remark-math` + `rehype-katex` 不再需要（md-editor-v3 内置 markdown-it + katex），`package.json` 不必补这两个包
- [ ] `content/terms.ts`
- [ ] 全站走查：逐页明/暗主题对照清单；`tabular`、滚动条、`env(safe-area-inset-bottom)`、focus-visible 等细节
- [ ] **§4.4 体验资产清单逐条签收**：A~I 每项确认落地
- [ ] 清理：确认未带入死代码；`be/` diff 为空校验

### Phase E — 切换

- [ ] 文档/脚本：README、`opencode.json` 无关项、启动与部署说明（静态托管指向 `fe-v2`）
- [ ] `fe/` 归档（建议 `git mv fe legacy/fe-react` 或打 tag 保留）或删除 —— 待人工验收后决定
- [ ] 旧分支收尾

---

## 8. 风险登记

| # | 风险 | 影响 | 应对 |
|---|---|---|---|
| 1 | `@mdxeditor/editor` 无 Vue 绑定；`@uiw/vue-md-editor` 不存在（npm 404） | 中 | 已决策：移除 mdxeditor 选项，编辑器统一用 `md-editor-v3`，主题单独精调 |
| 2 | **动效/交互在迁移中被稀释**（Nuxt UI 默认观感更平、组件重写时最容易丢 hover/按压/进场动画） | **高（体验）** | §4.4 清单逐条对照；Phase A 建立动效基线；Phase D 逐条签收 |
| 3 | HeroUI ↔ Nuxt UI 默认圆角/阴影/字号/焦点环/过渡不一致 | 中（视觉） | 允许轻微差异；只在 `@theme inline` 与 `app.config.ts` 统一全局基准，不逐页硬调 |
| 4 | `AppDateTimePicker`（Nuxt UI 无 segment 式时间输入） | 中高 | 用 `@internationalized/date` 自写一层，交互手感对齐现版 |
| 5 | `motion` `layoutId` 跨 DOM 分支复用（`mobile-nav-pill`） | 低 | `motion-v` 官方支持 `layoutId`/`LayoutGroup`（已核实）；不稳定则退化为 `layout` + CSS transition |
| 6 | `Autocomplete` + 拼音搜索语义差异 | 中 | 自实现 `useFilter`（可用 Nuxt UI 已内置的 `fuse.js`），接 `lib/pinyin.ts` |
| 7 | `checkoff-socket.ts` 214 行三套状态机（effect 依赖数组语义差异） | 中高 | 逐行对照翻译，`onMounted/onUnmounted` 精确清理，重点人工联调 |
| 8 | toast 统一到 Nuxt UI（外观必然有差异） | 低 | `app.config.ts` 调成玻璃拟态，压缩差异 |
| 9 | 无 CI / 无自动化回归 | 中 | 每批交付肉眼比对清单；Phase D 可选补 Playwright 截图对比 |
| 10 | `load-with-progress-bar` 是仓库外 `file:` 依赖 | 低 | 同深度相对路径继续可用；若要解耦改为可选插件 |
| 11 | Google Fonts 国内不可达 | 低 | 改 `@nuxt/fonts` 自托管 |
| 12 | WSL 装依赖会污染 Windows 环境（`node_modules` 原生二进制） | 中 | 一律在 Windows 侧执行 `npm install` / `npm run dev` |
| 13 | 长时间迁移中 `be/` 继续演进导致 API 漂移 | 低 | 每 Phase 结束同步一次 `api.ts` 与 `be/src/routes/*` |

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
