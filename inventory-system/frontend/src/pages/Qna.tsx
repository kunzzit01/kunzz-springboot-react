import { useEffect, useRef, useState } from 'react'
import { createQna, getMe, getMyQna } from '../api'
import '../styles/qna.css'

/** 问卷题目（对齐线上 qna.php，10 题 + 示例） */
const QUESTIONS: { q: string; e: string }[] = [
  { q: '如果不考虑现实限制,你希望自己在3-5年后成为什么样的人?', e: '' },
  { q: '你目前最重要的个人目标或梦想是什么?', e: '(例如:事业发展,专业技能,经济目标,生活稳定,家庭等)' },
  { q: '如果公司为你提供机会,你是否愿意承担更高的责任与压力?你认为这些责任具体体现在哪些方面?', e: '(例如:结果要求,学习投入,团队管理,时间管理,抗压能力等)' },
  { q: '在实现的目标过程中,你目前遇到最大的困难或挑战是什么?', e: '(可以是工作上的,也可以是个人层面的)' },
  { q: '如果公司可以提供支持,你最希望公司在哪些方面给予帮助?', e: '' },
  { q: '在目前的公司中,有没有你特别希望尝试或发展的方向?为什么?', e: '(例如:管理,专业深度,跨部门,新项目等)' },
  { q: '你认为哪些能力或经验,是你未来1-2年最需要重点提升的?', e: '' },
  { q: '如果未来1年内，公司只能为你提供一项最有价值的支持，你希望是什么？', e: '(请写下你认为最重要的一项)' },
  { q: '当你想到“理想的工作状态”时，请写下你最重视的3个关键词。', e: '(例如：成长，稳定，被尊重，有挑战，自由，有意义等)' },
  { q: '你希望公司在“员工发展”这件事上，扮演什么角色？', e: '(例如：平台，导师，伙伴，资源提供者，稳定后盾等)' },
]

declare global {
  interface Window { PDFLib?: any; fontkit?: any }
}

