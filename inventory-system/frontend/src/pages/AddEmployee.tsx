import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createStaff } from '../api'
import { PermTree, defaultPerms, positionsByAccountType, accountTypeLabels, branchLabels, NATIONALITIES, RACES, BANKS } from './Staff'
import type { PermState } from './Staff'
import '../styles/staff.css'
import '../styles/add.css'
import '../styles/perm-tree.css'
import '../styles/form-ui.css'

export default function AddEmployee() {
  const navigate = useNavigate()
  const [form, setForm] = useState<Record<string, string>>({})
  const [branches, setBranches] = useState<string[]>([])
  const [branchOpen, setBranchOpen] = useState(false)
  const [perms, setPerms] = useState<PermState>(defaultPerms())
  const [permWarning, setPermWarning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, boolean>>({})
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null)

  const showMsg = (msg: string, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // 输入过滤（对齐线上 formatAndFilterInput）
  const filterInput = (field: string, raw: string) => {
    let value = raw
    switch (field) {
      case 'username': case 'emergency_contact_name': case 'bank_account_holder_en': case 'position':
        value = value.toUpperCase().replace(/[^A-Z\s]/g, '')
        break
      case 'email':
        value = value.toLowerCase().replace(/[^a-z0-9@.]/g, '')
        break
      case 'ic_number': case 'phone_number': case 'emergency_phone_number': case 'bank_account':
        value = value.replace(/[^\d]/g, '')
        break
      case 'home_address':
        value = value.toUpperCase().replace(/[^A-Z0-9\s\.,\-\#\/\(\)]/g, '')
        break
      case 'username_cn':
        value = value.replace(/[^\u4e00-\u9fff]/g, '')
        break
    }
    return value
  }

  const set = (k: string, v: string) => {
    const filtered = filterInput(k, v)
    setForm(prev => ({ ...prev, [k]: filtered }))
    if (errors[k]) setErrors(prev => ({ ...prev, [k]: false }))
  }

  // 字段校验（对齐线上 validateField）
  const validateField = (field: string, value?: string) => {
    if (!value) return true
    if (field === 'username' || field === 'emergency_contact_name' || field === 'bank_account_holder_en')
      return /^[A-Z]+(\s[A-Z]+)+$/.test(value)
    if (field === 'username_cn') return /^[\u4e00-\u9fff]{2,}$/.test(value)
    if (field === 'email') return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)
    return true
  }

  const extractPerms = (v: PermState) => ({
    permissions: [...v.l1],
    submenu_permissions: Object.fromEntries(Object.entries(v.l2).map(([k, s]) => [k, [...s]])),
    page_permissions: v.page,
    brand_permissions: v.brand,
    report_permissions: [...v.report],
    restaurant_permissions: [...v.restaurant]
  })

  const save = async () => {
    // 必填 + 格式校验（对齐线上：has-error 红框 + error-msg）
    const errs: Record<string, boolean> = {}
    if (!form.username || !validateField('username', form.username)) errs.username = true
    if (form.username_cn && !validateField('username_cn', form.username_cn)) errs.username_cn = true
    if (!form.email || !validateField('email', form.email)) errs.email = true
    if (!form.account_type) errs.account_type = true
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      showMsg('请填写所有必填项（*）并检查格式', 'error')
      return
    }
    // 权限校验
    const anyPerm = perms.l1.size > 0 || Object.values(perms.l2).some(s => s.size > 0)
    if (!anyPerm) {
      setPermWarning(true)
      showMsg('请至少选择一项权限', 'error')
      return
    }
    setSaving(true)
    try {
      // 密码/申请码由后端生成（对齐线上 add_user），前端不再自造密码
      const res = await createStaff({
        username: form.username, usernameCn: form.username_cn, nickname: form.nickname,
        email: form.email, icNumber: form.ic_number, phoneNumber: form.phone_number,
        gender: form.gender, nationality: form.nationality, race: form.race,
        homeAddress: form.home_address, emergencyContactName: form.emergency_contact_name,
        emergencyPhoneNumber: form.emergency_phone_number,
        bankAccountHolderEn: form.bank_account_holder_en, bankAccount: form.bank_account,
        bankName: form.bank_name, accountType: form.account_type, position: form.position,
        branch: branches.join(','),
        ...extractPerms(perms)
      })
      // 提示对齐线上 addNewUser：邮件成功则告知已发送，否则告知申请码+临时密码
      let msg = `职员 "${res.user.username}" 添加成功！`
      if (res.emailSent) {
        msg += ` 临时密码已发送到 ${res.user.email}（首次登录需重设密码）`
      } else {
        msg += ` 申请码：${res.code}，临时密码：${res.defaultPassword}（请手动告知，首次登录需重设）`
      }
      showMsg(msg)
      // 记录新员工名，返回列表后自动定位高亮
      try { sessionStorage.setItem('staff_new_user', String(res.user.username || '')) } catch { /* ignore */ }
      setTimeout(() => navigate('/staff'), 4000)
    } catch (e: any) {
      showMsg(e?.message || '添加失败，请重试！', 'error')
      setSaving(false)
    }
  }

  const inp = (label: string, key: string, required?: boolean, placeholder?: string, errorMsg?: string) => (
    <div className={'form-group' + (errors[key] ? ' has-error' : '')} id={'group-add-' + key}>
      <label htmlFor={'add_' + key}>{label}{required && <span className="required-mark">*</span>}</label>
      <input type="text" id={'add_' + key} name={key} value={form[key] || ''} placeholder={placeholder || ''}
        maxLength={key === 'email' ? 100 : key === 'username' ? 50 : 100}
        onChange={(e) => set(key, e.target.value)} />
      {errorMsg && <div className="error-msg">{errorMsg}</div>}
    </div>
  )

  return (
    <div className="add-root">
      <div className="container" style={{ padding: 0, height: '100vh', maxWidth: '100%' }}>
        <div className="add-employee-page">
          {/* 顶部标题栏 */}
          <div className="page-header-bar">
            <Link to="/staff" className="back-btn">
              <i className="fas fa-arrow-left"></i> 返回列表
            </Link>
            <h1><i className="fas fa-user-plus"></i> 添加新职员</h1>
          </div>

          {/* 表单滚动区 */}
          <div className="form-scroll-area">
            <form id="addUserForm" style={{ animation: 'fadeIn .3s ease' }}>
              <div className="form-col">
                <div className="form-section left-card">
                  {/* 个人资料 */}
                  <div className="form-section-header" style={{ textTransform: 'uppercase' }}>个人资料 PERSONAL DETAILS</div>
                  <div className="form-section-content">
                    <div className="form-grid-3">
                      {inp('英语姓名 English Name', 'username', true, 'E.G. JOHN DOE', '请填写英文姓名，至少包含两个单词')}
                      {inp('中文姓名 Chinese Name', 'username_cn', false, 'E.G. 刘德华', '中文姓名至少需要两个汉字')}
                      {inp('昵称 Nickname', 'nickname', false, 'E.G. JACKIE')}
                      {inp('邮箱 Email', 'email', true, 'e.g. user@example.com', '请填写有效的邮箱地址')}
                      {inp('身份证号码', 'ic_number')}
                      {inp('联络号码', 'phone_number')}
                      <div className="form-group">
                        <label htmlFor="add_gender">性别</label>
                        <select id="add_gender" name="gender" value={form.gender || ''} onChange={(e) => set('gender', e.target.value)}>
                          <option value="">请选择</option>
                          <option value="male">男</option>
                          <option value="female">女</option>
                          <option value="other">其他</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label htmlFor="add_nationality">国籍</label>
                        <select id="add_nationality" name="nationality" value={form.nationality || ''} onChange={(e) => set('nationality', e.target.value)}>
                          <option value="">请选择国籍</option>
                          {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <label htmlFor="add_race">种族</label>
                        <select id="add_race" name="race" value={form.race || ''} onChange={(e) => set('race', e.target.value)}>
                          <option value="">请选择种族</option>
                          {RACES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="form-grid-1" style={{ marginTop: 14 }}>
                      <div className="form-group">
                        <label htmlFor="add_home_address">地址</label>
                        <textarea id="add_home_address" name="home_address" rows={2} maxLength={255} style={{ resize: 'none' }}
                          value={form.home_address || ''} onChange={(e) => set('home_address', e.target.value)} />
                      </div>
                    </div>
                    <div className="form-row-2col" style={{ marginTop: 14 }}>
                      {inp('紧急联系人', 'emergency_contact_name')}
                      {inp('紧急联系人号码', 'emergency_phone_number')}
                    </div>
                  </div>

                  {/* 银行信息 */}
                  <div className="form-section-header-bank" style={{ textTransform: 'uppercase' }}>银行信息 BANK INFORMATION</div>
                  <div className="form-section-content" style={{ flexShrink: 0, paddingTop: 15 }}>
                    <div className="form-grid-3">
                      {inp('银行账户持有人', 'bank_account_holder_en')}
                      {inp('银行账号', 'bank_account')}
                      <div className="form-group">
                        <label htmlFor="add_bank_name">银行名称</label>
                        <select id="add_bank_name" name="bank_name" value={form.bank_name || ''} onChange={(e) => set('bank_name', e.target.value)}>
                          <option value="">请选择银行</option>
                          {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="form-col">
                {/* 账号设置 */}
                <div className="form-section">
                  <div className="form-section-header" style={{ textTransform: 'uppercase' }}>账号设置 ACCOUNT SETTINGS</div>
                  <div className="form-section-content">
                    <div className="form-grid-2">
                      <div className={'form-group' + (errors.account_type ? ' has-error' : '')} id="group-add-account-type">
                        <label htmlFor="add_account_type">账号类型 Account Type <span className="required-mark">*</span></label>
                        <select id="add_account_type" name="account_type" value={form.account_type || ''}
                          onChange={(e) => set('account_type', e.target.value)}>
                          <option value="">请选择账号类型</option>
                          {Object.entries(accountTypeLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        <div className="error-msg">请选择账号类型</div>
                      </div>
                      <div className="form-group">
                        <label htmlFor="add_position">职位 Position</label>
                        <select id="add_position" name="position" value={form.position || ''} disabled={!form.account_type}
                          onChange={(e) => set('position', e.target.value)}>
                          <option value="">{form.account_type ? '请选择职位' : '请先选择账号类型'}</option>
                          {(positionsByAccountType[form.account_type || ''] || []).map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                      <div className="form-group" id="group-add-branch">
                        <label>所属公司</label>
                        <div className={'custom-multi-select' + (branchOpen ? ' active' : '')} id="add-branch-select">
                          <div className="select-header" onClick={() => setBranchOpen(!branchOpen)}>
                            <span className="selected-text">{branches.length > 0 ? branches.map(b => branchLabels[b]).join(', ') : '请选择区域运营单位'}</span>
                            <i className="fas fa-chevron-down"></i>
                          </div>
                          <div className="select-options" style={{ display: branchOpen ? 'block' : 'none' }}>
                            {Object.entries(branchLabels).map(([v, l]) => (
                              <label key={v} className="checkbox-item"><input type="checkbox" name="branch[]" value={v}
                                checked={branches.includes(v)} onChange={() => {
                                  setBranches(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])
                                }} /> {l}</label>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 权限管理 */}
                <div className="form-section editUserPermLayout">
                  <div className="form-section-header" style={{ textTransform: 'uppercase' }}>权限管理 PERMISSION MANAGEMENT</div>
                  <div className="form-section-content">
                    <PermTree value={perms} onChange={setPerms} />
                    <div className="perm-warning" style={{ display: permWarning ? 'block' : 'none', color: '#dc2626', fontSize: 13, fontWeight: 'bold', marginTop: 10, textAlign: 'center' }}>
                      <i className="fas fa-exclamation-triangle"></i> 请至少选择一项权限
                    </div>
                  </div>
                </div>
              </div>
            </form>
          </div>

          {/* Sticky 保存栏 */}
          <div className="page-action-bar">
            <Link to="/staff" className="btn-back-action">
              <i className="fas fa-times"></i> 取消
            </Link>
            <button type="button" id="btn-save" onClick={save} className="btn-save" disabled={saving}>
              {saving ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>} {saving ? '保存中...' : '保存职员'}
            </button>
          </div>
        </div>
      </div>

      {toast && (
        <div className="toast" style={{ position: 'fixed', top: 20, right: 20, zIndex: 99999, background: toast.type === 'error' ? '#dc2626' : '#10b981', color: '#fff', padding: '12px 20px', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
