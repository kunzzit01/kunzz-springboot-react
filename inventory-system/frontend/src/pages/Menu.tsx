import { useEffect, useState } from 'react'
import { getMenuCategories, getMenuItems, saveMenuCategory, saveMenuItem } from '../api'
import { flashAfterRow, useRowHighlight } from '../utils/rowHighlight'

/** 菜单管理：对齐线上 menu_dashboard.php（GRAND/SUSHI + 分类 + 菜单项） */
export default function Menu() {
  const [tab, setTab] = useState<'GRAND' | 'SUSHI'>('GRAND')
  const [cats, setCats] = useState<Record<string, unknown>[]>([])
  const [items, setItems] = useState<Record<string, unknown>[]>([])
  // 新增后定位高亮（按菜单项名称）
  const { flash, isHl } = useRowHighlight((m: any) => String(m.itemName))
  const [newCat, setNewCat] = useState('')
  const [kw, setKw] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  // 保存中（防连点/重复提交）
  const [saving, setSaving] = useState(false)
  const [add, setAdd] = useState<Record<string, string>>({ itemCode: '', itemName: '', itemNameCn: '', itemDesc: '', price: '', status: 'active' })

  const load = async () => {
    try {
      const [c, m] = await Promise.all([getMenuCategories(), getMenuItems()])
      setCats(c); setItems(m)
    } catch { /* 拦截器已提示 */ }
  }
  useEffect(() => { load() }, [])

  const addCat = async () => {
    if (!newCat) return
    try { await saveMenuCategory({ categoryName: newCat, menuType: tab }); setNewCat(''); load() } catch { /* 拦截器已提示 */ }
  }

  const submit = async () => {
    if (saving) return
    if (!add.itemName) return
    const savedName = add.itemName
    setSaving(true)
    try {
      await saveMenuItem({ menuType: tab, categoryId: cats[0] ? Number(cats[0].id) : undefined, itemCode: add.itemCode, itemName: add.itemName, itemNameCn: add.itemNameCn, itemDesc: add.itemDesc, price: add.price ? Number(add.price) : undefined, status: add.status })
      setShowAdd(false); setAdd({ itemCode: '', itemName: '', itemNameCn: '', itemDesc: '', price: '', status: 'active' })
      await load()
      flashAfterRow('body', 'td:nth-child(2)', savedName, flash)
    } catch { /* 拦截器已提示 */ }
    finally { setSaving(false) }
  }

  const filtered = items.filter((m) => !kw || String(m.itemName || '').toLowerCase().includes(kw.toLowerCase()))

  return (
    <div>
      <div className="kz-page-title">
        <span>菜单管理</span>
        <span className="sub">{items.length} 个菜单项</span>
      </div>
      <div className="kz-card">
        <div className="kz-filter-bar">
          <button className={'btn ' + (tab === 'GRAND' ? 'btn-primary' : 'btn-default')} onClick={() => setTab('GRAND')}>GRAND</button>
          <button className={'btn ' + (tab === 'SUSHI' ? 'btn-primary' : 'btn-default')} onClick={() => setTab('SUSHI')}>SUSHI</button>
          <input placeholder="搜索菜单..." value={kw} onChange={(e) => setKw(e.target.value)} style={{ width: 180, padding: '6px 10px', border: '1px solid #ddd', borderRadius: 8 }} />
          <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)}><i className="fas fa-plus" /> 添加到菜单</button>
        </div>

        <div className="kz-filter-bar">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {cats.filter((c) => String(c.menuType || '') === tab).map((c) => (
              <span key={Number(c.id)} style={{ padding: '4px 12px', background: '#fff7e6', color: '#d46b08', borderRadius: 16, fontSize: 13 }}>{String(c.categoryName || '')}</span>
            ))}
            <input placeholder="新分类" value={newCat} onChange={(e) => setNewCat(e.target.value)} style={{ width: 110, padding: '4px 8px', border: '1px solid #ddd', borderRadius: 6 }} />
            <button className="btn btn-default" style={{ padding: '4px 10px' }} onClick={addCat}>＋</button>
          </div>
        </div>

        {showAdd && (
          <div style={{ background: '#fff9f0', border: '1px solid #ffe8d1', borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div className="kz-filter-bar">
              <input placeholder="编码" value={add.itemCode} onChange={(e) => setAdd({ ...add, itemCode: e.target.value })} style={{ width: 100, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6 }} />
              <input placeholder="名称 *" value={add.itemName} onChange={(e) => setAdd({ ...add, itemName: e.target.value })} style={{ width: 160, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6 }} />
              <input placeholder="中文名" value={add.itemNameCn} onChange={(e) => setAdd({ ...add, itemNameCn: e.target.value })} style={{ width: 130, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6 }} />
              <input type="number" placeholder="价格" value={add.price} onChange={(e) => setAdd({ ...add, price: e.target.value })} style={{ width: 90, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6 }} />
              <select value={add.status} onChange={(e) => setAdd({ ...add, status: e.target.value })} style={{ padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6 }}>
                <option value="active">上架</option><option value="inactive">下架</option>
              </select>
              <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? '保存中...' : '保存'}</button>
              <button className="btn btn-default" onClick={() => setShowAdd(false)}>取消</button>
            </div>
            <input placeholder="描述" value={add.itemDesc} onChange={(e) => setAdd({ ...add, itemDesc: e.target.value })} style={{ width: '100%', padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6 }} />
          </div>
        )}

        <div style={{ overflow: 'auto', maxHeight: '60vh' }}>
          <table className="kz-table">
            <thead>
              <tr><th>编码</th><th>名称</th><th>中文名</th><th>类型</th><th className="num">价格</th><th>状态</th><th>描述</th></tr>
            </thead>
            <tbody>
              {filtered.filter((m) => String(m.menuType || '') === tab).map((m) => (
                <tr key={Number(m.id)} className={isHl(m) ? 'highlight-flash' : ''}>
                  <td>{String(m.itemCode || '-')}</td>
                  <td><b>{String(m.itemName || '')}</b></td>
                  <td>{String(m.itemNameCn || '-')}</td>
                  <td>{String(m.menuType || '-')}</td>
                  <td className="num">RM {Number(m.price || 0).toFixed(2)}</td>
                  <td>{m.status === 'active' ? <span style={{ color: '#52c41a' }}>上架</span> : <span style={{ color: '#999' }}>下架</span>}</td>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(m.itemDesc || '-')}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#999', padding: 24 }}>暂无菜单项</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
