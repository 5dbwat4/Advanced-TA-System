/**
 * useFilter —— HeroUI v3 `useFilter` → 自实现（拼音增强版）
 *
 * 旧版只有一处显式调用：`pages/FocusStudents.tsx:95`
 *   const { contains } = useFilter({ sensitivity: 'base' })
 * 并把它交给 `<Autocomplete.Filter filter={contains}>`（HeroUI 的默认 `contains`，
 * 纯 `includes`，**不认拼音**）。真正的拼音语义在 `lib/pinyin.ts` 的 `matchStudent`
 * （`StudentFinder` / `FocusStudents` 的表格搜索走它，不走 Autocomplete）。
 * 新版把两条线合成一个 composable：`useFilter` 自己出拼音候选，页面不再传回调。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 一、契约（MIGRATION.md §4.5 第 5 条，冻结）
 * ────────────────────────────────────────────────────────────────────────
 *   const { contains, startsWith, fuzzy } = useFilter({ sensitivity?: 'base'|'accent'|'case' })
 *   contains(haystack, needle) -> boolean
 *   startsWith(haystack, needle) -> boolean
 *   fuzzy(haystack, needle) -> boolean
 *
 * 三个函数的签名与 HeroUI / @react-aria `useFilter` 完全一致（都是
 * `(haystack, needle) -> boolean`），所以旧页面里
 * `<Autocomplete.Filter filter={contains}>` 那种「把函数当 prop 传下去」的写法，
 * 新版对应成页面把 `items[].keywords` 备好、组件内部自己调 `contains`。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 二、匹配顺序（每一步都可能提前命中）
 * ────────────────────────────────────────────────────────────────────────
 * 1) 快路径：字面子串（`h.toLowerCase().includes(n.toLowerCase())`）
 *    —— 学生搜索里页面已经把「姓名 + 学号 + 拼音」拼进 `keywords` 了，
 *       这一步就能命中绝大多数情况，省掉后面的拼音开销。
 * 2) 去分隔符：把空格 / `-` / `_` 去掉再比（对齐旧版 `matchStudent` 的
 *    `query.replace(/[\s_-]+/g, '')`，让「2023 1234」也能搜到「20231234」）。
 * 3) 中文拼音候选：`~/lib/pinyin` 的 `pinyinIndex` 给出全拼 + 首字母，
 *    与 needle 的原文 / 去分隔符版 / 拼音版两两交叉比较
 *    （`contains('张三 2023123456', 'zs')` → true，与旧版 `matchStudent` 等价）。
 *
 * ⚠️ `sensitivity: 'case'` 时第 1 步的大小写宽松快路径**必须跳过**
 *    （`'ABC'.includes('abc')` 为真，但 case 敏感语义下两者并不相等）。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 三、sensitivity（与 Intl.Collator.sensitivity 同名同义）
 * ────────────────────────────────────────────────────────────────────────
 *   base  → 大小写、变音符都不敏感（`'lü' ≈ 'lu'`），**全站默认**
 *   accent→ 只忽略大小写，保留变音符
 *   case  → 只忽略大小写……的反面：大小写敏感、变音符敏感
 * 用 `Intl.Collator(undefined, { usage: 'search', sensitivity })` 逐字符窗口比较，
 * 与 @react-aria 的实现同源（全站 1 处调用，不引入额外依赖）。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 四、⚠️ 迁页面注意事项
 * ────────────────────────────────────────────────────────────────────────
 * 1) **旧版 `filter` 回调 → 新版 `items[].keywords`**：
 *      旧：`candidates.map((s) => ({ id, textValue: `${s.name} ${s.studentNo}` }))`
 *          → `textValue` 既是显示文案也是被 `contains` 过滤的字段（**只有姓名 + 学号，
 *            所以旧版 Autocomplete 搜不到拼音**，拼音能力其实漏了）。
 *      新：`items: { label, value, keywords }`，`label` 负责显示，
 *            `keywords` 负责匹配。想让拼音生效就把拼音也塞进 keywords：
 *            `keywords: [name, studentNo, pinyinIndex(name).full, pinyinIndex(name).initials].join(' ')`
 *            （不塞也能用——`contains` 内部会自己算 `label` 的拼音候选。）
 * 2) **旧版 `selectionMode="single"` → 新版由 v-model 保证**：本组件只有一个
 *    `modelValue`，不支持多选；旧版 `onChange` 给的是 `ListBox.Item` 的 `id`，
 *    新版 `items[].value` 就是这个 id，语义一致（旧页面 `String(addStuId)` 那种
 *    number/string 转换可以去掉）。
 * 3) 表格/名单搜索（`StudentFinder`、`FocusStudents` 的搜索框）没有弹层，
 *    直接 `students.filter((s) => contains(`${s.name} ${s.studentNo}`, query))` 即可，
 *    拼音语义与 Autocomplete 内部完全一致（同一个 composable）。
 * 4) 没有用 `@nuxt/ui` 间接依赖的 `fuse.js`（它不是本项目 package.json 里的直接依赖，
 *    也不该为一个搜索函数去动依赖清单）；`fuzzy` 沿用 @react-aria 的子序列算法自实现。
 */
import { pinyinIndex } from '~/lib/pinyin'

/** 与 HeroUI `useFilter` 的 sensitivity 取值一一对应 */
export type FilterSensitivity = 'base' | 'accent' | 'case'