export default function Qna() {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const userRef = useRef<{ name: string; position: string }>({ name: '', position: '' })

  const showMsg = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type })
    setTimeout(() => setMsg(null), 3500)
  }

  const load = async () => {
    try {
      const [mine, me] = await Promise.all([getMyQna(), getMe().catch(() => null)])
      setSubmitted(mine)
      if (me) userRef.current = { name: String(me.displayName || me.username || ''), position: String(me.position || '') }
      if (mine) {
        const a: Record<string, string> = {}
        QUESTIONS.forEach((_, i) => { a['question' + (i + 1)] = String(mine['question' + (i + 1)] || '') })
        setAnswers(a)
      }
    } catch { /* 拦截器已提示 */ }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const setQ = (i: number, v: string) => setAnswers(prev => ({ ...prev, ['question' + (i + 1)]: v }))

  const submit = async () => {
    const any = QUESTIONS.some((_, i) => (answers['question' + (i + 1)] || '').trim())
    if (!any) { showMsg('请至少回答一个问题', 'error'); return }
    setSaving(true)
    try {
      await createQna(answers)
      showMsg('问卷提交成功！')
      await load()
    } catch (e: any) {
      showMsg(e?.message || '提交失败，请重试', 'error')
    }
    setSaving(false)
  }

  const reset = () => {
    if (window.confirm('确定要清空所有回答吗？')) setAnswers({})
  }

  // ══════════ PDF 生成（对齐线上 printTemplate / generatePDF，本地动态生成） ══════════
  const wrap = (text: string, maxW: number, size: number, font: any): string[] => {
    if (!text) return []
    const lines: string[] = []
    let cur = ''
    for (const ch of text) {
      if (ch === '\n') { lines.push(cur); cur = ''; continue }
      if (font.widthOfTextAtSize(cur + ch, size) > maxW) {
        lines.push(cur); cur = ch
      } else cur += ch
    }
    if (cur) lines.push(cur)
    return lines.length ? lines : ['']
  }

  const buildPdf = async (withAnswers: boolean) => {
    if (pdfBusy) return
    const { PDFLib, fontkit } = window
    if (!PDFLib || !fontkit) { showMsg('PDF 组件未加载，请刷新页面重试', 'error'); return }
    setPdfBusy(true)
    try {
      const fontRes = await fetch('/fonts/NotoSansSC-Regular.ttf')
      if (!fontRes.ok) throw new Error('无法加载中文字体文件')
      const fontBytes = await fontRes.arrayBuffer()
      const { PDFDocument, rgb } = PDFLib
      const doc = await PDFDocument.create()
      doc.registerFontkit(fontkit)
      const font = await doc.embedFont(fontBytes, { subset: true })

      const pageW = 595, pageH = 842, margin = 50
      let page = doc.addPage([pageW, pageH])
      let y = pageH - 70

      const ensure = (need: number) => {
        if (y - need < margin) { page = doc.addPage([pageW, pageH]); y = pageH - 70 }
      }
      const drawText = (text: string, size: number, color: any, opts: { x?: number; maxW?: number; align?: 'left' | 'center' } = {}) => {
        const x = opts.x ?? margin
        const maxW = opts.maxW ?? pageW - margin * 2
        const lines = wrap(text, maxW, size, font)
        lines.forEach(line => {
          ensure(size + 5)
          let px = x
          if (opts.align === 'center') {
            const w = font.widthOfTextAtSize(line, size)
            px = (pageW - w) / 2
          }
          page.drawText(line, { x: px, y, size, font, color })
          y -= size + 5
        })
      }
      const drawLine = (yPos: number, x1 = margin, x2 = pageW - margin, thickness = 0.6) => {
        page.drawLine({ start: { x: x1, y: yPos }, end: { x: x2, y: yPos }, thickness, color: rgb(0.7, 0.7, 0.7) })
      }

      // 标题
      drawText('员工发展问卷', 18, rgb(0, 0, 0), { align: 'center' })
      y += 2
      const info = `${userRef.current.name}${userRef.current.position ? ' (' + userRef.current.position + ')' : ''}`
      drawText(info || '（请填写姓名）', 11, rgb(0.35, 0.35, 0.35), { align: 'center' })
      y -= 8
      drawLine(y)
      y -= 16

      // 10 题
      QUESTIONS.forEach((item, i) => {
        const num = i + 1
        const qText = num + '. ' + item.q
        ensure(40)
        drawText(qText, 11, rgb(0, 0, 0))
        if (item.e) drawText(item.e, 9, rgb(0.55, 0.55, 0.55))
        const ans = withAnswers ? String(answers['question' + num] || '').trim() : ''
        if (ans) {
          drawText(ans, 10.5, rgb(0.1, 0.1, 0.1))
        } else {
          ensure(30)
          drawLine(y - 2)
          y -= 14
          drawLine(y - 2)
          y -= 18
        }
        y -= 8
      })

      const bytes = await doc.save()
      const blob = new Blob([bytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const now = new Date()
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      link.download = withAnswers ? `surveyform_${dateStr}.pdf` : 'surveyform.pdf'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      showMsg(withAnswers ? 'PDF 生成成功！' : '问卷模板已下载')
    } catch (e: any) {
      console.error('PDF生成失败:', e)
      showMsg('PDF 生成失败：' + (e?.message || '未知错误'), 'error')
    }
    setPdfBusy(false)
  }

  if (loading) {
    return (
      <div className="qna-root">
        <div className="header"><h1>问卷回答</h1></div>
        <div className="qna-content-container">
          <div className="qna-content-wrapper qna-loading"><div className="qna-spinner"></div>加载中...</div>
        </div>
      </div>
    )
  }

  const isSubmitted = !!submitted

  return (
    <div className="qna-root">
      {/* 顶部标题栏（对齐线上 qna.php .header） */}
      <div className="header">
        <h1>问卷回答</h1>
        <div className="header-actions">
          <button type="button" className="btn-print-template" onClick={() => buildPdf(false)} disabled={pdfBusy}>
            <i className="fas fa-print"></i>
            打印问卷
          </button>
        </div>
      </div>

      <div id="messageArea">
        {msg && <div className={'message ' + (msg.type === 'error' ? 'error' : 'success')}>{msg.text}</div>}
      </div>

      <div className="qna-content-container">
        <div className="qna-content-wrapper">
          {isSubmitted ? (
            /* 查看模式（对齐线上 .view-mode） */
            <div className="view-mode">
              {QUESTIONS.map((item, i) => (
                <div className="form-section" key={i}>
                  <div className="form-section-header">问题 {i + 1}</div>
                  <div className="form-section-content">
                    <div className="question-item">
                      <div className="question-text">{item.q}</div>
                      <div className="view-answer" id={'view-question' + (i + 1)}>
                        {String(answers['question' + (i + 1)] || '').trim()
                          ? String(answers['question' + (i + 1)])
                          : <span className="empty-answer">未填写</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* 编辑模式（对齐线上 #qnaForm.edit-mode） */
            <form id="qnaForm" className="edit-mode" onSubmit={(e) => { e.preventDefault(); submit() }}>
              {QUESTIONS.map((item, i) => (
                <div className="form-section" key={i}>
                  <div className="form-section-header">问题 {i + 1}</div>
                  <div className="form-section-content">
                    <div className="question-item">
                      <div className="question-text">{item.q}</div>
                      {item.e && <div className="question-example">{item.e}</div>}
                      <textarea
                        className="question-input"
                        name={'question' + (i + 1)}
                        id={'question' + (i + 1)}
                        rows={1}
                        value={answers['question' + (i + 1)] || ''}
                        onChange={(e) => setQ(i, e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </form>
          )}
        </div>

        {/* 底部按钮组（线上被注释，此处保留功能按钮） */}
        <div className="button-group" id="buttonGroup">
          {isSubmitted ? (
            <button type="button" className="btn" id="printBtn" onClick={() => buildPdf(true)} disabled={pdfBusy}>
              {pdfBusy ? <><div className="loading"></div> 生成中...</> : '生成PDF'}
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-reset" id="resetBtn" onClick={reset}>重新回答</button>
              <button type="submit" className="btn" id="submitBtn" form="qnaForm" disabled={saving}>
                {saving ? <><div className="loading"></div> 提交中...</> : '提交问卷'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
