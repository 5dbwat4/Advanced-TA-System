export default defineAppConfig({
  ui: {
    colors: {
      // 复用 main.css 里搬过来的 --color-brand-50..950（学术蓝），
      // 这样所有 U* 组件的「主色」就是我们的品牌色，而不是 Nuxt 默认的 green。
      // 实现：Nuxt UI 的 colors 插件会生成
      //   --ui-color-primary-500: var(--color-brand-500, <tailwind 回退值>)
      //   --ui-primary: var(--ui-color-primary-500)   （.dark 下用 400 档）
      primary: 'brand',
      neutral: 'slate',
    },

    // 玻璃拟态 toast，尽量贴近旧版 sonner + components/ui/Toaster.tsx 的观感
    // （背景 --glass + blur(16px) + 1px --line 边框）
    // 写法说明：这里用「追加合并」形式（tailwind-variants 的 extend 语义）：
    // 默认类在前、这里的类在后，tailwind-merge 冲突时后者胜出，
    // 所以 bg-elevated/85 覆盖默认的 bg-default、rounded-xl 覆盖 rounded-lg。
    toast: {
      slots: {
        root: 'bg-elevated/85 ring-0 border border-line rounded-xl shadow-lg backdrop-blur-md backdrop-saturate-150',
      },
    },

    // 回到旧版的 shimmer 观感（保留默认的尺寸/圆角，只换动画）
    skeleton: {
      base: 'skeleton-shimmer rounded-md bg-sunken',
    },
  },
})
