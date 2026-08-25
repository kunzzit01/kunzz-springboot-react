import { useCallback, useRef, useState } from 'react';

import { useComphotoBounce } from '../../../hooks/useComphotoBounce.js';

export default function JoinComphoto() {
  const containerRef = useRef(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSrc, setModalSrc] = useState('');
  const [modalStyle, setModalStyle] = useState({});
  const clickedImgRef = useRef(null);

  const { resume } = useComphotoBounce(
    containerRef,
    useCallback((img) => {
      const rect = img.getBoundingClientRect();
      clickedImgRef.current = img;
      img.classList.add('comphoto-hidden');
      setModalSrc(img.src);
      setModalStyle({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        borderRadius: '8px',
      });
      setModalOpen(true);
      // Animation pause is handled inside useComphotoBounce on photo click

      requestAnimationFrame(() => {
        const scale = 8;
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        setModalStyle({
          left: centerX - (rect.width * scale) / 2,
          top: centerY - (rect.height * scale) / 2,
          width: rect.width * scale,
          height: rect.height * scale,
          borderRadius: '12px',
          transition: 'all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        });
      });
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
        style={{ display: modalOpen ? 'block' : 'none' }}
        onClick={(e) => e.target.id === 'comphoto-modal' && closeModal()}
        onKeyDown={() => {}}
        role="presentation"
      >
        <button type="button" className="comphoto-close" onClick={closeModal}>
          &times;
        </button>
        <div className="comphoto-modal-content" style={modalStyle}>
          {modalSrc ? <img id="comphoto-modal-img" src={modalSrc} alt="放大的照片" /> : null}
        </div>
      </div>
    </>
  );
}
