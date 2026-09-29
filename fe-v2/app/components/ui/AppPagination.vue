<script setup lang="ts">
/**
 * AppPagination —— HeroUI v3 `Pagination` → Nuxt UI v4 `UPagination` 的兼容层（12 处）
 *
 * ────────────────────────────────────────────────────────────────────────
 * 旧版结构（`@heroui/react@3.2.6`，源码 `dist/components/pagination/pagination.js`
 * + `dist/components/pagination.css` 实际类名）
 *
 *   <Pagination className="mt-4 justify-center" size="sm">   → <nav> .pagination
 *     <Pagination.Content>                                   → <ul> .pagination__content
 *       <Pagination.Item>                                    → <li> .pagination__item
 *         <Pagination.Previous isDisabled onPress>           → <button> .pagination__link
 *                                                              .pagination__link--nav（w-auto gap-1.5 px-2.5）
 *           <Pagination.PreviousIcon />                      → <span> .pagination-previous-icon，i-lucide-chevron-left
 *           <span>上一页</span>
 *         <Pagination.Link isActive onPress>{p}</Pagination.Link>
 *                                                             → <button> .pagination__link
 *                                                               inline-flex size-9 rounded-3xl text-sm
 *                                                               font-medium（底色 transparent，hover --default-hover）
 *                                                               [data-active] → 底色换成 --default；aria-current="page"
 *         <Pagination.Ellipsis />                            → <span> .pagination__ellipsis，size-9 text-muted，内容 "…"
 *         <Pagination.Next isDisabled onPress>               → <button> .pagination__link .pagination__link--nav
 *           <span>下一页</span>
 *           <Pagination.NextIcon />                          → <span> .pagination-next-icon，i-lucide-chevron-right
 *       </Pagination.Item>
 *     </Pagination.Content>
 *   </Pagination>
 *
 * size 档位（旧 `.pagination--sm / --md / --lg`）：
 *   sm → link `size-8 text-xs md:size-7`；nav `w-auto px-2`
 *   md → link `size-9 text-sm md:size-8`；nav `w-auto px-2.5`（默认档）
 *   lg → link `size-10 text-base md:size-9`；nav `w-auto px-3`
 *
 * ────────────────────────────────────────────────────────────────────────
 * 新版结构（Nuxt UI `UPagination`，已用 MCP `get-component Pagination` + 读
 * `node_modules/@nuxt/ui/dist/runtime/components/Pagination.vue` 与
 * `.nuxt/ui/pagination.ts` 核实）
 *
 *   <UPagination v-model:page :total :items-per-page :sibling-count :show-edges :ui>
 *     <template #item>     { item, index, page, pageCount } → 页码按钮（AppPagination 的 #item）
 *     <template #ellipsis> { ui }                          → 省略号
 *     <template #prev / #next>（无作用域）                 → 上一页 / 下一页
 *   </UPagination>
 *
 * 合并后的结构：`ui.root` 对应旧 `.pagination`（reka 的 `PaginationRoot` 默认
 * `as="nav"`，和旧版根元素同为 `<nav>`）；`ui.list` 对应旧 `.pagination__content`；
 * `ui.item` 对应旧 `.pagination__item`；首/末页控件默认关闭（`show-controls=false`
 * + 自带 `#prev`/`#next`），因为旧版只有「上一页 / 下一页」，没有首页 / 末页。
 *
 * ────────────────────────────────────────────────────────────────────────
 * ⚠️ 页码基准（本组件最容易翻车的点）
 *
 * 1. **页码不需要转换。** reka `PaginationRoot` 的 `page` / `defaultPage` 默认值
 *    就是 `1`（`node_modules/reka-ui/dist/Pagination/PaginationRoot.js`：
 *    `defaultPage: { default: 1 }`），`pageCount = Math.max(1, Math.ceil(total / itemsPerPage))`。
 *    契约的 `page`（1 起）、旧版 `useState(1)` / `setParams(page - 1)` 全是 1 起，
 *    三方一致 → **原样透传，没有 0 起 / 1 起的换算**。
 *    （若将来换成 reka 的 0 起版本，只需在 `page` setter / `update:page` 两处 ±1。）
 *
 * 2. **`total` 两边语义相同 —— 都是「总条数」，不是「总页数」。**
 *    旧版 `Questions.tsx` 是 `totalPages = ceil(total / PAGE_SIZE)` 后手写 `pageNumbers()`；
 *    `UPagination` 则要靠 `items-per-page` 自己算页数。契约里没有这一项，
 *    所以这里**额外开一个可选透传 prop** `items-per-page`（默认 10，同 Nuxt UI 默认），
 *    不传就等于按 10 条一页算，`pageCount` 会和旧版对不上。页面必须传。
 *
 * 3. `boundaries`（HeroUI v2 的「两端各显示几页」）在 Nuxt UI 没有对应 prop，
 *    近似映射成 `show-edges`：只要 `boundaries > 0` 或显式 `show-edges` 就
 *    永远显示首页 / 末页 / 省略号；确切可见页数由 `sibling-count` 控。
 *    旧版 `pageNumbers()` 恒推入 1 和 totalPages，所以默认 `showEdges: true`。
 *
 * ────────────────────────────────────────────────────────────────────────
 * prop / emit 映射
 *   旧 state page            → v-model:page（1 起，见上）
 *   旧 total（总条数）        → total
 *   旧 PAGE_SIZE             → items-per-page（⚠️ 契约外新增，务必传）
 *   旧 onPress={() => goToPage(p)} → @update:page（reka 内部已算好目标页）
 *   旧 isDisabled={page === 1}     → reka 的 PaginationPrev/Next 自带 disabled，无需传
 *   旧 className="mt-4 justify-center" → class（透传到根元素）
 *   旧 Pagination.Link 胶囊观感      → #item 插槽 + :ui（见 PILL_CLASS / NAV_CLASS）
 *
 * ────────────────────────────────────────────────────────────────────────
 * 「迁页面时注意」
 *
 * 1. `onPress` → `@update:page`。旧版每个 Link 自己算 `goToPage(p)`；
 *    新版只需 `v-model:page="page"`，reka 负责翻页。
 *
 * 2. **页码 1 起（两边一致，无需换算），但 `total` 传的是总条数。**
 *    旧版 `totalPages > 1` 才渲染分页器的 `v-if` 请保留 —— `UPagination`
 *    永远会渲染（最少 1 页），不再有旧版 `Questions.tsx` 那样的条件。
 *
 * 3. 省略号逻辑从手写 `pageNumbers()` 移到组件内部（旧版 12 行 → 0 行），
 *    页面里的 `pageNumbers` / `totalPages` 可删；`totalPages` 仍要用于
 *    `offset: (page - 1) * PAGE_SIZE` 这类请求参数计算。
 *
 * 4. 键盘可达性全部交给 reka / Nuxt UI（Tab 焦点环、方向键、disabled 态），
 *    兼容层不重写。
 */
