import { useRef, useState } from 'react';

import Header from '../components/en/Header.jsx';
import SocialSidebar from '../components/SocialSidebar.jsx';
import { useIsMobile } from '../hooks/useIsMobile.js';
import Join from './Join_en.jsx';

const JOIN_HEADER_DOTS_DESKTOP = 6;
const JOIN_HEADER_DOTS_MOBILE = 7;

export default function JoinPage() {
  const [activeSlide, setActiveSlide] = useState(0);
  const swiperRef = useRef(null);
  const isMobile = useIsMobile();
  const totalSlides = isMobile ? JOIN_HEADER_DOTS_MOBILE : JOIN_HEADER_DOTS_DESKTOP;

  const mapSwiperIndexToDot = (swiperIndex) => {
    if (isMobile) return swiperIndex;
    if (swiperIndex >= 4) return swiperIndex + 1;
    return swiperIndex;
  };

  const handleSlideChange = (swiperIndex) => {
    setActiveSlide(mapSwiperIndexToDot(swiperIndex));
  };

  const handleSlideTo = (dotIndex) => {
    if (!isMobile && dotIndex === 4) return;

    let swiperIndex = dotIndex;
    if (!isMobile && dotIndex >= 5) {
      swiperIndex = dotIndex - 1;
    }

    swiperRef.current?.slideTo(swiperIndex);
    setActiveSlide(dotIndex);
  };

  return (
    <>
      <Header
        activeSlide={activeSlide}
        onSlideTo={handleSlideTo}
        totalSlides={totalSlides}
      />
      <Join onSlideChange={handleSlideChange} swiperRef={swiperRef} />
      <SocialSidebar />
    </>
  );
}
