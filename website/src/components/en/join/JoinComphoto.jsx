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
      // 2026-10-30：与中文版同步 —— 卡片是 240px 缩略图，大图必须用原图；
      // 并且不再用 rect 做 width/height 放大动画（会先按小尺寸光栅化再拉伸 → 模糊/尺寸异常只剩关闭键）。
      setModalSrc(img.dataset.full || img.src);
      setModalOpen(true);
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
        <div className="comphoto-title">Our Journey</div>
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
