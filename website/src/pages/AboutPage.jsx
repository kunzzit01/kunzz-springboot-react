import { useRef, useState } from 'react';

import Header from '../components/cn/Header.jsx';
import SocialSidebar from '../components/SocialSidebar.jsx';
import About from './About.jsx';

const ABOUT_SLIDES = 5;

export default function AboutPage() {
  const [activeSlide, setActiveSlide] = useState(0);
  const swiperRef = useRef(null);

  const handleSlideTo = (index) => {
    swiperRef.current?.slideTo(index);
    setActiveSlide(index);
  };

  return (
    <>
      <Header activeSlide={activeSlide} onSlideTo={handleSlideTo} totalSlides={ABOUT_SLIDES} />
      <About onSlideChange={setActiveSlide} swiperRef={swiperRef} />
      <SocialSidebar />
    </>
  );
}
