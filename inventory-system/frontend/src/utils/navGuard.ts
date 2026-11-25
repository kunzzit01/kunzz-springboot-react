/**
 * 页面级「离开本页前拦截」注册点。
 *
 * AppLayout 的侧边栏跳转（go()）会先问 runNavGuard：
 *   - 没页面注册 = 直接放行（绝大多数页面）
 *   - 注册方返回 false = 已拦下，由注册方自己弹窗（例如 KPI 上传页的「保存并切换 / 继续编辑」）
 *
 * 侧边栏菜单是 div + onClick 手动 navigate，不是 <a href>，所以没法靠拦截点击来阻止，
 * 只能由 AppLayout 在跳转前主动问一声。
 */
type Guard = (nextPath: string) => boolean

let guard: Guard | null = null

export const setNavGuard = (g: Guard | null) => { guard = g }

export const runNavGuard = (nextPath: string) => (guard ? guard(nextPath) : true)
