import { createPortal } from 'react-dom'

/**
 * 「有未保存数据」的离开确认框（站内统一样式）
 *
 * 用 portal 挂到 body：不受各页面根节点类名（.ke-root / .sos-root …）与父级层叠上下文限制，
 * 样式在 styles/save-guard.css，z-index 9500（高于侧边栏 5000 / flyout 9000）。
 *
 * 交互只有两个出口：
 *   继续编辑 → onKeep（留在当前页）
 *   保存并前往 / 保存并切换 → onSaveGo（由调用方决定保存成功后是否 proceed）
 */
export default function SaveGuardDialog({
  days, blocked, onKeep, onSaveGo,
}: {
  days: number
  blocked: boolean
  onKeep: () => void
  onSaveGo: () => void
}) {
  if (days <= 0) return null
  return createPortal(
    <div className="ke-ask-mask" onClick={onKeep}>
      <div className="ke-ask-card" onClick={(e) => e.stopPropagation()}>
        <div className="ke-ask-title">还有 {days} 项数据没保存</div>
        <div className="ke-ask-text">
          离开之前要先把这些数据保存吗？<br />选「继续编辑」就留在当前这个页面。
        </div>
        <div className="ke-ask-actions">
          <button className="ke-ask-btn ke-ask-btn--ghost" onClick={onKeep}>
            <i className="fas fa-pen" /> 继续编辑
          </button>
          <button className="ke-ask-btn ke-ask-btn--primary" onClick={onSaveGo}>
            <i className="fas fa-save" /> {blocked ? '保存并前往' : '保存并切换'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
