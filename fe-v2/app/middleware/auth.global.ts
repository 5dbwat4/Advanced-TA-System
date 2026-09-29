/**
 * 合并旧版 `RequireAuth` + `RedirectIfAuthed` 两个路由守卫。
 *
 * 旧版靠 <Route> 嵌套分别包裹两棵子树；Nuxt 没有等价的子树守卫，
 * 所以改成在一张全局中间件里手工判断「当前路由属于哪一侧」。
 *
 * 公开路由：/terms、/checkin、/checkin/:token（对应 App.tsx 里没有包守卫的分支）
 * 其余：未登录 → /login?redirect=…；已登录但没设用户名 → /setup
 */

/** 无需登录即可访问 */
const PUBLIC_PATHS = ['/terms', '/checkin']
/** 已登录（且信息完整）的用户再访问这些页面要弹回 /console */
const AUTHED_ONLY_PATHS = ['/login', '/setup']

export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useAuthStore()

  // 冷启动：localStorage 里有 token 时 store 初始即为 loading，先把登录态拉回来。
  // 这里的 await 是关键——不等的话首帧会先走进「未登录」分支再被弹走。
  if (auth.loading) await auth.restore()

  // restore 仍未落定（正常路径下不会发生，防御性留口）
  if (auth.loading) return

  const path = to.path
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`))

  // ---- 未登录 ----
  if (!auth.user) {
    if (path === '/login' || isPublic) return
    // 记住原路径，登录成功后跳回去
    // （用 query 而非旧版的 history state：Nuxt 里读回更稳，也方便分享链接）
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`, { replace: true })
  }

  // ---- 已登录但还没设置用户名 → 只能去 /setup（公开页仍可看） ----
  if (!auth.user.username) {
    if (path === '/setup' || isPublic) return
    return navigateTo('/setup', { replace: true })
  }

  // ---- 信息完整：把已登录用户从 /login、/setup 弹回控制台 ----
  if (AUTHED_ONLY_PATHS.includes(path)) {
    return navigateTo('/console', { replace: true })
  }
})
