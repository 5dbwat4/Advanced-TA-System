# 图标迁移指南：字符串 `<Icon>` → `unplugin-icons` 直接导入

> 面向执行此改动的 subagent。目标：把全部字符串写法改为直接导入组件，并删除包装组件 / 注册表 / 生成脚本。

## 0. 背景与目标

当前：所有图标走 `src/components/ui/Icon.tsx` 包装组件，传字符串，如 `<Icon icon="lucide:cpu" />`；为 tree-shaking，`scripts/gen-icons.mjs` 扫描源码生成 `src/components/ui/icon-registry.ts` 注册表。

目标：**全部改为直接导入**，如 `import Cpu from '~icons/lucide/cpu'`，JSX 中直接使用组件。完成后删除包装组件、注册表与生成脚本。

> 说明：两种方案最终产物大小一致（都只打包用到的图标）。本改动是写法统一、去掉代码生成，**不追求更小的包**。

## 1. 不要改动的配置

- `fe/vite.config.ts`：`Icons({ compiler: 'jsx', jsx: 'react', autoInstall: false })`
- `fe/tsconfig.app.json`：`"types": ["vite/client", "unplugin-icons/types/react"]`
- 依赖：`unplugin-icons`、`@svgr/core`、`@svgr/plugin-jsx`、`@iconify-json/lucide`（后者提供**本地**图标数据，禁止改成在线 API）

## 2. 导入约定

- `icon="lucide:shield-check"` ↔ `import ShieldCheck from '~icons/lucide/shield-check'`
- 标识符 = kebab 转 PascalCase：`settings-2` → `Settings2`，`x` → `X`，`chevron-right` → `ChevronRight`
- 别名可直接导入：`trash-2`、`help-circle`、`fingerprint`、`message-circle-question`（等价父名：`trash` / `circle-question-mark` / `fingerprint-pattern` / `message-circle-question-mark`）

## 3. 核心转换规则

### 3.1 静态用法

Before：
```tsx
import { Icon } from '@/components/ui/Icon'
// ...
<Icon icon="lucide:cpu" width={20} className="text-fg-muted" />
```

After：
```tsx
import Cpu from '~icons/lucide/cpu'
// ...
<Cpu width={20} height={20} className="shrink-0 text-fg-muted" />
```

三个必须遵守的点：

1. **必须补 `height`**（保持正方形）
   原包装组件同时设置 `width` 和 `height`；unplugin-icons 生成的组件默认 `width="1.2em" height="1.2em"`。若只传 `width`，高度会是 `1.2em` 导致变形。**始终写成 `width={n} height={n}`**。

2. **必须补 `shrink-0`**
   原 `Icon` 内部是 `cn('shrink-0', className)`，直接导入的 SVG 没有这个类。
   - 原本无 className → 加 `className="shrink-0"`
   - 原本有 className → 合并：`className="shrink-0 text-fg-muted"`
   - 原本是动态/模板拼接 → 用 `cn('shrink-0', ...)`（`import { cn } from '@/lib/utils'`）

3. **删掉不再使用的 `Icon` import**（该文件可能不再需要它）

> 默认 width=18 无需保留：现有调用点**全部**显式传了 `width`。

### 3.2 条件（三元）用法

```tsx
<Icon icon={cond ? 'lucide:x' : 'lucide:plus'} width={16} />
```
改成：
```tsx
{cond ? <X width={16} height={16} className="shrink-0" /> : <Plus width={16} height={16} className="shrink-0" />}
```

### 3.3 数据数组 / 映射里的图标

字段类型 `string` → `IconComponent`（见 §4），值改成组件引用。

Before：
```tsx
const TYPES = [
  { value: 0, label: '功能测试', icon: 'lucide:clipboard-check' },
]
// ...
<Icon icon={type.icon} width={15} />
```

After：
```tsx
import ClipboardCheck from '~icons/lucide/clipboard-check'
import type { IconComponent } from '@/lib/icon'

const TYPES: { value: number; label: string; icon: IconComponent }[] = [
  { value: 0, label: '功能测试', icon: ClipboardCheck },
]
// ...
<type.icon width={15} height={15} className="shrink-0" />
```

