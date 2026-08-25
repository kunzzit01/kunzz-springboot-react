/**
 * 全站统一弹窗关闭按钮
 * 用法：<ModalClose onClick={close} />
 * 样式在全局 index.css（.modal-close），个别页面（如深色 header）可局部覆盖
 */
export default function ModalClose({ onClick, title = '关闭' }: { onClick: () => void; title?: string }) {
  return (
    <button type="button" className="modal-close" aria-label={title} title={title} onClick={onClick}>
      &times;
    </button>
  )
}
