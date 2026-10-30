import { useEffect, useRef } from 'react';

const SCALE_FADE_SELECTOR = '.values-scale-fade, .culture-scale-fade';

function setScaleFadeVisible(container, visible) {
  container.querySelectorAll(SCALE_FADE_SELECTOR).forEach((el) => {
    el.classList.toggle('visible', visible);
  });
}

function resetScaleFadeIn(container) {
  container.querySelectorAll('.scale-fade-in').forEach((el) => {
    el.style.animationPlayState = 'paused';
    el.style.opacity = '0';
    el.style.transform = 'scale(0.8)';
  });
}

/**
 * 2026-10-30 性能：原来每个元素都做一次 `void el.offsetHeight`（强制同步布局），
 * 而这个函数是在 IntersectionObserver 回调里执行的（正好落在滚动/翻页那一帧），
 * 元素一多就会逐元素触发重排 → 掉帧。
 * 现在改成「先统一清掉动画 → 下一帧 (rAF) 再统一加回」，不再强制回流。
 */
function playScaleFadeIn(container) {
  const els = container.querySelectorAll('.scale-fade-in');
  if (!els.length) return;
  els.forEach((el) => { el.style.animation = 'none'; });
  requestAnimationFrame(() => {
    els.forEach((el) => {
      el.style.animation = '';
      el.style.animationPlayState = 'running';
    });
  });
}

/**
 * Observes an `.animate-on-scroll` element and toggles `.visible` — matches original PHP site.
 */
export function useAnimateOnScroll() {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    resetScaleFadeIn(el);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const target = entry.target;

          if (entry.isIntersecting) {
            target.classList.add('visible');
            setScaleFadeVisible(target, true);
            playScaleFadeIn(target);
          } else {
            target.classList.remove('visible');
            setScaleFadeVisible(target, false);
            resetScaleFadeIn(target);
          }
        });
      },
      { threshold: 0.2 },
    );

    observer.observe(el);

    // Swiper slides: if already in view on mount, show immediately
    const rect = el.getBoundingClientRect();
    const inView =
      rect.top < window.innerHeight * 0.85 && rect.bottom > window.innerHeight * 0.15;
    if (inView) {
      el.classList.add('visible');
      setScaleFadeVisible(el, true);
      playScaleFadeIn(el);
    }

    return () => observer.disconnect();
  }, []);

  return ref;
}
