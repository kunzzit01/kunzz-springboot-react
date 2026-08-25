import { useEffect, useState } from 'react'
import { getBranchStock, updateBranchStock } from '../api'
import type { BranchStockTotal } from '../types'

/** 分店库存：老版视觉（J1/J2/J3 汇总 + 数量调整） */
const branches = ['j1', 'j2', 'j3']

export default function Branches() {
  const [branch, setBranch] = useState('j1')
  const [rows, setRows] = useState<BranchStockTotal[]>([])
  const [kw, setKw] = useState('')

  const load = (b: string) => {
    getBranchStock(b).then(setRows).catch(() => {})
  }
  useEffect(() => { load(branch) }, [branch])

  const filtered = rows.filter((r) => !kw || r.productName.toLowerCase().includes(kw.toLowerCase()))

  const editQty = async (id: number, val: number) => {
    try {
      await updateBranchStock(branch, id, val)
      load(branch)
    } catch { /* 拦截器已提示 */ }
  }

  return (
    <div>
      <div className="kz-page-title">
        <span>{branch.toUpperCase()} 库存汇总</span>
        <span className="sub">{filtered.length} 项</span>
      </div>
      <div className="kz-card">
        <div className="kz-filter-bar">
          {branches.map((b) => (
            <button key={b} className={'btn ' + (branch === b ? 'btn-primary' : 'btn-default')} onClick={() => setBranch(b)}>
              {b.toUpperCase()}
            </button>
          ))}
          <input placeholder="搜索产品名称..." value={kw} onChange={(e) => setKw(e.target.value)} style={{ width: 220 }} />
          <button className="btn btn-warning"><i className="fas fa-download" /> 导出</button>
        </div>
        <div style={{ overflow: 'auto', maxHeight: '68vh' }}>
          <table className="kz-table">
            <thead>
              <tr>
                <th>序号</th><th>货品编号</th><th>货品</th><th className="num">库存总量</th><th>规格</th><th>更新时间</th><th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.id}>
                  <td>{i + 1}</td>
                  <td>{r.codeNumber || '-'}</td>
                  <td><b>{r.productName}</b></td>
                  <td className="num"><b>{Number(r.totalQty || 0).toFixed(3)}</b></td>
                  <td>{r.specification || '-'}</td>
                  <td>{(r.lastUpdated || '').replace('T', ' ').substring(0, 16)}</td>
                  <td>
                    <input
                      type="number" step="0.001" defaultValue={Number(r.totalQty || 0)}
                      style={{ width: 90, padding: '4px 8px', border: '1px solid #ddd', borderRadius: 6 }}
                      onBlur={(e) => {
                        const v = Number(e.target.value)
                        if (v !== Number(r.totalQty)) editQty(r.id, v)
                      }}
                    />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#999', padding: 24 }}>暂无数据</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