import { computed } from 'vue'

type AppPaginationSize = 'sm' | 'md' | 'lg'

const props = withDefaults(defineProps<{
  /** v-model:page，**1 起**（契约 / 旧版 / UPagination 三方一致，无需换算） */
  page: number
  /** 总条数（不是总页数！），与旧版 `total` 语义相同 */
  total: number
  /** 当前页左右各显示几个页码，默认 1（UPagination 默认是 2，这里按契约改） */
  siblingCount?: number
  /** 两端各显示几页；Nuxt UI 无此 prop，> 0 时等价于 show-edges，默认 1 */
  boundaries?: number
  /** 是否恒显首页 / 末页 / 省略号，默认 true（旧 pageNumbers() 也是这么做的） */
  showEdges?: boolean
  size?: AppPaginationSize
  /** 旧版 className="mt-4 justify-center"，透传到根元素 */
  class?: string
  /** ⚠️ 契约外新增的透传 prop：每页条数，UPagination 靠它算 pageCount。默认 10 */
  itemsPerPage?: number
}>(), {
  siblingCount: 1,
  boundaries: 1,
  showEdges: true,
  size: 'md',
  class: undefined,
  itemsPerPage: 10,
})

const emit = defineEmits<{
  'update:page': [value: number]
}>()

/** boundaries 是 HeroUI v2 的概念，这里近似折算成 show-edges */
const showEdges = computed(() => props.showEdges || props.boundaries > 0)

