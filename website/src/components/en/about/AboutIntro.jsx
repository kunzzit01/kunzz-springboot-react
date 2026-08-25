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
          <h1>About Us</h1>
          <p>Discover the origins and growth journey of Kunzz Holdings</p>
        </div>
      </div>

      <div ref={introRef} className="aboutus-intro">
        <div className="intro-content">
          <h1>About Kunzz Group</h1>
          <p>
            Kunzz Holdings is a diversified holding group headquartered in Malaysia, focused on
            resource integration and operational efficiency. We provide strategic support and
            operational synergy for our subsidiaries. We are committed to building brands with
            heart, unleashing team potential, and helping businesses stand out in a competitive
            landscape.
          </p>
        </div>
      </div>
    </section>
  );
}
