# fe-v2 — SYS TA Console (Nuxt 4 重写)

`fe/`（React + HeroUI + Vite）的 Nuxt 4 重写版，迁移方案见仓库根目录 [`MIGRATION.md`](../MIGRATION.md)。

当前状态：**Phase A 批次 A1**（脚手架 + 样式地基 + 路由/状态骨架）。业务页与兼容层尚未迁移，页面均为空壳。

## 技术栈

| | |
|---|---|
| 框架 | Nuxt 4（`ssr: false`，纯 SPA） |
| 组件库 | Nuxt UI v4（`@nuxt/ui`） |
| 样式 | Tailwind CSS v4（`@tailwindcss/vite`，与旧版同 minor） |
| 状态 | Pinia（`@pinia/nuxt`） |
| 明暗主题 | `@nuxtjs/color-mode`（`classSuffix: ''`） |
| 动效 | `motion-v` |
| 图标 | `unplugin-icons`（`compiler: 'vue'`，`~icons/lucide/*`） |
| 字体 | `@nuxt/fonts`（随 Nuxt UI 内置，自托管替代 Google Fonts `<link>`） |

完整版本见 [`package.json`](./package.json)，锁定依据见 MIGRATION.md §1.1。

## 常用命令

```bash
npm install     # 首次安装
npm run dev     # 开发服务器（http://localhost:5173）
npm run build   # 生产构建
npm run preview # 预览构建产物
```

> ⚠️ **不要在 WSL 里执行 `npm install` / `npm run dev`**。
> 本仓库的 `node_modules` 是在 Windows 上安装的，在 WSL 里装会换成 Linux 原生二进制、
> 破坏 Windows 侧的开发环境。安装与启动都在平时的 Windows 环境里做。

## 目录结构

```
fe-v2/
├── nuxt.config.ts          ssr:false · css · vite.plugins · dev proxy · colorMode · fonts
├── app.config.ts           ui.colors.primary='brand' · ui.toast 玻璃拟态 · ui.skeleton
├── tsconfig.json           extends ./.nuxt/tsconfig.json
├── public/                 favicon.svg · icons.svg
└── app/
    ├── app.vue             UApp + aurora + grid-overlay + NuxtLayout/NuxtPage
    ├── error.vue           404 / 500
    ├── env.d.ts            unplugin-icons 的 ~icons/* 类型
    ├── assets/css/main.css ← fe/src/index.css 逐字搬运 + 交互基线
    ├── layouts/            default.vue（守卫外页面）· console.vue（AppShell 占位）
    ├── middleware/         auth.global.ts（合并 RequireAuth + RedirectIfAuthed）
    ├── plugins/            app-store-persist.client.ts（zustand persist 等价物）
    ├── stores/             auth.ts · app.ts
    ├── composables/        useCurrentClass.ts · useHasXzzdPermission.ts
    ├── lib/                api · zjuam · last-user · utils · pinyin · nav（纯 TS，不 auto-import）
    └── pages/              路由空壳，详见 MIGRATION.md §5
```

## 几个必须知道的约定

1. **`lib/` 不在 auto-import 范围**
   Nuxt 只 auto-import `app/composables`、`app/utils`、`app/stores`（经 `@pinia/nuxt` 的 `addImportsDir`）。
   `app/lib/**` 必须显式 `import { apiFetch } from '~/lib/api'`，且用 `~/` 而非 `@/` 别名。

2. **`components` 关闭了目录前缀**
   `components: [{ path: '~/components', pathPrefix: false }]`，所以
   `app/components/ui/Card.vue` 直接写 `<Card>`，不写 `<UiCard>`。

3. **暗色变体是 `.dark` 类，不是 `.dark` 媒体查询**
   main.css 里 `@custom-variant dark (&:is(.dark *))`，配套
   `colorMode: { classSuffix: '' }`（否则 html 上会变成 `dark-dark`）。

4. **store 里不要 import Vue / Nuxt 的东西**
   `ref` / `computed` / `defineStore` / `navigateTo` 等全部依赖 auto-import，
   显式 import 反而会和 Nuxt 生成的类型对不上。

5. **`experiments` 与 `checkin` 用的是 `xxx/index.vue` 而不是 `xxx.vue`**
   否则 Nuxt 会把 `experiments/[id].vue` 当成 `experiments.vue` 的子路由，
   而父组件里没有 `<NuxtPage />` → 详情页渲染成空白。

## 路由与守卫

| 路径 | 说明 |
|---|---|
| `/` | 重定向到 `/console` |
| `/login` `/setup` | 登录 / 完善信息（`default` 布局） |
| `/terms` `/checkin` `/checkin/:token` | 公开页，守卫白名单内 |
| `/console/*` | 控制台（`console` 布局） |

未登录访问 `/console/*` → `/login?redirect=<原路径>`；已登录但没设用户名 → `/setup`；
未知路径由 `pages/[...all].vue` 兜回 `/console`。

## 尚未验证 / 待办

见本次交付说明里的「未验证点」清单。已知待补：

- 字体 woff2 自托管（MIGRATION.md Phase A 第 6 条）
- 兼容层 `AppButton` `AppInput` `AppChip` `AppTooltip` `AppSwitch` `AppLabel`
- Phase D 的 Markdown 渲染需要 `remark-math` / `rehype-katex`（当前只装了 `katex`）
