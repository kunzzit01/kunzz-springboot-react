import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * 碗碟模块统一视图切换下拉（总库存 / 破损记录 / 碗碟转卖）
 * 每个 dishware 页面（Dishware / DishwareBreak / DishwareTransfer）顶部共用
 */
export default function DishwareViewSelector({ current }: { current: 'stock' | 'break' | 'transfer' }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const labels: Record<string, string> = { stock: '总库存', break: '破损记录', transfer: '碗碟转卖' }
  const items: { key: 'stock' | 'break' | 'transfer'; label: string; path: string }[] = [
    { key: 'stock', label: '总库存', path: '/dishware' },
    { key: 'break', label: '破损记录', path: '/dishware_break' },
    { key: 'transfer', label: '碗碟转卖', path: '/dishware_transfer' },
  ]
  return (
    <div className="view-selector">
      <button className="selector-button" onClick={() => setOpen(!open)}>
        <span>{labels[current]}</span>
        <i className="fas fa-chevron-down"></i>
      </button>
      <div className={'selector-dropdown' + (open ? ' show' : '')}>
        {items.map(it => (
          <div key={it.key} className={'dropdown-item' + (current === it.key ? ' active' : '')}
            onClick={() => { setOpen(false); navigate(it.path) }}>{it.label}</div>
        ))}
      </div>
    </div>
  )
}
