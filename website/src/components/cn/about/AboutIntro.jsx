import { useEffect, useRef } from 'react';
import { mediaUrl } from '../../../utils/media.js';

export default function AboutIntro() {
  const bannerRef = useRef(null);
  const introRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const target = entry.target;
          if (entry.isIntersecting) {
            if (target.classList.contains('aboutus-banner')) {
              target.classList.add('content-loaded');
            } else if (target.classList.contains('aboutus-intro')) {
              target.classList.add('intro-loaded');
            }
          } else {
            if (target.classList.contains('aboutus-banner')) {
              target.classList.remove('content-loaded');
            } else if (target.classList.contains('aboutus-intro')) {
              target.classList.remove('intro-loaded');
            }
          }
        });
      },
      { threshold: 0.2, rootMargin: '0px 0px -10% 0px' },
    );

    if (bannerRef.current) observer.observe(bannerRef.current);
    if (introRef.current) observer.observe(introRef.current);

    return () => observer.disconnect();
  }, []);

  return (
    <section className="aboutus-section">
      <div ref={bannerRef} className="aboutus-banner">
        <img
          src={mediaUrl('about_background')}
          alt=""
          className="background-image"
        />
        <div className="aboutus-content">
          <h1>关于我们</h1>
          <p>深入了解 Kunzz Holdings 的初心与成长轨迹</p>
        </div>
      </div>

      <div ref={introRef} className="aboutus-intro">
        <div className="intro-content">
          <h1>集团简介</h1>
          <p>
            Kunzz Holdings 是一家总部位于马来西亚的多元化控股集团，专注资源整合与效率提升，
            为旗下公司提供战略支持与运营协同。我们致力于用心打造品牌，
            激发团队潜力，助力企业在竞争中脱颖而出。
          </p>
        </div>
      </div>
    </section>
  );
}
