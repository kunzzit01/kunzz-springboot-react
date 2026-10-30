import { useEffect, useRef, useState } from 'react';
import { useAnimateOnScroll } from '../../hooks/useAnimateOnScroll.js';
import { mediaUrl } from '../../utils/media.js';

function HeroBackground() {
  const [videoFailed, setVideoFailed] = useState(false);
  const videoRef = useRef(null);

  // 2026-10-29 性能：首页背景视频 1920×1080 / 50fps / ~19 MB，以前一旦开播就永不停，
  // 滑到其他 slide、或标签页切走都在继续解码，和滚动抢主线程/GPU。
  // 这里用 IntersectionObserver + visibilitychange 做到「看不见就暂停」。
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;

    const play = () => { v.play().catch(() => {}); };
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (e.isIntersecting && !document.hidden) play();
        else v.pause();
      },
      { threshold: 0.05 },
    );
    io.observe(v);

    const onVisibility = () => {
      if (document.hidden) { v.pause(); return; }
      const r = v.getBoundingClientRect();
      if (r.bottom > 0 && r.top < window.innerHeight) play();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [videoFailed]);

  if (videoFailed) {
    return (
      <div
        className="background-video background-image-fallback"
        style={{ backgroundImage: "url('/images/背景4.webp')" }}
        aria-hidden="true"
      />
    );
  }

  return (
    <video
      ref={videoRef}
      className="background-video"
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      poster="/images/背景4.webp"
      onError={() => setVideoFailed(true)}
    >
      {/* MIME 由 /media/home_background 的 Content-Type 决定，兼容 webm/mp4 */}
      <source src={mediaUrl('home_background')} />
    </video>
  );
}

export default function HomeHero() {
  const animRef = useAnimateOnScroll();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const onLoad = () => setLoaded(true);
    if (document.readyState === 'complete') {
      setLoaded(true);
    } else {
      window.addEventListener('load', onLoad);
      return () => window.removeEventListener('load', onLoad);
    }
  }, []);

  return (
    <section className={`home${loaded ? ' gradient-loaded' : ''}`}>
      <HeroBackground />

      <div
        ref={animRef}
        className={`home-content animate-on-scroll${loaded ? ' visible' : ' hidden'}`}
      >
        <h1 className="scale-fade-in">
          让空间温暖 <span style={{ fontSize: '1.5em' }}>.</span> 让团队闪光
        </h1>
        <div className="decor-line scale-fade-in" />
        <p className="scale-fade-in">
          我们用细节构建舒适的氛围，在积极的文化中滋养每一份热情与专注。
          <br />
          我们相信，高效源于信任，创新源于自由。一支有温度的团队，
          <br />
          才能创造持续的价值，向着行业标杆的方向，稳步前行。
        </p>
      </div>
    </section>
  );
}