/**
 * 旧 `.pagination__link`：size-9 rounded-3xl text-sm font-medium，三档尺寸
 * （sm: size-8/md:size-7、md: size-9/md:size-8、lg: size-10/md:size-9）。
 * 放在 UButton 的 class 上（tv 变体类在前、class 在后，tailwind-merge 同族后者胜），
 * 顺便用 `p-0` 顶掉 `square` 自带的 p-1.5。
 */
const PILL_CLASS: Record<AppPaginationSize, string> = {
  sm: 'h-8 w-8 p-0 text-xs md:h-7 md:w-7',
  md: 'h-9 w-9 p-0 text-sm md:h-8 md:w-8',
  lg: 'h-10 w-10 p-0 text-base md:h-9 md:w-9',
}

/** 旧 `.pagination__link--nav`：`w-auto gap-1.5 px-2.5`（sm px-2 / lg px-3） */
const NAV_CLASS: Record<AppPaginationSize, string> = {
  sm: 'h-8 w-auto gap-1 px-2 py-0 text-xs md:h-7',
  md: 'h-9 w-auto gap-1.5 px-2.5 py-0 text-sm md:h-8',
  lg: 'h-10 w-auto gap-2 px-3 py-0 text-base md:h-9',
}
</script>

<template>
  <UPagination
    :page="page"
    :total="total"
    :items-per-page="itemsPerPage"
    :sibling-count="siblingCount"
    :show-edges="showEdges"
    :show-controls="false"
    :size="size"
    :color="'neutral'"
    :variant="'ghost'"
    :ui="{
      root: 'flex w-full items-center justify-center',
      list: 'flex items-center gap-1',
      ellipsis: 'pointer-events-none inline-flex h-9 w-9 items-center justify-center rounded-3xl p-0 text-sm font-medium text-muted md:h-8 md:w-8',
      label: 'min-w-0 text-center',
    }"
    :class="props.class"
    @update:page="emit('update:page', $event)"
  >
    <!--
      页码按钮：旧版 `<Pagination.Item><Pagination.Link isActive>{p}</Pagination.Link>`。
      UPagination 的 #item 作用域是 `{ item, index, page, pageCount }`，
      `item` 为 `{ type: 'page', value }`（省略号走 #ellipsis，不进这个插槽）。
      这里翻成契约要求的 `{ page, isActive }` 再往外抛。
    -->
    <template #item="{ item, page: currentPage }">
      <slot name="item" :page="item.value" :is-active="item.value === currentPage">
        <UButton
          :color="item.value === currentPage ? 'primary' : 'neutral'"
          :variant="item.value === currentPage ? 'solid' : 'ghost'"
          :size="size"
          :label="String(item.value)"
          :ui="{ label: 'min-w-0 text-center' }"
          :aria-current="item.value === currentPage ? 'page' : undefined"
          square
          :class="PILL_CLASS[size]"
        />
      </slot>
    </template>

    <!-- 旧 `.pagination__ellipsis`：size-9 text-muted，内容是一个省略号字符 -->
    <template #ellipsis>
      …
    </template>

    <!--
      上一页 / 下一页：旧版是「图标 + 文字」的胶囊（`pagination__link--nav`），
      不是 Nuxt UI 默认的纯图标方块。放在 `#prev` / `#next` 插槽里，
      reka 仍会把自己的 disabled / onClick 合并到这唯一的根元素上
      （PaginationPrev/Next 是 as-child），所以第 1 页 / 末页的禁用态照旧生效。
    -->
    <template #prev>
      <UButton color="neutral" variant="ghost" :size="size" :class="NAV_CLASS[size]">
        <UIcon name="i-lucide-chevron-left" class="size-4 shrink-0" />
        <span>上一页</span>
      </UButton>
    </template>

    <template #next>
      <UButton color="neutral" variant="ghost" :size="size" :class="NAV_CLASS[size]">
        <span>下一页</span>
        <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0" />
      </UButton>
    </template>
  </UPagination>
</template>
