import { useEffect, useState } from 'react';
import { Swiper } from 'swiper/react';
import { Mousewheel } from 'swiper/modules';

import 'swiper/css';

/**
 * 鼠标滚轮 / 触控板控制（2026-10-30 修“一下滚两屏”）
 *
 * 原因：笔记本触控板一次轻刷会连续发出几十个小的 wheel 事件，
 * Swiper 默认的阈值很小，于是每个事件都可能切一屏 → 停不下来、一下跳两屏。
 * 这里加两个门槛：
 *   · thresholdDelta：累计滚动量不够 40 不切；
 *   · thresholdTime：650ms 内最多切一屏（再快的手势也只算一次）。
 * 同时把 sensitivity 调低，抵消触控板的惯性递增量。
 */
const MOUSEWHEEL_OPTIONS = {
  enabled: true,
  forceToAxis: true,
  sensitivity: 0.7,
  // 2026-10-30：从 40/650 调到 30/300 —— 原来两次翻页要间隔 0.65s，
  // 笔记本触控板连划会感觉“卡住/发木”；实测 FPS 75~100 说明不是掉帧而是响应迟钝。
  thresholdDelta: 28,
  thresholdTime: 250,
  releaseOnEdges: false,
  eventsTarget: 'container',
};

/**
 * Full-viewport vertical swiper. Uses slidesPerView "auto" so the footer slide
 * can be shorter (~29vh) like the original PHP site.
 */
export default function VerticalSwiper({
  children,
  className = '',
  onSwiper,
  onSlideChange,
  slideCount = 4,
}) {
  const [instance, setInstance] = useState(null);

  useEffect(() => {
    if (!instance || instance.destroyed || typeof ResizeObserver === 'undefined') return;

    let frame = 0;
    let pending = false;
    const observed = new Set();

    // Swiper observes its viewport, not individual auto-height slides. Fonts,
    // responsive transitions and async content can change a slide afterwards.
    const flush = () => {
      frame = 0;
      if (!pending || instance.destroyed) return;
      // Do not interrupt the user's gesture or an in-flight slide transition.
      if (instance.animating || instance.touchEventsData?.isTouched) return;
      pending = false;
      instance.update();
    };
    const schedule = () => {
      if (pending && !frame && !instance.destroyed) frame = requestAnimationFrame(flush);
    };
    const observer = new ResizeObserver((entries) => {
      if (instance.destroyed) return;
      for (const entry of entries) {
        const index = instance.slides.indexOf(entry.target);
        if (index < 0) continue;
        const box = entry.borderBoxSize;
        const height = (Array.isArray(box) ? box[0] : box)?.blockSize
          ?? entry.target.getBoundingClientRect().height;
        const cached = instance.slidesSizesGrid[index];
        if (typeof cached === 'number' && Math.abs(height - cached) > 0.5) pending = true;
      }
      schedule();
    });
    const syncSlides = () => {
      const current = new Set(instance.slides);
      for (const slide of observed) {
        if (!current.has(slide)) {
          observer.unobserve(slide);
          observed.delete(slide);
        }
      }
      for (const slide of current) {
        if (!observed.has(slide)) {
          observer.observe(slide, { box: 'border-box' });
          observed.add(slide);
        }
      }
    };

    syncSlides();
    instance.on('slidesUpdated', syncSlides);
    instance.on('transitionEnd', schedule);
    instance.on('touchEnd', schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      instance.off('slidesUpdated', syncSlides);
      instance.off('transitionEnd', schedule);
      instance.off('touchEnd', schedule);
    };
  }, [instance]);

  const emitSlideIndex = (swiper) => {
    if (!onSlideChange) return;
    // Match PHP: on last stretch of scroll, highlight final dot
    if (swiper.progress > 0.95) {
      onSlideChange(slideCount - 1);
    } else {
      onSlideChange(swiper.activeIndex);
    }
  };

  return (
    <div className="vertical-swiper-shell">
      <Swiper
        className={className}
        direction="vertical"
        modules={[Mousewheel]}
        mousewheel={MOUSEWHEEL_OPTIONS}
        slidesPerView="auto"
        spaceBetween={0}
        speed={450}
        simulateTouch
        allowTouchMove
        touchReleaseOnEdges
        resistanceRatio={0.85}
        // 保留长滑阈值；oneWayMovement 会强制向前，不能用它限制翻页次数。
        longSwipesRatio={0.15}
        longSwipesMs={300}
        watchOverflow
        onSwiper={(swiper) => {
          setInstance(swiper);
          onSwiper?.(swiper);
        }}
        onSlideChange={emitSlideIndex}
        onSetTransition={(_swiper, duration) => {
          setTimeout(() => emitSlideIndex(_swiper), duration + 50);
        }}
      >
        {children}
      </Swiper>
    </div>
  );
}
