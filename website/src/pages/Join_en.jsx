import { useEffect, useRef, useState } from 'react';
import { SwiperSlide } from 'swiper/react';

import VerticalSwiper from '../components/VerticalSwiper.jsx';
import Footer from '../components/en/Footer.jsx';
import JoinComphoto from '../components/en/join/JoinComphoto.jsx';
import JoinContactFeedback from '../components/en/join/JoinContactFeedback.jsx';
import JoinFeedbackMobile from '../components/en/join/JoinFeedbackMobile.jsx';
import JoinHeroBenefits from '../components/en/join/JoinHeroBenefits.jsx';
import JoinJobs from '../components/en/join/JoinJobs.jsx';
import JobApplyModal from '../components/en/join/JobApplyModal.jsx';
import JobDetailModal from '../components/en/join/JobDetailModal.jsx';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { useJobs } from '../hooks/useJobs.js';

import '../styles/joinus.css';
import '../styles/joinus-mobile.css';

export default function Join({ onSlideChange, swiperRef }) {
  const internalRef = useRef(null);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [applyPosition, setApplyPosition] = useState('');
  const [applyCompany, setApplyCompany] = useState('');
  const isMobile = useIsMobile();
  const { jobsMap } = useJobs('zh');
  const slideCount = isMobile ? 7 : 5;

  useEffect(() => {
    document.body.classList.toggle('joinus-desktop-merge-contact', !isMobile);
    return () => document.body.classList.remove('joinus-desktop-merge-contact');
  }, [isMobile]);

  useEffect(() => {
    internalRef.current?.update?.();
  }, [isMobile]);

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

  const selectedJob = selectedJobId ? jobsMap[selectedJobId] : null;

  return (
    <>
      <VerticalSwiper
        className="join-swiper"
        slideCount={slideCount}
        onSwiper={handleSwiper}
        onSlideChange={onSlideChange}
      >
        <SwiperSlide>
          <JoinHeroBenefits layout={isMobile ? 'hero' : 'combined'} />
        </SwiperSlide>

        {isMobile ? (
          <SwiperSlide>
            <JoinHeroBenefits layout="benefits" />
          </SwiperSlide>
        ) : null}

        <SwiperSlide>
          <JoinComphoto />
        </SwiperSlide>

        <SwiperSlide>
          <JoinJobs onJobClick={setSelectedJobId} />
        </SwiperSlide>

        <SwiperSlide className="swiper-slide--joinus-contact-only">
          <JoinContactFeedback />
        </SwiperSlide>

        {isMobile ? (
          <SwiperSlide className="swiper-slide--joinus-feedback-only">
            <JoinFeedbackMobile />
          </SwiperSlide>
        ) : null}

        <SwiperSlide className="footer-slide">
          <section className="footer-scroll-buffer">
            <Footer
              page="join"
              onSlideTo={(index) => internalRef.current?.slideTo(index)}
            />
          </section>
        </SwiperSlide>
      </VerticalSwiper>

      <JobDetailModal
        job={selectedJob}
        onClose={() => setSelectedJobId(null)}
        onApply={(job) => {
          setSelectedJobId(null);
          setApplyPosition(job.title);
          setApplyCompany(job.company);
        }}
      />

      <JobApplyModal position={applyPosition} company={applyCompany} onClose={() => setApplyPosition('')} />
    </>
  );
}
