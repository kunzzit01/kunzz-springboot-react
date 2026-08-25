import { useEffect, useState } from 'react'
import { getRecycleBin, restoreRecord } from '../api'

/** 回收站：对齐线上 stock_recycle.php（软删除记录恢复） */
export default function Recycle() {
  const [items, setItems] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)

  const load = (p: number) => {
    getRecycleBin(p, 20).then((res) => { setItems(res.items); setTotal(res.total) }).catch(() => {})
  }
  useEffect(() => { load(page) }, [page])

  const pages = Math.max(1, Math.ceil(total / 20))

  const restore = async (id: number) => {
    try { await restoreRecord(id); load(page) } catch { /* 拦截器已提示 */ }
  }

  return (
    <div>
      <div className="kz-page-title">
        <span>回收站</span>
        <span className="sub">{total} 条软删除记录</span>
      </div>
      <div className="kz-card">
        <div style={{ overflow: 'auto', maxHeight: '62vh' }}>
          <table className="kz-table">
            <thead>
              <tr><th>ID</th><th>日期</th><th>产品</th><th className="num">入库</th><th className="num">出库</th><th>删除时间</th><th>删除人</th><th>操作</th></tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={Number(r.id)}>
                  <td>{String(r.id)}</td>
                  <td>{String(r.date || '-')}</td>
                  <td><b>{String(r.productName || '')}</b></td>
                  <td className="num">{r.inQuantity ? Number(r.inQuantity) : '-'}</td>
                  <td className="num">{r.outQuantity ? Number(r.outQuantity) : '-'}</td>
                  <td>{String(r.deletedAt || '').replace('T', ' ').substring(0, 19)}</td>
                  <td>{String(r.deletedBy || '-')}</td>
                  <td><button className="btn btn-primary" style={{ padding: '3px 12px' }} onClick={() => restore(Number(r.id))}>恢复</button></td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: '#999', padding: 24 }}>回收站为空</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="kz-filter-bar" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
          <button className="btn btn-default" disabled={page === 0} onClick={() => setPage(page - 1)}><i className="fas fa-chevron-left" /> 上一页</button>
          <span style={{ fontSize: 13, color: '#666' }}>{page + 1} / {pages}</span>
          <button className="btn btn-default" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>下一页 <i className="fas fa-chevron-right" /></button>
        </div>
      </div>
    </div>
  )
}