export interface UseFilterOptions {
  /** 默认 'base'（大小写 + 变音符都不敏感） */
  sensitivity?: FilterSensitivity
}

export interface UseFilterResult {
  /** 子串匹配（拼音增强） */
  contains: (haystack: string, needle: string) => boolean
  /** 前缀匹配（拼音增强） */
  startsWith: (haystack: string, needle: string) => boolean
  /** 模糊匹配：needle 的字符按顺序出现即可（拼音增强） */
  fuzzy: (haystack: string, needle: string) => boolean
}

/** 学号「2023 1234」、下划线姓名里的分隔符，搜索时忽略（对齐旧版 matchStudent） */
const SEPARATORS = /[\s_-]+/g

/** 含中文（含扩展 A / 兼容汉字）才值得算拼音；纯英文 / 学号走 pinyin-pro 是恒等变换 */
const HAS_CHINESE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

function stripSeparators(value: string) {
  return value.replace(SEPARATORS, '')
}

function normalize(value: string) {
  return (value ?? '').normalize('NFC')
}

/**
 * 一个字符串参与匹配的全部候选：原文 / 去分隔符原文 / 拼音全拼 / 拼音首字母
 * （后两者也各带一份去分隔符版）。不含中文时只回前两个。
 */
function candidates(value: string): string[] {
  const list: string[] = []
  const push = (text: string) => {
    if (text && !list.includes(text)) list.push(text)
  }

  push(value)
  push(stripSeparators(value))

  if (HAS_CHINESE.test(value)) {
    // pinyinIndex 内部有 Map 缓存，重复过滤同一个名单不会重复跑 pinyin-pro
    const { full, initials } = pinyinIndex(value)
    push(full)
    push(stripSeparators(full))
    push(initials)
    push(stripSeparators(initials))
  }

  return list
}

/** 任意一对候选命中即算匹配 */
function anyPair(hays: string[], needles: string[], compare: (hay: string, needle: string) => boolean) {
  for (const needle of needles) {
    for (const hay of hays) {
      if (compare(hay, needle)) return true
    }
  }
  return false
}

/**
 * @param options 旧版 HeroUI 的 `useFilter({ sensitivity })` 同一个参数
 * @returns `contains` / `startsWith` / `fuzzy`，均可直接当 `filter` 回调传下去
 */
export function useFilter(options: UseFilterOptions = {}): UseFilterResult {
  const { sensitivity = 'base' } = options
  // usage: 'search' + sensitivity 就是 @react-aria 的做法；不传 locale 走运行环境的默认值
  const collator = new Intl.Collator(undefined, { usage: 'search', sensitivity })

  function equal(a: string, b: string) {
    return collator.compare(a, b) === 0
  }

  /** 逐窗口比较，等价于旧版 `includes` 但尊重 sensitivity */
  function rawContains(haystack: string, needle: string) {
    for (let i = 0; i + needle.length <= haystack.length; i++) {
      if (equal(haystack.slice(i, i + needle.length), needle)) return true
    }
    return false
  }

  function rawStartsWith(haystack: string, needle: string) {
    return equal(haystack.slice(0, needle.length), needle)
  }

  /** 子序列匹配（@react-aria 同款）：needle 的字符按顺序在 haystack 里出现即可 */
  function rawFuzzy(haystack: string, needle: string) {
    let patternIdx = 0
    for (let charIdx = 0; charIdx < haystack.length; charIdx++) {
      const char = haystack[charIdx]
      const compareChar = needle[patternIdx]
      if (equal(char, compareChar)) {
        patternIdx += 1
      } else if (char.length > compareChar.length) {
        // 上一个字符是重音字母组合（l + ü）之类，跳过剩余码位
        charIdx += char.length - compareChar.length
      }
      if (patternIdx === needle.length) return true
    }
    return false
  }

  // 一次筛选里所有 item 共用同一个 needle，缓存它的候选列表省掉重复计算
  let lastNeedle: string | null = null
  let lastNeedleCandidates: string[] = []
  function needleCandidates(needle: string) {
    if (needle !== lastNeedle) {
      lastNeedle = needle
      lastNeedleCandidates = candidates(needle)
    }
    return lastNeedleCandidates
  }

  /**
   * 三个函数共用的前置：空 needle 一律视为匹配（HeroUI / matchStudent 语义一致），
   * 两侧各自展开成候选列表。
   */
  function prepare(haystack: string, needle: string) {
    const h = normalize(haystack)
    const n = normalize(needle).trim()
    if (!n) return null
    return { hays: candidates(h), needles: needleCandidates(n) }
  }

  function contains(haystack: string, needle: string) {
    const prepared = prepare(haystack, needle)
    if (!prepared) return true

    // 快路径：字面子串。case 敏感时不能走（见文件头「二」的提醒）
    if (sensitivity !== 'case') {
      const raw = normalize(needle).trim().toLowerCase()
      if (prepared.hays[0]?.toLowerCase().includes(raw)) return true
    }

    return anyPair(prepared.hays, prepared.needles, rawContains)
  }

  function startsWith(haystack: string, needle: string) {
    const prepared = prepare(haystack, needle)
    if (!prepared) return true
    return anyPair(prepared.hays, prepared.needles, rawStartsWith)
  }

  function fuzzy(haystack: string, needle: string) {
    const prepared = prepare(haystack, needle)
    if (!prepared) return true
    return anyPair(prepared.hays, prepared.needles, rawFuzzy)
  }

  return { contains, startsWith, fuzzy }
}
