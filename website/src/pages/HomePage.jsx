import { useRef, useState } from 'react';

import Header from '../components/cn/Header.jsx';
import SocialSidebar from '../components/SocialSidebar.jsx';
import Home from './Home.jsx';

const HOME_SLIDES = 4;

export default function HomePage() {
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
