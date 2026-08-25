import { useEffect, useRef } from 'react';
import { SwiperSlide } from 'swiper/react';

import VerticalSwiper from '../components/VerticalSwiper.jsx';
import HomeHero from '../components/cn/HomeHero.jsx';
import CompanyProfile from '../components/cn/CompanyProfile.jsx';
import CultureSection from '../components/cn/CultureSection.jsx';
import Footer from '../components/cn/Footer.jsx';

export default function Home({ onSlideChange, swiperRef }) {
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
    <VerticalSwiper slideCount={4} onSwiper={handleSwiper} onSlideChange={onSlideChange}>
      <SwiperSlide>
        <HomeHero />
      </SwiperSlide>

      <SwiperSlide>
        <CompanyProfile />
      </SwiperSlide>

      <SwiperSlide>
        <CultureSection />
      </SwiperSlide>

      <SwiperSlide className="footer-slide">
        <section className="footer-scroll-buffer">
          <Footer onSlideTo={(index) => internalRef.current?.slideTo(index)} />
        </section>
      </SwiperSlide>
    </VerticalSwiper>
  );
}
