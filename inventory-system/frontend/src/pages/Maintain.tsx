import { useEffect, useState } from 'react'
import { getProductNames, getStockRemarks, renameProduct } from '../api'

/** 产品/备注维护：对齐线上 stockproductname.php + stockremark.php */
export default function Maintain() {
  const [tab, setTab] = useState<'names' | 'remarks'>('names')
  const [names, setNames] = useState<string[]>([])
  const [remarks, setRemarks] = useState<string[]>([])
  const [kw, setKw] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [newName, setNewName] = useState('')

  const load = () => {
    Promise.all([getProductNames(kw || undefined), getStockRemarks(kw || undefined)])
      .then(([n, r]) => { setNames(n); setRemarks(r) })
      .catch(() => {})
  }
  useEffect(() => { load() }, [kw])

  const doRename = async () => {
    if (!renaming || !newName.trim()) return
    try { await renameProduct(renaming, newName.trim()); setRenaming(null); setNewName(''); load() } catch { /* 拦截器已提示 */ }
  }

  return (
    <div>
      <div className="kz-page-title">
        <span>产品名称 / 备注维护</span>
        <span className="sub">{tab === 'names' ? names.length + ' 个产品名' : remarks.length + ' 条备注'}</span>
      </div>
      <div className="kz-card">
        <div className="kz-filter-bar">
          <button className={'btn ' + (tab === 'names' ? 'btn-primary' : 'btn-default')} onClick={() => setTab('names')}>产品名称</button>
          <button className={'btn ' + (tab === 'remarks' ? 'btn-primary' : 'btn-default')} onClick={() => setTab('remarks')}>货品备注</button>
          <input placeholder="搜索..." value={kw} onChange={(e) => setKw(e.target.value)} style={{ width: 200, padding: '6px 10px', border: '1px solid #ddd', borderRadius: 8 }} />
        </div>

        {tab === 'names' ? (
          <table className="kz-table">
            <thead><tr><th>序号</th><th>产品名称</th><th>操作</th></tr></thead>
            <tbody>
              {names.map((n, i) => (
                <tr key={n}>
                  <td>{i + 1}</td>
                  <td><b>{n}</b></td>
                  <td>{renaming === n ? (
                    <span><input value={newName} onChange={(e) => setNewName(e.target.value)} style={{ padding: '4px 8px', border: '1px solid #ddd', borderRadius: 6 }} /> <button className="btn btn-primary" style={{ padding: '3px 10px' }} onClick={doRename}>保存</button> <button className="btn btn-default" style={{ padding: '3px 10px' }} onClick={() => setRenaming(null)}>取消</button></span>
                  ) : (
                    <button className="btn btn-default" style={{ padding: '3px 10px' }} onClick={() => { setRenaming(n); setNewName(n) }}>重命名</button>
                  )}</td>
                </tr>
              ))}
              {names.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: '#999', padding: 24 }}>暂无产品名称</td></tr>}
            </tbody>
          </table>
        ) : (
          <table className="kz-table">
            <thead><tr><th>序号</th><th>备注</th></tr></thead>
            <tbody>
              {remarks.map((r, i) => (
                <tr key={r}><td>{i + 1}</td><td>{r}</td></tr>
              ))}
              {remarks.length === 0 && <tr><td colSpan={2} style={{ textAlign: 'center', color: '#999', padding: 24 }}>暂无备注</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
