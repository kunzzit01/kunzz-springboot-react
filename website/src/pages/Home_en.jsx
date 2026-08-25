// import { useEffect, useRef } from 'react';
// import { Swiper, SwiperSlide } from 'swiper/react';
// import { Mousewheel } from 'swiper/modules';

// import HomeHero from '../components/en/HomeHero.jsx';
// import CompanyProfile from '../components/en/CompanyProfile.jsx';
// import CultureSection from '../components/en/CultureSection.jsx';
// import Footer from '../components/en/Footer.jsx';
// import 'swiper/css';

// export default function Home_en({ onSlideChange, swiperRef }) {
//   const internalRef = useRef(null);

//   useEffect(() => {
//     const params = new URLSearchParams(window.location.search);
//     const slideParam = params.get('slide');
//     if (slideParam === null) return;

//     const slideIndex = parseInt(slideParam, 10);
//     const swiper = swiperRef?.current || internalRef.current;
//     if (!Number.isNaN(slideIndex) && swiper) {
//       swiper.slideTo(slideIndex, 0);
//     }
//   }, [swiperRef]);

//   const handleSwiper = (swiper) => {
//     internalRef.current = swiper;
//     if (swiperRef) swiperRef.current = swiper;
//   };

//   return (
//     <Swiper
//       direction="vertical"
//       mousewheel
//       speed={800}
//       modules={[Mousewheel]}
//       slidesPerView="auto"
//       spaceBetween={0}
//       onSwiper={handleSwiper}
//       onSlideChange={(swiper) => onSlideChange?.(swiper.activeIndex)}

//       onSlideChange={(swiper) => {

  

//   onSlideChange?.(swiper.activeIndex);
// }}
//     >
//       <SwiperSlide>
//         <HomeHero />
//       </SwiperSlide>

//       <SwiperSlide>
//         <CompanyProfile />
//       </SwiperSlide>

//       <SwiperSlide>
//         <CultureSection />
//       </SwiperSlide>

//       <SwiperSlide className="footer-slide">
//         <Footer onSlideTo={(index) => internalRef.current?.slideTo(index)} />
//       </SwiperSlide>
//     </Swiper>
//   );
// }

import { useEffect, useRef } from 'react';
import { SwiperSlide } from 'swiper/react';

import VerticalSwiper from '../components/VerticalSwiper.jsx';
import HomeHero from '../components/en/HomeHero.jsx';
import CompanyProfile from '../components/en/CompanyProfile.jsx';
import CultureSection from '../components/en/CultureSection.jsx';
import Footer from '../components/en/Footer.jsx';

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
