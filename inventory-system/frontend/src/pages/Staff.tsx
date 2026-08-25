import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getStaff, createStaff, updateStaff, deleteStaff, getStaffPermissions, saveStaffPermissions } from '../api'
import { flashAfterRow, useRowHighlight } from '../utils/rowHighlight'
import '../styles/staff.css'
import '../styles/perm-tree.css'
import ModalClose from '../components/ModalClose'

// ---------- 账号类型 → 职位 ----------
export const positionsByAccountType: Record<string, string[]> = {
  'special': ['BOSS', 'PA', 'CAO', 'CSO', 'COO'],
  'hr': ['CHO', 'VP OF HR', 'HR DIRECTOR', 'SENIOR HR MANAGER', 'HR MANAGER', 'HR SUPERVISOR', 'SENIOR HR EXECUTIVE', 'HR EXECUTIVE', 'JUNIOR HR EXECUTIVE', 'HR INTERN'],
  'account': ['CFO', 'FINANCE MANAGER', 'ACCOUNT SUPERVISOR', 'ACCOUNT EXECUTIVE', 'ACCOUNT INTERN'],
  'media': ['CVO', 'VP VISUAL', 'VISUAL DIRECTOR', 'SR.MEDIA MANAGER', 'MEDIA MANAGER', 'MEDIA LEAD', 'SR.VIDEO CREATOR', 'VIDEO CREATOR', 'JR.VIDEO CREATOR', 'MEDIA INTERN'],
  'marketing': ['CMO', 'VP OF MARKETING', 'MARKETING DIRECTOR', 'SR.MARKETING MANAGER', 'MARKETING MANAGER', 'ASST.MARKETING MANAGER', 'SR.MARKETING EXEC', 'MARKETING EXEC', 'JR.MARKETING EXEC', 'MARKETING INTERN'],
  'support': ['VO OF KS', 'KITCHEN.SUP DIRECTOR', 'SENIOR KITCHEN SUP MANAGER', 'KITCHEN SUP MANAGER', 'KITCHEN SUPPORT LEAD', 'SENIOR KITCHEN SUPPORT', 'KITCHEN SUPPORT', 'JUNIOR KITCHEN SUPPORT', 'KITCHEN SUPPORT INTERN'],
  'production': ['VP OF OPERATIONS', 'OPERATIONS DIRECTOR', 'SNR.OPERATIONS MANAGER', 'PRODUCTION MANAGER', 'TEAM LEAD', 'SENIOR PRODUCTION', 'OPERATOR', 'JUNIOR OPERATOR', 'OPERATOR INTERN'],
  'r&d': ['VP PF R&D', 'R&D DIRECTOR', 'SENIOR R&D MANAGER', 'R&D MANAGER', 'LEAD R&D', 'SENIOR R&D', 'R&D', 'JUNIOR R&D', 'R&D INTERN'],
  'technical': ['CTO', 'VP OF TECH', 'TECH DIRECTOR', 'SR.ENGN.MANAGER', 'ENG.MANAGER', 'TECH LEAD', 'SR.TECH ENGINEER', 'TECH ENGINEER', 'JR.TECH ENGINEER', 'ENGINEER INTERN'],
  'design': ['CBO', 'VP OF DESIGN', 'DESIGN DIRECTOR', 'SENIOR DESIGN MANAGER', 'DESIGN MANAGER', 'DESIGN SUPERVISOR', 'GRAPHIC DESIGNER', 'JUNIOR GRAPHIC DESIGNER', 'DESIGN ASSISTANT', 'DESIGNER INTERN'],
  'operation': ['OPERATION MANAGER'],
  'service': ['MANAGER', 'ASST.MANAGER', 'SUPERVISOR', 'SENIOR CAPTAIN', 'CAPTAIN', 'SENIOR WAITER', 'WAITER'],
  'sushi': ['HEAD CHEF', 'OUTLET CHEF', 'ASST.CHEF', 'COMIS 1', 'COMIS 2', 'COMIS 3', 'SUSHI HELPER'],
  'kitchen': ['HEAD CHEF', 'OUTLET CHEF', 'ASST.CHEF', 'COMIS 1', 'COMIS 2', 'COMIS 3', 'KITCHEN HELPER']
}
export const accountTypeLabels: Record<string, string> = {
  'special': '特殊', 'hr': '人事部', 'account': '会计部', 'media': '媒体制作部', 'marketing': '推广部',
  'support': '支援部', 'production': '生产部', 'r&d': '研发部', 'technical': '科技部', 'design': '设计部',
  'operation': 'Operation', 'service': '前台', 'sushi': 'Sushi Bar', 'kitchen': '厨房'
}
export const branchLabels: Record<string, string> = {
  kh: 'KH', j1: 'J1 (Midvalley Southkey)', j2: 'J2 (Paradigm Mall)', j3: 'J3 (Desa Tebrau)'
}
const typeOrder: Record<string, number> = { special: 1, hr: 2, account: 3, media: 4, marketing: 5, support: 6, production: 7, 'r&d': 8, technical: 9, design: 10, operation: 11, service: 12, sushi: 13, kitchen: 14 }

interface StaffUser {
  id: number
  username?: string
  usernameCn?: string
  nickname?: string
  email?: string
  accountType?: string
  position?: string
  phoneNumber?: string
  branch?: string
  icNumber?: string
  bankName?: string
  bankAccount?: string
  homeAddress?: string
  currentAddress?: string
  city?: string
  state?: string
  postcode?: string
  dateOfBirth?: string
  gender?: string
  nationality?: string
  race?: string
  emergencyContactName?: string
  emergencyPhoneNumber?: string
  bankAccountHolderEn?: string
  createdAt?: string
}

export interface PermState {
  l1: Set<string>
  l2: Record<string, Set<string>>
  page: Record<string, any>
  brand: Record<string, any>
  report: Set<string>
  restaurant: Set<string>
}

