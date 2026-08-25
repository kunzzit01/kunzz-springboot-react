import { useEffect, useRef } from 'react';
import { SwiperSlide } from 'swiper/react';

import VerticalSwiper from '../components/VerticalSwiper.jsx';
import AboutIntro from '../components/en/about/AboutIntro.jsx';
import AboutVision from '../components/en/about/AboutVision.jsx';
import AboutValues from '../components/en/about/AboutValues.jsx';
import AboutTimeline from '../components/cn/about/AboutTimeline.jsx';
import Footer from '../components/en/Footer.jsx';

import '../styles/about.css';

export default function About({ onSlideChange, swiperRef }) {
  const internalRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slideParam = params.get('slide');
    if (slideParam === null) return;

    const slideIndex = parseInt(slideParam, 10);
    const swiper = swiperRef?.current || internalRef.current;
    if (!Number.isNaN(slideIndex) && swiper) {
      swiper.slideTo(slideIndex, 0);
    }
  }, [swiperRef]);

  const handleSwiper = (swiper) => {
    internalRef.current = swiper;
    if (swiperRef) swiperRef.current = swiper;
  };

  return (
    <VerticalSwiper
      className="about-swiper"
      slideCount={5}
      onSwiper={handleSwiper}
      onSlideChange={onSlideChange}
    >
      <SwiperSlide>
        <AboutIntro />
      </SwiperSlide>

      <SwiperSlide>
        <AboutVision />
      </SwiperSlide>

      <SwiperSlide>
        <AboutValues />
      </SwiperSlide>

      <SwiperSlide>
        <AboutTimeline lang="en" />
      </SwiperSlide>

      <SwiperSlide className="footer-slide">
        <section className="footer-scroll-buffer">
          <Footer
            page="about"
            onSlideTo={(index) => internalRef.current?.slideTo(index)}
          />
        </section>
      </SwiperSlide>
    </VerticalSwiper>
  );
}
