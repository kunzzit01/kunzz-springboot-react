import { useRef, useState } from 'react';

import Header from '../components/en/Header.jsx';
import SocialSidebar from '../components/SocialSidebar.jsx';
import Home from './Home_en.jsx';

const HOME_SLIDES = 4;

export default function HomePage_en() {
  const [activeSlide, setActiveSlide] = useState(0);
  const swiperRef = useRef(null);

  const handleSlideTo = (index) => {
    swiperRef.current?.slideTo(index);
    setActiveSlide(index);
  };

  return (
    <>
      <Header activeSlide={activeSlide} onSlideTo={handleSlideTo} totalSlides={HOME_SLIDES} />
      <Home onSlideChange={setActiveSlide} swiperRef={swiperRef} />
      <SocialSidebar />
    </>
  );
}
