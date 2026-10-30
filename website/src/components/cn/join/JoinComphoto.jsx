import { useCallback, useRef, useState } from 'react';

import { useComphotoBounce } from '../../../hooks/useComphotoBounce.js';

export default function JoinComphoto() {
  const containerRef = useRef(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSrc, setModalSrc] = useState('');
  const clickedImgRef = useRef(null);

  const { resume } = useComphotoBounce(
    containerRef,
    useCallback((img) => {
      clickedImgRef.current = img;
      img.classList.add('comphoto-hidden');
      // 2026-10-29：卡片用 240px 缩略图，弹窗必须用原图
      setModalSrc(img.dataset.full || img.src);
      setModalOpen(true);
      // 2026-10-30：**不再用 rect 做 width/height 放大动画**。
      // 那样会让浏览器先按小尺寸光栅化再放大 → 在笔记本上看起来“糊”。
      // 现在尺寸固定为「适应视口」，只做 transform/opacity 进场（永远按最终尺寸绘制）。
    }, []),
  );

  const closeModal = () => {
    if (clickedImgRef.current) {
      clickedImgRef.current.classList.remove('comphoto-hidden');
      clickedImgRef.current = null;
    }
    setModalOpen(false);
    setModalSrc('');
    resume();
  };

  return (
    <>
      <div className="comphoto-section" id="comphoto-container" ref={containerRef}>
        <div className="comphoto-title">我们的足迹</div>
      </div>

      <div
        id="comphoto-modal"
        className={`comphoto-modal${modalOpen ? ' show' : ''}`}
        /* 2026-10-30：不再用 inline display —— 交给 CSS 的 .show{display:flex} 做居中 */
        onClick={(e) => e.target.id === 'comphoto-modal' && closeModal()}
        onKeyDown={() => {}}
        role="presentation"
      >
        <button type="button" className="comphoto-close" onClick={closeModal}>
          &times;
        </button>
        <div className="comphoto-modal-content">
          {modalSrc ? <img id="comphoto-modal-img" src={modalSrc} alt="放大的照片" /> : null}
        </div>
      </div>
    </>
  );
}
