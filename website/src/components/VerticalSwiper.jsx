import { Swiper } from 'swiper/react';
import { Mousewheel } from 'swiper/modules';

import 'swiper/css';

const MOUSEWHEEL_OPTIONS = {
  enabled: true,
  forceToAxis: true,
  sensitivity: 1,
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
        speed={800}
        simulateTouch
        allowTouchMove
        touchReleaseOnEdges
        resistanceRatio={0.85}
        watchOverflow
        onSwiper={onSwiper}
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
