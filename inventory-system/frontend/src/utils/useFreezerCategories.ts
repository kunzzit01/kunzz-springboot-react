import { useCallback, useEffect, useMemo, useState } from 'react'
import { getFreezerCategories, type FreezerCategoryItem } from '../api'

/**
 * 冰箱分类兜底清单（= 字典表上线时的初始 20 项，顺序即冰箱物理顺序 / 走冰箱的拣货顺序）
 * 接口不可用时用它，保证下拉选项和总库存排序都不会空掉。
 */
export const FREEZER_FALLBACK = [
  'K1-1', 'K1-2', 'K1-3', 'K1-4', 'K1-5', 'K1-6', 'K1-7', 'C-1',
  'KDI-1', 'KDI-2', 'KDI-3', 'KDI-4',
  'S1-1', 'S1-2', 'S1-3', 'S1-4',
  'SBS-1', 'SBS-2', 'SBDI-1', 'SBDI-2',
]

const FALLBACK_LIST: FreezerCategoryItem[] = FREEZER_FALLBACK.map((name, i) => ({
  id: null, name, sort_order: i + 1, is_active: true, usage_count: 0, registered: false,
}))

/**
 * 冰箱分类（按业务顺序）—— 替代原先硬编码在页面里的 FREEZER_OPTIONS
 *
 * names = 全部分类名（按业务顺序），两个用途：
 *   1) 货品种类页「冰箱分类」多选的选项
 *   2) 总库存按冰箱分类排序时的顺序表（indexOf 取下标）
 * 顺序来自 sort_order，所以改名之后位置不变 —— 这正是硬编码数组做不到的。
 *
 * 没有「停用」概念：分类要么在用，要么删掉。所以不做任何过滤，能出现在面板上就一定能选。
 */
export function useFreezerCategories() {
  const [list, setList] = useState<FreezerCategoryItem[]>(FALLBACK_LIST)
  /** 接口是否成功返回过（false = 后端还没有这个接口，或暂时不可用）——
   *  管理面板以此为准：拿不到字典时不要提供「改名/删除」入口，否则会显示成 20 个待登记项 */
  const [ready, setReady] = useState(false)

  const reload = useCallback(() => {
    getFreezerCategories()
      .then((rows) => { if (Array.isArray(rows)) { setList(rows); setReady(true) } })
      .catch(() => { /* 接口不可用（含后端未升级）：保持兜底清单，页面照常能用 */ })
  }, [])

  useEffect(() => { reload() }, [reload])

  const names = useMemo(() => list.map(c => c.name), [list])

  return { list, names, ready, reload }
}