// ================= 权限树组件 =================
export function PermTree({ value, onChange, compact }: { value: PermState; onChange: (v: PermState) => void; compact?: boolean }) {
  // 对齐旧系统：权限树默认折叠（add_employee.php 实测 l2 容器 height:0）
  const [open1, setOpen1] = useState<Set<string>>(new Set())
  const [open2, setOpen2] = useState<Set<string>>(new Set())
  const [detail, setDetail] = useState<string | null>(null)
  const [storeOpen, setStoreOpen] = useState<Set<string>>(new Set())

  const toggle1 = (k: string) => {
    setOpen1(prev => {
      const n = new Set(prev)
      if (n.has(k)) n.delete(k); else n.add(k)
      return n
    })
  }
  const toggle2 = (k: string) => {
    setOpen2(prev => {
      const n = new Set(prev)
      if (n.has(k)) n.delete(k); else n.add(k)
      return n
    })
  }

  // 三级级联映射：二级选中 → 对应三级 checkbox 全选/清空（对齐线上 syncLevel3Permissions）
  const syncLevel3 = (level2Key: string, checked: boolean) => {
    const page = JSON.parse(JSON.stringify(value.page))
    const brand = JSON.parse(JSON.stringify(value.brand))
    const doPage = (key: string, section: string, vals: string[]) => {
      if (!page[key]) page[key] = {}
      page[key][section] = checked ? vals : []
    }
    if (level2Key === 'stock_inventory') {
      doPage('stock_inventory', 'system', ['central', 'j1', 'j2', 'j3'])
      doPage('stock_inventory', 'views', ['list', 'records', 'remark', 'product', 'apply', 'approve', 'sot'])
      if (!page.stock_inventory) page.stock_inventory = {}
      page.stock_inventory.is_shipper = checked
    }
    if (level2Key === 'kpi_upload') {
      doPage('kpi_upload', 'system', ['j1', 'j2', 'j3'])
      doPage('kpi_upload', 'type', ['kpi', 'cost'])
    }
    if (level2Key === 'kunzz_holdings') {
      if (!brand.kunzz_holdings) brand.kunzz_holdings = {}
      brand.kunzz_holdings.blueprint = checked ? ['blueprint'] : []
    }
    if (level2Key === 'tokyo_cuisine') {
      if (!brand.tokyo_cuisine) brand.tokyo_cuisine = {}
      brand.tokyo_cuisine.j1 = checked ? ['schedule'] : []
      brand.tokyo_cuisine.j2 = checked ? ['schedule'] : []
    }
    if (level2Key === 'tokyo_izakaya') {
      if (!brand.tokyo_izakaya) brand.tokyo_izakaya = {}
      brand.tokyo_izakaya.j3 = checked ? ['schedule'] : []
    }
    return { page, brand }
  }
  // 一级 checkbox 勾选 → 级联二级/三级（对齐线上 syncLevel2Permissions）
  const toggleL1 = (k: string) => {
    const n = { ...value, l1: new Set(value.l1) }
    const checked = !n.l1.has(k)
    if (checked) n.l1.add(k); else n.l1.delete(k)
    // 级联二级
    n.l2 = { ...value.l2, [k]: new Set() }
    const subKeys = SUBKEYS[k] || []
    if (checked) subKeys.forEach(sk => n.l2[k].add(sk))
    // 级联三级
    const { page, brand } = syncLevel3(k, checked)
    n.page = page
    n.brand = brand
    onChange(n)
  }
  const toggleL2 = (parent: string, k: string) => {
    const n = { ...value, l2: { ...value.l2, [parent]: new Set(value.l2[parent] || []) } }
    const checked = !n.l2[parent].has(k)
    if (checked) n.l2[parent].add(k); else n.l2[parent].delete(k)
    // 父级一级自动选中（有子项选中）
    const l1n = new Set(value.l1)
    if (checked) l1n.add(parent)
    if (!checked && n.l2[parent].size === 0) l1n.delete(parent)
    n.l1 = l1n
    // 级联三级
    const { page, brand } = syncLevel3(k, checked)
    n.page = page
    n.brand = brand
    onChange(n)
  }
  const setPage = (key: string, section: string, v: string, checked: boolean) => {
    const page = JSON.parse(JSON.stringify(value.page))
    if (!page[key]) page[key] = {}
    const arr = Array.isArray(page[key][section]) ? [...page[key][section]] : []
    if (checked && !arr.includes(v)) arr.push(v)
    if (!checked) { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1) }
    page[key][section] = arr
    onChange({ ...value, page })
  }
  const setBrandPage = (brandKey: string, store: string, v: string, checked: boolean) => {
    const brand = JSON.parse(JSON.stringify(value.brand))
    if (!brand[brandKey]) brand[brandKey] = {}
    if (brandKey === 'kunzz_holdings') {
      brand[brandKey].blueprint = checked ? ['blueprint'] : []
    } else {
      const arr = Array.isArray(brand[brandKey][store]) ? [...brand[brandKey][store]] : []
      if (checked && !arr.includes(v)) arr.push(v)
      if (!checked) { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1) }
      brand[brandKey][store] = arr
    }
    onChange({ ...value, brand })
  }

  const sec = (k: string, label: string, subs: { key: string; label: string; has3?: string }[]) => (
    <div key={k} className="perm-level-1">
      <div className={'perm-level-1-item has-level-3' + (open1.has(k) ? ' expanded' : '')} data-perm={k} onClick={() => toggle1(k)}>
        <label className="perm-checkbox-label" onClick={(e) => { if ((e.target as HTMLElement).tagName !== 'INPUT') e.preventDefault() }}>
          <input type="checkbox" className="perm-l1-check" value={k}
            ref={(el) => {
              if (el) {
                const subs = (value.l2[k] || new Set())
                const parentOn = value.l1.has(k)
                const someOn = subs.size > 0
                el.indeterminate = !parentOn && someOn
              }
            }}
            checked={value.l1.has(k)}
            onChange={(e) => { e.stopPropagation(); toggleL1(k) }} />
          <span className="perm-arrow">{open1.has(k) ? '▼' : '▶'}</span>
          <strong>{label}</strong>
        </label>
      </div>
      <div className={'perm-level-2-container' + (open1.has(k) ? ' expanded' : '')} data-parent={k}>
          {subs.map(s => (
            <div key={s.key} className={'perm-level-2-item' + (s.has3 ? ' has-level-3' : '') + (open2.has(s.key) ? ' expanded' : '')} data-sub={s.has3}
              onClick={() => { if (s.has3) { toggle2(s.key); setDetail(s.has3) } }}>
              <label className="perm-checkbox-label" onClick={(e) => { if ((e.target as HTMLElement).tagName !== 'INPUT') e.preventDefault() }}>
                <input type="checkbox" className="perm-l2-check" data-parent={k} value={s.key}
                  checked={(value.l2[k] || new Set()).has(s.key)}
                  onChange={(e) => { e.stopPropagation(); toggleL2(k, s.key) }} />
                {s.has3 && (
                  <span className="perm-arrow-sub" onClick={(e) => { e.preventDefault(); toggle2(s.key); setDetail(s.has3 || null) }}>
                    {open2.has(s.key) ? '▼' : '▶'}
                  </span>
                )}
                <span>{s.label}</span>
              </label>
            </div>
          ))}
        </div>
    </div>
  )

  const detailPanel = () => {
    if (!detail) {
      return (
        <div className="perm-detail-placeholder">
          <i className="fas fa-hand-pointer" style={{ fontSize: 48, color: '#d1d5db', marginBottom: 15 }}></i>
          <p style={{ color: '#9ca3af', fontSize: 14 }}>点击左侧带有箭头的选项<br />查看详细配置</p>
        </div>
      )
    }
    if (detail === 'kunzz_holdings') {
      return (
        <div className="perm-detail-content active" style={{ display: 'block' }}>
          <div className="perm-detail-header">
            <strong>KUNZZ HOLDINGS SDN BHD</strong>
            <button type="button" className="perm-close-btn" onClick={() => setDetail(null)}>×</button>
          </div>
          <div className="perm-level-3-section">
            <div className="perm-section-title">页面权限</div>
            <label><input type="checkbox" className="perm-page-blueprint" data-brand="kunzz_holdings" value="blueprint"
              checked={!!(value.brand.kunzz_holdings?.blueprint?.length)}
              onChange={(e) => setBrandPage('kunzz_holdings', '', 'blueprint', e.target.checked)} /> 企业蓝图</label>
          </div>
        </div>
      )
    }
    if (detail === 'tokyo_cuisine') {
      return (
        <div className="perm-detail-content active" style={{ display: 'block' }}>
          <div className="perm-detail-header">
            <strong>TOKYO JAPANESE CUISINE SDN BHD</strong>
            <button type="button" className="perm-close-btn" onClick={() => setDetail(null)}>×</button>
          </div>
          <div className="perm-level-3-section">
            <div className="perm-section-title">店面</div>
            {['j1', 'j2'].map(s => (
              <div key={s} className={'perm-store-item' + (storeOpen.has(s) ? ' expanded' : '')} data-store={s}>
                <label className="perm-checkbox-label" onClick={() => {
                  setStoreOpen(prev => {
                    const n = new Set(prev)
                    if (n.has(s)) n.delete(s); else n.add(s)
                    return n
                  })
                }}>
                  <span className="perm-arrow-store">{storeOpen.has(s) ? '▼' : '▶'}</span>
                  <span>{s.toUpperCase()} (Midvalley Southkey)</span>
                </label>
                <div className="perm-store-content" style={{ display: storeOpen.has(s) ? 'block' : 'none' }}>
                  <div className="perm-section-title">页面权限</div>
                  <label><input type="checkbox" className="perm-page-schedule" data-store={s} data-brand="tokyo_cuisine" value="schedule"
                    checked={(value.brand.tokyo_cuisine?.[s] || []).includes('schedule')}
                    onChange={(e) => setBrandPage('tokyo_cuisine', s, 'schedule', e.target.checked)} /> 员工排班表</label>
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    }
    if (detail === 'tokyo_izakaya') {
      return (
        <div className="perm-detail-content active" style={{ display: 'block' }}>
          <div className="perm-detail-header">
            <strong>TOKYO IZAKAYA SDN BHD</strong>
            <button type="button" className="perm-close-btn" onClick={() => setDetail(null)}>×</button>
          </div>
          <div className="perm-level-3-section">
            <div className="perm-section-title">店面</div>
            <div className={'perm-store-item' + (storeOpen.has('j3') ? ' expanded' : '')} data-store="j3">
              <label className="perm-checkbox-label" onClick={() => {
                setStoreOpen(prev => {
                  const n = new Set(prev)
                  if (n.has('j3')) n.delete('j3'); else n.add('j3')
                  return n
                })
              }}>
                <span className="perm-arrow-store">{storeOpen.has('j3') ? '▼' : '▶'}</span>
                <span>J3 (Desa Tebrau)</span>
              </label>
              <div className="perm-store-content" style={{ display: storeOpen.has('j3') ? 'block' : 'none' }}>
                <div className="perm-section-title">页面权限</div>
                <label><input type="checkbox" className="perm-page-schedule" data-store="j3" data-brand="tokyo_izakaya" value="schedule"
                  checked={(value.brand.tokyo_izakaya?.j3 || []).includes('schedule')}
                  onChange={(e) => setBrandPage('tokyo_izakaya', 'j3', 'schedule', e.target.checked)} /> 员工排班表</label>
              </div>
            </div>
          </div>
        </div>
      )
    }
    if (detail === 'kpi_upload') {
      return (
        <div className="perm-detail-content active" style={{ display: 'block' }}>
          <div className="perm-detail-header">
            <strong>数据上传</strong>
            <button type="button" className="perm-close-btn" onClick={() => setDetail(null)}>×</button>
          </div>
          <div className="perm-level-3-section">
            <div className="perm-section-title">系统选项</div>
            {['j1', 'j2', 'j3'].map(v => (
              <label key={v}><input type="checkbox" className="perm-upload-system" value={v}
                checked={(value.page.kpi_upload?.system || []).includes(v)}
                onChange={(e) => setPage('kpi_upload', 'system', v, e.target.checked)} /> {v.toUpperCase()}</label>
            ))}
          </div>
          <div className="perm-level-3-section">
            <div className="perm-section-title">上传类型</div>
            {[['kpi', 'KPI'], ['cost', '成本']].map(([v, l]) => (
              <label key={v}><input type="checkbox" className="perm-upload-type" value={v}
                checked={(value.page.kpi_upload?.type || []).includes(v)}
                onChange={(e) => setPage('kpi_upload', 'type', v, e.target.checked)} /> {l}</label>
            ))}
          </div>
        </div>
      )
    }
    if (detail === 'stock_inventory') {
      return (
        <div className="perm-detail-content active" style={{ display: 'block' }}>
          <div className="perm-detail-header">
            <strong>库存</strong>
            <button type="button" className="perm-close-btn" onClick={() => setDetail(null)}>×</button>
          </div>
          <div className="perm-level-3-section">
            <div className="perm-section-title">系统选项</div>
            {['central', 'j1', 'j2', 'j3'].map(v => (
              <label key={v}><input type="checkbox" className="perm-stock-system" value={v}
                checked={(value.page.stock_inventory?.system || []).includes(v)}
                onChange={(e) => setPage('stock_inventory', 'system', v, e.target.checked)} /> {v === 'central' ? '中央' : v.toUpperCase()}</label>
            ))}
          </div>
          <div className="perm-level-3-section">
            <div className="perm-section-title">视图选项</div>
            {[['list', '总库存'], ['records', '进出货'], ['remark', '货品备注'], ['product', '货品种类'], ['sot', '货品异常']].map(([v, l]) => (
              <label key={v}><input type="checkbox" className="perm-stock-view" value={v}
                checked={(value.page.stock_inventory?.views || []).includes(v)}
                onChange={(e) => setPage('stock_inventory', 'views', v, e.target.checked)} /> {l}</label>
            ))}
            <div style={{ marginLeft: 20, marginTop: 5, display: 'flex', flexDirection: 'column', gap: 5, borderLeft: '2px solid #eee', paddingLeft: 10 }}>
              <label style={{ fontSize: '0.9em' }}><input type="checkbox" className="perm-stock-shipper" value="is_shipper"
                checked={value.page.stock_inventory?.is_shipper === true}
                onChange={(e) => {
                  const page = JSON.parse(JSON.stringify(value.page))
                  if (!page.stock_inventory) page.stock_inventory = {}
                  page.stock_inventory.is_shipper = e.target.checked
                  onChange({ ...value, page })
                }} /> 出货人</label>
              <label style={{ fontSize: '0.9em' }}><input type="checkbox" className="perm-stock-view" value="apply"
                checked={(value.page.stock_inventory?.views || []).includes('apply')}
                onChange={(e) => setPage('stock_inventory', 'views', 'apply', e.target.checked)} /> 申请权限 (Applicant)</label>
              <label style={{ fontSize: '0.9em' }}><input type="checkbox" className="perm-stock-view" value="approve"
                checked={(value.page.stock_inventory?.views || []).includes('approve')}
                onChange={(e) => setPage('stock_inventory', 'views', 'approve', e.target.checked)} /> 批准权限 (Approver)</label>
            </div>
          </div>
        </div>
      )
    }
    return null
  }

  return (
    <div className="perm-layout-container" style={{ height: compact ? 460 : 420 }}>
      <div className="perm-tree-container" style={{ overflowY: 'auto' }}>
        {sec('brand', '集团架构', [
          { key: 'kunzz_holdings', label: 'KUNZZ HOLDINGS', has3: 'kunzz_holdings' },
          { key: 'tokyo_cuisine', label: 'TOKYO CUISINE', has3: 'tokyo_cuisine' },
          { key: 'tokyo_izakaya', label: 'TOKYO IZAKAYA', has3: 'tokyo_izakaya' }
        ])}
        {sec('analytics', '营收数据', [
          { key: 'kpi_report', label: 'KPI报表' },
          { key: 'kpi_upload', label: '数据上传', has3: 'kpi_upload' }
        ])}
        {sec('hr', '人事管理', [{ key: 'staff_management', label: '职员管理' }])}
        {sec('resource', '资源总库', [
          { key: 'stock_inventory', label: '库存', has3: 'stock_inventory' },
          { key: 'dishware', label: '碗碟' },
          { key: 'price_comparison', label: '价格对比' }
        ])}
        {sec('visual', '视觉管理', [])}
      </div>
      <div className="perm-detail-card" style={{ flex: '0 0 300px' }}>
        {detailPanel()}
      </div>
    </div>
  )
}

export const NATIONALITIES = ['Afghanistan', 'Armenia', 'Azerbaijan', 'Bahrain', 'Bangladesh', 'Bhutan', 'Brunei', 'Cambodia', 'China', 'Cyprus', 'East Timor (Timor-Leste)', 'Georgia', 'India', 'Indonesia', 'Iran', 'Iraq', 'Israel', 'Japan', 'Jordan', 'Kazakhstan', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Lebanon', 'Malaysia', 'Maldives', 'Mongolia', 'Myanmar (Burma)', 'Nepal', 'North Korea', 'Oman', 'Pakistan', 'Palestine', 'Philippines', 'Qatar', 'Saudi Arabia', 'Singapore', 'South Korea', 'Sri Lanka', 'Syria', 'Taiwan', 'Tajikistan', 'Thailand', 'Turkey', 'Turkmenistan', 'United Arab Emirates', 'Uzbekistan', 'Vietnam', 'Yemen']
export const RACES = ['Malay', 'Chinese', 'Indian', 'Bumiputera (Sabah/Sarawak)', 'Indonesian', 'Bangladeshi', 'Nepali', 'Myanmar', 'Filipino', 'Indian (Foreign)', 'Pakistani', 'Vietnamese', 'Cambodian', 'Others (Foreign)']
export const BANKS = ['Maybank (Malayan Banking Berhad)', 'CIMB Bank', 'Public Bank', 'RHB Bank', 'Hong Leong Bank', 'AmBank', 'Alliance Bank', 'Affin Bank', 'Bank Islam Malaysia', 'Agrobank', 'Bank Simpanan Nasional (BSN)', 'HSBC Bank Malaysia', 'OCBC Bank (Malaysia)', 'Standard Chartered Bank Malaysia', 'United Overseas Bank (UOB Malaysia)', 'Bank of China (Malaysia)']

const SUBKEYS: Record<string, string[]> = {
  brand: ['kunzz_holdings', 'tokyo_cuisine', 'tokyo_izakaya'],
  analytics: ['kpi_report', 'kpi_upload'],
  hr: ['staff_management'],
  resource: ['stock_inventory', 'dishware', 'price_comparison'],
  visual: []
}

export const defaultPerms = (): PermState => ({
  l1: new Set(['brand', 'analytics', 'hr', 'resource', 'visual']),
  l2: {
    brand: new Set(['kunzz_holdings', 'tokyo_cuisine', 'tokyo_izakaya']),
    analytics: new Set(['kpi_report', 'kpi_upload']),
    hr: new Set(['staff_management']),
    resource: new Set(['stock_inventory', 'dishware', 'price_comparison'])
  },
  page: {
    kpi_upload: { system: ['j1', 'j2', 'j3'], type: ['kpi', 'cost'] },
    stock_inventory: { system: ['central', 'j1', 'j2', 'j3'], views: ['list', 'records', 'remark', 'product', 'apply', 'approve', 'sot'], is_shipper: true }
  },
  brand: {
    kunzz_holdings: { blueprint: ['blueprint'] },
    tokyo_cuisine: { j1: ['schedule'], j2: ['schedule'] },
    tokyo_izakaya: { j3: ['schedule'] }
  },
  report: new Set(),
  restaurant: new Set()
})

export const emptyPerms = (): PermState => ({
  l1: new Set(), l2: {}, page: {}, brand: {}, report: new Set(), restaurant: new Set()
})

export default function Staff() {
  const [users, setUsers] = useState<StaffUser[]>([])
  // 新增职员后返回列表定位高亮（按 username）
  const { flash, isHl } = useRowHighlight((u: any) => String(u.username))
  const [kw, setKw] = useState('')
  // 保存中（防连点/重复提交）
  const [saving, setSaving] = useState(false)
  const [branchL1, setBranchL1] = useState('all')
  const [branchL2, setBranchL2] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showPerm, setShowPerm] = useState(false)
  const [showDownload, setShowDownload] = useState(false)
  const [addBranchOpen, setAddBranchOpen] = useState(false)
  const [editBranchOpen, setEditBranchOpen] = useState(false)
  const [branchL1Open, setBranchL1Open] = useState(false)
  const [branchL2Open, setBranchL2Open] = useState(false)
  const [permWarning, setPermWarning] = useState(false)
  const [permSaving, setPermSaving] = useState(false)
  const [editUser, setEditUser] = useState<StaffUser | null>(null)
  const [permUser, setPermUser] = useState<StaffUser | null>(null)
  const [permState, setPermState] = useState<PermState>(defaultPerms())
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null)
  const [addForm, setAddForm] = useState<Record<string, string>>({})
  const [addBranches, setAddBranches] = useState<string[]>([])
  const [addPerms, setAddPerms] = useState<PermState>(emptyPerms())
  const [editForm, setEditForm] = useState<Record<string, string>>({})
  const [editBranches, setEditBranches] = useState<string[]>([])

  const showMsg = (msg: string, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = async () => {
    try {
      const list = await getStaff()
      setUsers(list)
      return list
    } catch { /* ignore */ }
  }
  useEffect(() => { load() }, [])

  // 从新增职员页返回：自动滚动到新职员并高亮
  useEffect(() => {
    const newUser = sessionStorage.getItem('staff_new_user')
    if (!newUser) return
    sessionStorage.removeItem('staff_new_user')
    load().then(() => {
      flashAfterRow('body', 'td:nth-child(4)', newUser, flash)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = useMemo(() => {
    const arr = [...users]
    arr.sort((a, b) => {
      const oa = typeOrder[a.accountType || ''] || 999
      const ob = typeOrder[b.accountType || ''] || 999
      if (oa !== ob) return oa - ob
      const pa = (a.position || '').trim()
      const pb = (b.position || '').trim()
      const ia = positionsByAccountType[a.accountType || '']?.indexOf(pa) ?? 999
      const ib = positionsByAccountType[b.accountType || '']?.indexOf(pb) ?? 999
      if (ia !== ib) return ia - ib
      return (a.username || '').localeCompare(b.username || '')
    })
    return arr
  }, [users])

  const filtered = useMemo(() => {
    let arr = sorted
    if (kw) {
      const k = kw.toLowerCase()
      arr = arr.filter(u => (u.username || '').toLowerCase().includes(k) || (u.email || '').toLowerCase().includes(k))
    }
    if (branchL1 === 'kunzz') {
      arr = arr.filter(u => (u.branch || '').split(',').map(b => b.trim()).includes('kh'))
    } else if (branchL1 === 'branch') {
      const branches = (u: StaffUser) => (u.branch || '').split(',').map(b => b.trim()).filter(b => b && b !== 'kh')
      arr = arr.filter(u => branchL2 ? branches(u).includes(branchL2) : branches(u).length > 0)
    }
    return arr
  }, [sorted, kw, branchL1, branchL2])

  const openAdd = () => {
    setAddForm({})
    setAddBranches([])
    setAddPerms(defaultPerms())
    setPermWarning(false)
    setShowAdd(true)
  }

  const submitAdd = async () => {
    if (saving) return
    if (!addForm.username || !addForm.email || !addForm.account_type) {
      showMsg('请填写所有必填字段（英文姓名、邮箱、账号类型）！', 'error')
      return
    }
    const anyPerm = addPerms.l1.size > 0 || Object.values(addPerms.l2).some(s => s.size > 0)
    if (!anyPerm) {
      setPermWarning(true)
      showMsg('请至少选择一项用户权限', 'error')
      return
    }
    setSaving(true)
    const permData = extractPerms(addPerms)
    try {
      // 密码/申请码由后端生成（对齐线上 add_user）
      const res = await createStaff({
        username: addForm.username, usernameCn: addForm.username_cn, email: addForm.email,
        phoneNumber: addForm.phone_number, icNumber: addForm.ic_number, accountType: addForm.account_type,
        position: addForm.position, gender: addForm.gender, bankAccount: addForm.bank_account,
        branch: addBranches.join(','),
        ...permData
      })
      // 提示对齐线上 addNewUser
      let msg = `职员 "${res.user.username}" 添加成功！`
      if (res.emailSent) {
        msg += ` 登录信息已发送到 ${res.user.email}`
      } else {
        msg += ` 申请码：${res.code}，临时密码：${res.defaultPassword}`
      }
      showMsg(msg)
      setShowAdd(false)
      load()
    } catch (e: any) {
      showMsg(e?.message || '添加失败', 'error')
    }
    finally { setSaving(false) }
  }

  const openEdit = (u: StaffUser) => {
    setEditUser(u)
    setEditForm({
      username: u.username || '', username_cn: u.usernameCn || '', nickname: u.nickname || '',
      email: u.email || '', ic_number: u.icNumber || '', phone_number: u.phoneNumber || '',
      date_of_birth: u.dateOfBirth || '', gender: u.gender || '', nationality: u.nationality || '',
      race: u.race || '', home_address: u.homeAddress || '', current_address: u.currentAddress || '',
      city: u.city || '', state: u.state || '', postcode: u.postcode || '', bank_name: u.bankName || '',
      bank_account: u.bankAccount || '', bank_account_holder_en: u.bankAccountHolderEn || '',
      emergency_contact_name: u.emergencyContactName || '', emergency_phone_number: u.emergencyPhoneNumber || '',
      account_type: u.accountType || '', position: u.position || ''
    })
    setEditBranches((u.branch || '').split(',').map(b => b.trim()).filter(Boolean))
    setShowEdit(true)
  }

  const submitEdit = async () => {
    if (saving) return
    if (!editUser) return
    setSaving(true)
    try {
      await updateStaff(editUser.id, {
        username: editForm.username, usernameCn: editForm.username_cn, nickname: editForm.nickname,
        email: editForm.email, icNumber: editForm.ic_number, phoneNumber: editForm.phone_number,
        dateOfBirth: editForm.date_of_birth, gender: editForm.gender, nationality: editForm.nationality,
        race: editForm.race, homeAddress: editForm.home_address, currentAddress: editForm.current_address,
        city: editForm.city, state: editForm.state, postcode: editForm.postcode,
        bankName: editForm.bank_name, bankAccount: editForm.bank_account,
        bankAccountHolderEn: editForm.bank_account_holder_en,
        emergencyContactName: editForm.emergency_contact_name,
        emergencyPhoneNumber: editForm.emergency_phone_number,
        accountType: editForm.account_type, position: editForm.position,
        branch: editBranches.join(',')
      })
      showMsg('职员信息已更新')
      setShowEdit(false)
      load()
    } catch (e: any) {
      showMsg(e?.message || '更新失败', 'error')
    }
    finally { setSaving(false) }
  }

  const confirmDelete = (u: StaffUser) => {
    if (!window.confirm('确定要删除职员 "' + (u.username || '') + '" 吗？此操作不可恢复！')) return
    deleteStaff(u.id).then(() => { showMsg('职员已删除'); load() }).catch(() => showMsg('删除失败', 'error'))
  }

  const openPermModal = async (u: StaffUser) => {
    setPermUser(u)
    setPermState(defaultPerms())
    setShowPerm(true)
    try {
      const data: any = await getStaffPermissions(u.id)
      setPermState(loadPerms(data))
    } catch { /* ignore */ }
  }

  const savePerm = async () => {
    if (!permUser || permSaving) return
    const anyPerm = permState.l1.size > 0 || Object.values(permState.l2).some(s => s.size > 0)
    if (!anyPerm) {
      showMsg('请至少选择一项用户权限', 'error')
      return
    }
    setPermSaving(true)
    try {
      await saveStaffPermissions(permUser.id, extractPerms(permState))
      showMsg('权限已保存')
      setShowPerm(false)
    } catch { showMsg('保存失败', 'error') }
    setPermSaving(false)
  }

  const extractPerms = (v: PermState) => ({
    permissions: [...v.l1],
    submenu_permissions: Object.fromEntries(Object.entries(v.l2).map(([k, s]) => [k, [...s]])),
    page_permissions: v.page,
    brand_permissions: v.brand,
    report_permissions: [...v.report],
    restaurant_permissions: [...v.restaurant]
  })

  const loadPerms = (data: any): PermState => {
    const perms: string[] = Array.isArray(data.permissions) ? data.permissions : ['brand', 'analytics', 'hr', 'resource', 'visual']
    const submenu: Record<string, string[]> = data.submenu_permissions || {}
    const page: Record<string, any> = data.page_permissions || {}
    const brand: Record<string, any> = data.brand_permissions || {}
    const report: string[] = Array.isArray(data.report_permissions) ? data.report_permissions : []
    const restaurant: string[] = Array.isArray(data.restaurant_permissions) ? data.restaurant_permissions : []
    const l1 = new Set(perms)
    const l2: Record<string, Set<string>> = {}
    Object.entries(submenu).forEach(([k, arr]) => {
      // 父级未选中时子级不勾选（对齐线上 setPermCheckboxes parentEnabled）
      l2[k] = l1.has(k) ? new Set(Array.isArray(arr) ? arr : []) : new Set()
    })
    return {
      l1, l2, page, brand,
      report: new Set(report), restaurant: new Set(restaurant)
    }
  }

  const branchTags = (b?: string) => (b || '').split(',').map(x => x.trim()).filter(Boolean)

  const fg = (label: string, field: string, form: Record<string, string>, setForm: (f: Record<string, string>) => void, required?: boolean, placeholder?: string) => (
    <div className="form-group">
      <label htmlFor={field}>{label}{required ? ' *' : ''}</label>
      <input type="text" id={field} name={field} value={form[field] || ''} placeholder={placeholder || ''}
        onChange={(e) => setForm({ ...form, [field]: e.target.value })} />
    </div>
  )

  return (
    <div className="staff-root">
      <div className="container">
        <div className="header">
          <h1>职员管理系统</h1>
        </div>

        <div className="generate-form">
          <div id="messageArea"></div>
          <div className="form-row" style={{ justifyContent: 'space-between', alignItems: 'end' }}>
            <div className="form-group" style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Link to="/staff/add" className="btn-generate" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <i className="fas fa-user-plus"></i> 添加新职员
              </Link>
              <button type="button" className="btn-generate" onClick={() => setShowDownload(true)}>
                <i className="fas fa-download"></i> 下载面试表
              </button>
            </div>
            <div className="form-group" style={{ flex: '0 0 auto', position: 'relative', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ position: 'relative' }}>
                <input type="text" id="searchInput" placeholder="输入英文姓名或邮箱进行搜索..."
                  value={kw}
                  onChange={(e) => setKw(e.target.value)}
                  style={{ padding: '10px 40px 10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 'clamp(8px, 0.74vw, 14px)' }} />
                {kw && (
                  <button type="button" onClick={() => setKw('')}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 16 }}>
                    ×
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="table-container">
          <div className="table-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <span>职员列表</span>
            <div className="branch-filter-wrap">
              <div style={{ position: 'relative' }}>
                <button id="branchL1Btn" className="branch-filter-btn" onClick={() => setBranchL1Open(!branchL1Open)}>
                  <span id="branchL1Label">{branchL1 === 'all' ? '全部' : branchL1 === 'kunzz' ? 'KH' : '分店'}</span>
                  <i className="fas fa-chevron-down" style={{ fontSize: 10, color: '#9ca3af' }}></i>
                </button>
                {branchL1Open && (
                  <div id="branchL1Dropdown" className="branch-filter-dropdown" style={{ display: 'block' }}>
                    <div className={'bl1-item' + (branchL1 === 'all' ? ' active' : '')} data-value="all" onClick={() => { setBranchL1('all'); setBranchL2(''); setBranchL1Open(false) }}>全部</div>
                    <div className={'bl1-item' + (branchL1 === 'kunzz' ? ' active' : '')} data-value="kunzz" onClick={() => { setBranchL1('kunzz'); setBranchL2(''); setBranchL1Open(false) }}>KH</div>
                    <div className={'bl1-item' + (branchL1 === 'branch' ? ' active' : '')} data-value="branch" onClick={() => { setBranchL1('branch'); setBranchL2(''); setBranchL1Open(false) }}>分店</div>
                  </div>
                )}
              </div>
              <div id="branchL2Container" style={{ position: 'relative', display: branchL1 === 'branch' ? 'block' : 'none' }}>
                <button id="branchL2Btn" className="branch-filter-btn" onClick={() => setBranchL2Open(!branchL2Open)}>
                  <span id="branchL2Label">{branchL2 ? branchL2.toUpperCase() : '-'}</span>
                  <i className="fas fa-chevron-down" style={{ fontSize: 10, color: '#9ca3af' }}></i>
                </button>
                {branchL2Open && (
                  <div id="branchL2Dropdown" className="branch-filter-dropdown" style={{ display: 'block' }}>
                    <div className="bl1-item" data-value="j1" onClick={() => { setBranchL2('j1'); setBranchL2Open(false) }}>J1</div>
                    <div className="bl1-item" data-value="j2" onClick={() => { setBranchL2('j2'); setBranchL2Open(false) }}>J2</div>
                    <div className="bl1-item" data-value="j3" onClick={() => { setBranchL2('j3'); setBranchL2Open(false) }}>J3</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="table-wrapper">
            <table id="codesTable">
              <thead>
                <tr>
                  <th>序号</th><th>所属公司</th><th>职位</th><th>英文姓名</th><th>邮箱</th><th>联络号码</th><th>操作</th>
                </tr>
              </thead>
              <tbody id="tableBody">
                {filtered.map((item, index) => (
                  <tr key={item.id} className={isHl(item) ? 'highlight-flash' : ''}>
                    <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{index + 1}</td>
                    <td style={{ textAlign: 'center' }}>
                      {branchTags(item.branch).length > 0
                        ? branchTags(item.branch).map(b => <span key={b} className="branch-tag">{b.toUpperCase()}</span>)
                        : <em style={{ color: '#bbb', fontSize: '0.75em' }}>无</em>}
                    </td>
                    <td><div style={{ fontWeight: 700, color: '#333' }}>{item.position || '-'}</div></td>
                    <td><div style={{ fontWeight: 500 }}>{item.username || '-'}</div></td>
                    <td>{item.email || '-'}</td>
                    <td>{item.phoneNumber || '-'}</td>
                    <td>
                      <div className="action-buttons">
                        <button className="btn-action btn-edit" title="编辑" onClick={() => openEdit(item)}>
                          <i className="fas fa-edit"></i>
                        </button>
                        <button className="btn-action btn-save" title="权限设定" style={{ background: '#ff8019' }} onClick={() => openPermModal(item)}>
                          <i className="fas fa-user-shield"></i>
                        </button>
                        <button className="btn-action btn-delete" title="删除" onClick={() => confirmDelete(item)}>
                          <i className="fas fa-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30, color: '#666' }}>📝 暂无数据</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 添加职员模态框 */}
      {showAdd && (
        <div id="addUserModal" className="modal" style={{ display: 'block' }} onClick={(e) => { if (e.target === e.currentTarget) setShowAdd(false) }}>
          <div className="modal-content" style={{ maxWidth: 1200, width: '85vw' }}>
            <div className="modal-header" style={{ color: '#10b981' }}>
              <i className="fas fa-user-plus"></i> 添加新职员
              <ModalClose onClick={() => setShowAdd(false)} />
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', gap: 30, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 400 }}>
                  <div className="form-section">
                    <div className="form-section-header">基本信息</div>
                    <div className="form-section-content">
                      <div className="form-row-2col">
                        {fg('英文姓名', 'username', addForm, setAddForm, true, '如: Tan Ah Kow')}
                        {fg('中文姓名', 'username_cn', addForm, setAddForm, false, '如: 陈亚狗')}
                      </div>
                      <div className="form-row-2col">
                        {fg('邮箱', 'email', addForm, setAddForm, true, 'example@mail.com')}
                        {fg('联络号码', 'phone_number', addForm, setAddForm, false)}
                      </div>
                      <div className="form-row-2col">
                        {fg('身份证号码', 'ic_number', addForm, setAddForm, false)}
                        <div className="form-group">
                          <label>所属公司</label>
                          <div className={'custom-multi-select' + (addBranchOpen ? ' active' : '')} id="add-branch-select-modal">
                            <div className="select-header" onClick={() => setAddBranchOpen(!addBranchOpen)}>
                              <span className="selected-text">{addBranches.length > 0 ? addBranches.map(b => branchLabels[b]).join(', ') : '请选择区域运营单位'}</span>
                              <i className="fas fa-chevron-down"></i>
                            </div>
                            <div className="select-options" style={{ display: addBranchOpen ? 'block' : 'none' }}>
                              {Object.entries(branchLabels).map(([v, l]) => (
                                <label key={v} className="checkbox-item"><input type="checkbox" name="branch[]" value={v}
                                  checked={addBranches.includes(v)} onChange={() => {
                                    setAddBranches(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])
                                  }} /> {l}</label>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="form-row-2col">
                        <div className="form-group">
                          <label htmlFor="add_account_type">账号类型 *</label>
                          <select id="add_account_type" name="account_type" value={addForm.account_type || ''}
                            onChange={(e) => setAddForm({ ...addForm, account_type: e.target.value, position: '' })}>
                            <option value="">请选择账号类型</option>
                            {Object.entries(accountTypeLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        </div>
                        <div className="form-group">
                          <label htmlFor="add_position">职位</label>
                          <select id="add_position" name="position" value={addForm.position || ''} disabled={!addForm.account_type}
                            onChange={(e) => setAddForm({ ...addForm, position: e.target.value })}>
                            <option value="">{addForm.account_type ? '请选择职位' : '请先选择账号类型'}</option>
                            {(positionsByAccountType[addForm.account_type || ''] || []).map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="form-section" style={{ marginTop: 20 }}>
                    <div className="form-section-header">更多资料 (可选)</div>
                    <div className="form-section-content">
                      <div className="form-row-2col">
                        <div className="form-group">
                          <label>性别</label>
                          <select value={addForm.gender || ''} onChange={(e) => setAddForm({ ...addForm, gender: e.target.value })}>
                            <option value="">请选择</option>
                            <option value="male">男</option>
                            <option value="female">女</option>
                          </select>
                        </div>
                        {fg('银行账号', 'bank_account', addForm, setAddForm)}
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ flex: 1.5, minWidth: 500, borderLeft: '1px solid #eee', paddingLeft: 30 }}>
                  <div className="form-section-header" style={{ marginBottom: 15 }}>初始权限配置</div>
                  <div className="perm-warning" style={{ display: permWarning ? 'block' : 'none', color: '#ef4444', background: '#fee2e2', padding: 10, borderRadius: 6, marginBottom: 15, fontSize: 13 }}>
                    <i className="fas fa-exclamation-triangle"></i> 请至少选择一项用户权限
                  </div>
                  <PermTree value={addPerms} onChange={setAddPerms} compact />
                </div>
              </div>
              <div className="modal-buttons" style={{ marginTop: 30, borderTop: '1px solid #eee', paddingTop: 20 }}>
                <button type="button" className="btn-action btn-save" onClick={submitAdd} disabled={saving} style={{ background: '#10b981' }}>
                  <i className={'fas ' + (saving ? 'fa-spinner fa-spin' : 'fa-check')}></i> {saving ? '添加中...' : '确认添加'}
                </button>
                <button type="button" className="btn-action btn-cancel" onClick={() => setShowAdd(false)}>
                  <i className="fas fa-times"></i> 取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 编辑职员模态框 */}
      {showEdit && editUser && (
        <div id="editUserModal" className="modal" style={{ display: 'block' }} onClick={(e) => { if (e.target === e.currentTarget) setShowEdit(false) }}>
          <div className="modal-content" style={{ maxWidth: 900, width: '80vw' }}>
            <div className="modal-header" style={{ color: '#f59e0b' }}>
              <i className="fas fa-user-edit"></i> 编辑职员信息
              <ModalClose onClick={() => setShowEdit(false)} />
            </div>
            <div className="modal-body">
              <div className="form-section">
                <div className="form-section-header">基本信息</div>
                <div className="form-section-content">
                  <div className="form-row-2col">
                    {fg('英文姓名', 'username', editForm, setEditForm, true)}
                    {fg('中文姓名', 'username_cn', editForm, setEditForm)}
                  </div>
                  <div className="form-row-2col">
                    {fg('昵称', 'nickname', editForm, setEditForm)}
                    {fg('邮箱', 'email', editForm, setEditForm, true)}
                  </div>
                </div>
              </div>
              <div className="form-section">
                <div className="form-section-header">个人资料</div>
                <div className="form-section-content">
                  <div className="form-row-3col">
                    {fg('身份证号码', 'ic_number', editForm, setEditForm)}
                    {fg('联络号码', 'phone_number', editForm, setEditForm)}
                    <div className="form-group">
                      <label>出生日期</label>
                      <input type="date" name="date_of_birth" value={editForm.date_of_birth || ''} onChange={(e) => setEditForm({ ...editForm, date_of_birth: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row-3col">
                    <div className="form-group">
                      <label>性别</label>
                      <select name="gender" value={editForm.gender || ''} onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}>
                        <option value="">请选择</option>
                        <option value="male">男</option>
                        <option value="female">女</option>
                        <option value="other">其他</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>国籍</label>
                      <select name="nationality" value={editForm.nationality || ''} onChange={(e) => setEditForm({ ...editForm, nationality: e.target.value })}>
                        <option value="">请选择国籍</option>
                        {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>种族</label>
                      <select name="race" value={editForm.race || ''} onChange={(e) => setEditForm({ ...editForm, race: e.target.value })}>
                        <option value="">请选择种族</option>
                        {RACES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="form-row-1col">
                    <div className="form-group">
                      <label>住址</label>
                      <textarea value={editForm.home_address || ''} rows={2} maxLength={255}
                        onChange={(e) => setEditForm({ ...editForm, home_address: e.target.value })} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="form-section">
                <div className="form-section-header">银行信息</div>
                <div className="form-section-content">
                  <div className="form-row-2col">
                    {fg('银行账户持有人', 'bank_account_holder_en', editForm, setEditForm)}
                    {fg('银行账号', 'bank_account', editForm, setEditForm)}
                  </div>
                  <div className="form-row-1col">
                    <div className="form-group">
                      <label>银行名称</label>
                      <select name="bank_name" value={editForm.bank_name || ''} onChange={(e) => setEditForm({ ...editForm, bank_name: e.target.value })}>
                        <option value="">请选择银行</option>
                        {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
              <div className="form-section">
                <div className="form-section-header">紧急联络人</div>
                <div className="form-section-content">
                  <div className="form-row-2col">
                    {fg('紧急联系人', 'emergency_contact_name', editForm, setEditForm)}
                    {fg('紧急联系人电话', 'emergency_phone_number', editForm, setEditForm)}
                  </div>
                </div>
              </div>
              <div className="form-section">
                <div className="form-section-header">账号设置</div>
                <div className="form-section-content">
                  <div className="form-row-1col">
                    <div className="form-group">
                      <label>所属公司</label>
                      <div className={'custom-multi-select' + (editBranchOpen ? ' active' : '')} id="edit-branch-select">
                        <div className="select-header" onClick={() => setEditBranchOpen(!editBranchOpen)}>
                          <span className="selected-text">{editBranches.length > 0 ? editBranches.map(b => branchLabels[b]).join(', ') : '请选择区域运营单位'}</span>
                          <i className="fas fa-chevron-down"></i>
                        </div>
                        <div className="select-options" style={{ display: editBranchOpen ? 'block' : 'none' }}>
                          {Object.entries(branchLabels).map(([v, l]) => (
                            <label key={v} className="checkbox-item"><input type="checkbox" name="branch[]" value={v}
                              checked={editBranches.includes(v)} onChange={() => {
                                setEditBranches(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])
                              }} /> {l}</label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="form-row-2col">
                    <div className="form-group">
                      <label>账号类型 *</label>
                      <select value={editForm.account_type || ''} onChange={(e) => setEditForm({ ...editForm, account_type: e.target.value, position: '' })}>
                        <option value="">请选择账号类型</option>
                        {Object.entries(accountTypeLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>职位</label>
                      <select value={editForm.position || ''} disabled={!editForm.account_type}
                        onChange={(e) => setEditForm({ ...editForm, position: e.target.value })}>
                        <option value="">{editForm.account_type ? '请选择职位' : '请先选择账号类型'}</option>
                        {(positionsByAccountType[editForm.account_type || ''] || []).map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-buttons">
                <button type="button" className="btn-action btn-save" onClick={submitEdit} disabled={saving} style={{ background: '#f59e0b' }}>
                  <i className={'fas ' + (saving ? 'fa-spinner fa-spin' : 'fa-check')}></i> {saving ? '保存中...' : '保存修改'}
                </button>
                <button type="button" className="btn-action btn-cancel" onClick={() => setShowEdit(false)}>
                  <i className="fas fa-times"></i> 取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 权限设定模态框 */}
      {showPerm && permUser && (
        <div id="permissionsModal" className="modal" style={{ display: 'block' }} onClick={(e) => { if (e.target === e.currentTarget) setShowPerm(false) }}>
          <div className="modal-content" style={{ maxWidth: 1200, width: '85vw' }}>
            <div className="modal-header" style={{ color: '#ff5c00', fontSize: 24, marginBottom: 20, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span><i className="fas fa-user-shield"></i> 用户权限设定 - {permUser.username || '未命名用户'}</span>
              <ModalClose onClick={() => setShowPerm(false)} />
            </div>
            <div className="modal-body">
              <PermTree value={permState} onChange={setPermState} />
              <div className="modal-buttons">
                <button type="button" className="btn-action btn-save" onClick={savePerm} disabled={permSaving}>
                  {permSaving ? <><div className="loading"></div>保存中...</> : '保存'}
                </button>
                <button type="button" className="btn-action btn-cancel" onClick={() => setShowPerm(false)}>取消</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 下载面试表模态框 */}
      {showDownload && (
        <div id="downloadModal" className="modal" style={{ display: 'block' }} onClick={(e) => { if (e.target === e.currentTarget) setShowDownload(false) }}>
          <div className="modal-content" style={{ maxWidth: 520 }}>
            <div className="modal-header" style={{ color: '#000', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span><i className="fas fa-download"></i> 下载面试表</span>
              <ModalClose onClick={() => setShowDownload(false)} />
            </div>
            <div className="modal-body">
              <div className="form-group" style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, display: 'block' }}>请选择公司/店铺</label>
                <select id="company_select" style={{ width: '100%', padding: 12, border: '2px solid #f99e00', borderRadius: 8, fontSize: 14 }}
                  defaultValue="" onChange={(e) => {
                    const v = e.target.value
                    if (!v) return
                    // 对齐线上 confirmDownload：直接下载对应 PDF
                    const pdfFiles: Record<string, string> = {
                      KUNZZHOLDINGS: '/form/kh.pdf',
                      TOKYO_J1: '/form/j1.pdf',
                      TOKYO_J2: '/form/j2.pdf',
                      TOKYO_J3: '/form/j3.pdf'
                    }
                    const pdfPath = pdfFiles[v]
                    const names: Record<string, string> = { KUNZZHOLDINGS: 'KUNZZHOLDINGS', TOKYO_J1: 'TOKYO (J1)', TOKYO_J2: 'TOKYO (J2)', TOKYO_J3: 'TOKYO (J3)' }
                    if (pdfPath) {
                      const link = document.createElement('a')
                      link.href = pdfPath
                      link.download = pdfPath.split('/').pop() || 'form.pdf'
                      document.body.appendChild(link)
                      link.click()
                      document.body.removeChild(link)
                      showMsg('正在下载 ' + (names[v] || v) + ' 的申请表...')
                    } else {
                      showMsg('下载失败，文件不存在', 'error')
                    }
                    setShowDownload(false)
                  }}>
                  <option value="">请选择...</option>
                  <option value="KUNZZHOLDINGS">KUNZZHOLDINGS</option>
                  <option value="TOKYO_J1">TOKYO (J1)</option>
                  <option value="TOKYO_J2">TOKYO (J2)</option>
                  <option value="TOKYO_J3">TOKYO (J3)</option>
                </select>
              </div>
              <div className="modal-buttons">
                <button type="button" className="btn-action btn-cancel" onClick={() => setShowDownload(false)}>
                  <i className="fas fa-times"></i> 取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast" style={{ position: 'fixed', top: 20, right: 20, zIndex: 99999, background: toast.type === 'error' ? '#dc2626' : '#10b981', color: '#fff', padding: '12px 20px', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