> JSX 成员表达式 `<type.icon />` 合法（点号表达式按组件处理）。若不习惯，可在 map 回调里 `const Ico = type.icon` 后 `<Ico ... />`。

### 3.4 接收 `icon` 属性的公共组件

把 `icon: string` 改为 `icon: IconComponent`，内部用**大写别名**渲染。

```tsx
import type { IconComponent } from '@/lib/icon'

export function EmptyState({ icon: Ico, title, hint }: { icon: IconComponent; title: string; hint?: string }) {
  // ...
  <Ico width={20} height={20} className="shrink-0" />
}
```

调用点改成传组件：
```tsx
import School from '~icons/lucide/school'
<EmptyState icon={School} title="尚未绑定班级" hint="..." />
```

涉及 3 个公共组件：
- `src/components/ui/Card.tsx` → `EmptyState`
- `src/components/console/StatCard.tsx` → `StatCard`
- `src/components/checkoff/PreferenceOnboarding.tsx` → `ChoiceCard`（`showIcon` 逻辑保持不变）

## 4. 新增共享类型

新建 `src/lib/icon.ts`：

```ts
import type { ForwardRefExoticComponent, SVGProps } from 'react'

export type IconComponent = ForwardRefExoticComponent<
  SVGProps<SVGSVGElement> & { title?: string }
>
```

（与 `unplugin-icons/types/react` 的声明一致；用于数组字段与组件 props。）

## 5. 重点动态位置（易漏，务必逐一处理）

- `src/components/layout/AppShell.tsx`
  - `NAV_ITEMS`：`icon: string` → `IconComponent`
  - L217 三元 `panel-left-open` / `panel-left-close`
  - L224 `school`；L300 `<Icon icon={item.icon} .../>`
- `src/components/ui/ThemeToggle.tsx` L31：`moon` / `sun` 三元
- `src/components/auth/LoginPanel.tsx`
  - `ROLES`、`METHODS`：`icon: string` → `IconComponent`
  - L180 三元 `book-open-check` / `shield-check`
- `src/components/checkoff/ScoreForm.tsx`：`TYPES`（`icon: string`）+ L100 `type.icon`
- `src/components/checkoff/QuestionDrawer.tsx`：`MARK_META`（`icon: string`）+ L66 `meta.icon` + L89 三元 `eye-off` / `eye`
- `src/components/checkoff/StepIndicator.tsx`：`STEPS`（`icon: string`）
- `src/pages/Dashboard.tsx`：actions 数组（`icon: string`）+ L90 `action.icon`
- `src/components/checkoff/PreferenceOnboarding.tsx`：`ChoiceCard` 的 `icon` prop（见 §3.4）
- `src/components/checkoff/MasterSlavePanel.tsx` L110：三元 `check` / `copy`
- `src/pages/Questions.tsx`：L182 `x`/`plus`；L339 `eye-off`/`eye`；L491 `x`/`plus`；L663 `chevron-up`/`settings-2`
- `src/pages/Setup.tsx` L121：三元 `check` / `plus`
- `src/pages/Experiments.tsx` L84：三元 `x` / `plus`
- `src/pages/LlmConnect.tsx` L493：三元 `sparkles` / `key-round`
- `src/components/ui/Card.tsx` L38、`src/components/console/StatCard.tsx` L36：公共组件 `icon` prop

> 以命令结果为准，不要只依赖本清单：
> `rg -n "lucide:" fe/src`

## 6. 清理

- 删除 `src/components/ui/Icon.tsx`
- 删除 `src/components/ui/icon-registry.ts`
- 删除 `scripts/gen-icons.mjs`
- `fe/package.json` 移除 `predev`、`prebuild`、`gen:icons` 三个脚本；保留 `build: "tsc -b && vite build"`

## 7. 验证

1. `rg -n "lucide:" fe/src` → 无结果
2. `rg -n "components/ui/Icon" fe/src` → 无结果
3. `rg -n "gen-icons|icon-registry" fe` → 无结果
4. `npm run build`（`fe/`）通过（`tsc -b` 无错 + vite build 成功）
5. `rg "iconify\.design" fe/dist` → 0
6. `dist/assets/*.js` 约 2.4MB（gzip ≈820KB），不得明显增大
7. 抽查 UI（`npm run dev`）：侧边栏、空状态、主题切换、登录页、设置页。重点确认图标尺寸（`height`）与是否被压缩（`shrink-0`）无回归

## 附录 A：名称 → 导入标识符（76 个）

```text
activity -> Activity
arrow-left -> ArrowLeft
arrow-right -> ArrowRight
arrow-up-right -> ArrowUpRight
book-open -> BookOpen
book-open-check -> BookOpenCheck
bot -> Bot
check -> Check
chevron-down -> ChevronDown
chevron-left -> ChevronLeft
chevron-right -> ChevronRight
chevron-up -> ChevronUp
circle-check -> CircleCheck
circle-question-mark -> CircleQuestionMark
circuit-board -> CircuitBoard
clipboard-check -> ClipboardCheck
clipboard-list -> ClipboardList
cloud-upload -> CloudUpload
construction -> Construction
copy -> Copy
cpu -> Cpu
dices -> Dices
ellipsis -> Ellipsis
eye -> Eye
eye-off -> EyeOff
file-text -> FileText
fingerprint-pattern -> FingerprintPattern
flask-conical -> FlaskConical
graduation-cap -> GraduationCap
hard-drive -> HardDrive
id-card -> IdCard
info -> Info
key-round -> KeyRound
laptop -> Laptop
layout-dashboard -> LayoutDashboard
library -> Library
list-checks -> ListChecks
lock -> Lock
log-in -> LogIn
log-out -> LogOut
message-circle-question-mark -> MessageCircleQuestionMark
minus -> Minus
monitor-play -> MonitorPlay
monitor-smartphone -> MonitorSmartphone
moon -> Moon
notebook-text -> NotebookText
panel-left-close -> PanelLeftClose
panel-left-open -> PanelLeftOpen
pen -> Pen
pen-line -> PenLine
pencil -> Pencil
plus -> Plus
refresh-cw -> RefreshCw
rocket -> Rocket
scan-search -> ScanSearch
school -> School
scroll-text -> ScrollText
search -> Search
search-x -> SearchX
settings-2 -> Settings2
shield-check -> ShieldCheck
shuffle -> Shuffle
skip-forward -> SkipForward
sliders-horizontal -> SlidersHorizontal
smartphone -> Smartphone
sparkles -> Sparkles
sun -> Sun
table -> Table
trash -> Trash
triangle-alert -> TriangleAlert
university -> University
user-plus -> UserPlus
user-round-plus -> UserRoundPlus
user-search -> UserSearch
users -> Users
x -> X
```

> 注意：源文件里可能写成别名（`fingerprint`、`help-circle`、`message-circle-question`、`trash-2`），它们分别等价于上表的 `fingerprint-pattern`、`circle-question-mark`、`message-circle-question-mark`、`trash`。两种写法都可直接导入，建议统一用上表名。

## 附录 B：需要改动的文件（当前导入了 `Icon` 的 32 个）

```text
src/components/auth/LoginBrandPanel.tsx
src/components/auth/LoginPanel.tsx
src/components/checkin/CheckinScreen.tsx
src/components/checkin/SlaveCard.tsx
src/components/checkoff/DemoStep.tsx
src/components/checkoff/ExperimentPicker.tsx
src/components/checkoff/MasterSlavePanel.tsx
src/components/checkoff/PreferenceOnboarding.tsx
src/components/checkoff/QuestionDrawer.tsx
src/components/checkoff/ScoreForm.tsx
src/components/checkoff/StepIndicator.tsx
src/components/checkoff/StudentFinder.tsx
src/components/console/StatCard.tsx
src/components/layout/AppShell.tsx
src/components/questions/SetQuestionsEditor.tsx
src/components/settings/PreferenceSection.tsx
src/components/settings/SystemSection.tsx
src/components/settings/ZjuamSection.tsx
src/components/ui/Card.tsx
src/components/ui/ThemeToggle.tsx
src/pages/Checkin.tsx
src/pages/Checkoff.tsx
src/pages/Dashboard.tsx
src/pages/ExperimentDetail.tsx
src/pages/Experiments.tsx
src/pages/LlmConnect.tsx
src/pages/NewCourse.tsx
src/pages/Questions.tsx
src/pages/Scores.tsx
src/pages/Settings.tsx
src/pages/Setup.tsx
src/pages/Terms.tsx
```
