import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTimeline } from '../../../hooks/useTimeline.js';
import { useIsMobile } from '../../../hooks/useIsMobile.js';

const MONTH_NAMES_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const COPY = {
  zh: {
    title: '— 我们的发展历史 —',
    loading: '加载中…',
    error: '无法加载时间线数据',
    empty: '暂无发展历史数据',
    prev: '上一项',
    next: '下一项',
    formatMonth: (month) => `${month}月`,
    formatYearBadge: (year, month) => {
      const y = String(year ?? '').trim();
      if (!y) return '';
      if (!month) return `${y}年`;
      return `${y} · ${month}月`;
    },
    formatImageAlt: (year) => `${year}年发展`,
  },
  en: {
    title: '— Our Development History —',
    loading: 'Loading…',
    error: 'Unable to load timeline data',
    empty: 'No timeline data available',
    prev: 'Previous',
    next: 'Next',
    formatMonth: (month) => MONTH_NAMES_EN[month - 1] || `Month ${month}`,
    formatYearBadge: (year, month) => {
      const y = String(year ?? '').trim();
      if (!y) return '';
      if (!month) return y;
      const monthLabel = MONTH_NAMES_EN[month - 1] || `Month ${month}`;
      return `${y} · ${monthLabel}`;
    },
    formatImageAlt: (year) => `Development in ${year}`,
  },
};

function resolveTimelineYear(item, index, years) {
  const candidates = [item?.year, item?.Year, years[index]];
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === '') continue;
    const year = String(candidate).trim();
    if (year && year !== '0' && year !== 'undefined' && year !== 'null') {
      return year;
    }
  }
  return '';
}

function formatTimelineYearBadge(copy, year, month) {
  const badgeMonth = month > 0 ? month : 0;
  const label = copy.formatYearBadge(year, badgeMonth);
  if (label) return label;
  return year;
}

export default function AboutTimeline({ lang = 'zh' }) {
  const copy = COPY[lang === 'en' ? 'en' : 'zh'];
  const isMobile = useIsMobile();
  const { items, years, yearGroups, firstIndexByYear, loading, error } = useTimeline(lang);
  const [currentIndex, setCurrentIndex] = useState(0);
  const isAnimatingRef = useRef(false);
  const containerRef = useRef(null);
  const sectionRef = useRef(null);

  const navMeta = useMemo(() => {
    const seen = new Set();
    return items.map((item, index) => {
      const year = String(item.year ?? '');
      const duplicate = seen.has(year);
      seen.add(year);
      return { item, index, year, duplicate };
    });
  }, [items]);

  const switchToCard = useCallback(
    (index) => {
      if (index < 0 || index >= items.length || isAnimatingRef.current) return;
      isAnimatingRef.current = true;
      setCurrentIndex(index);
      setTimeout(() => {
        isAnimatingRef.current = false;
      }, 400);
    },
    [items.length],
  );

  const navigateTimeline = useCallback(
    (direction) => {
      if (direction === 'next') {
        switchToCard(Math.min(currentIndex + 1, items.length - 1));
      } else {
        switchToCard(Math.max(currentIndex - 1, 0));
      }
    },
    [currentIndex, items.length, switchToCard],
  );

  const updateTimelineNav = useCallback(() => {
    const container = containerRef.current;
    if (!container || !container.parentElement) return;

    const allNavItems = container.querySelectorAll('.timeline-item');
    const currentYear = years[currentIndex];
    const visibleItems = Array.from(allNavItems).filter(
      (item) => !item.classList.contains('year-duplicate'),
    );

    allNavItems.forEach((item) => {
      item.classList.toggle('active', item.getAttribute('data-year') === currentYear);
    });

    const containerWidth = container.parentElement.offsetWidth;
    const itemWidth = 120;
    const activeVisibleIndex = visibleItems.findIndex((item) => item.classList.contains('active'));
    const centerPosition = containerWidth / 2;
    const currentItemPosition =
      (activeVisibleIndex >= 0 ? activeVisibleIndex : 0) * itemWidth + itemWidth / 2;
    const translateX = centerPosition - currentItemPosition;

    container.style.transition = 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    container.style.transform = `translateX(${translateX}px)`;
    setTimeout(() => {
      container.style.transition = '';
    }, 400);
  }, [currentIndex, years]);

  useEffect(() => {
    updateTimelineNav();
  }, [currentIndex, items, updateTimelineNav]);

  useEffect(() => {
    const handleResize = () => {
      setTimeout(updateTimelineNav, 100);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updateTimelineNav]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowLeft') navigateTimeline('prev');
      if (e.key === 'ArrowRight') navigateTimeline('next');
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [navigateTimeline]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const resetTimelineAnimation = () => {
      const title = section.querySelector('h1');
      const track = section.querySelector('.timeline-track');
      const navContainer = section.querySelector('.timeline-items-container');
      const navItems = section.querySelectorAll('.timeline-item');
      const arrows = section.querySelectorAll('.nav-arrow');

      if (title) {
        title.style.opacity = '0';
        title.style.transform = 'translateY(20px)';
      }
      if (track) track.style.transform = 'translateY(-50%) scaleX(0)';
      if (navContainer) navContainer.style.opacity = '0';
      navItems.forEach((item) => {
        item.style.opacity = '0';
        item.style.transform = 'scale(0.5) translateY(20px)';
      });
      arrows.forEach((arrow) => {
        arrow.style.opacity = '0';
        arrow.style.transform = 'translateY(-50%) scale(0.8)';
      });
    };

    const resetAndStartTimelineAnimation = () => {
      const els = section.querySelectorAll(
        'h1, .timeline-track, .timeline-items-container, .timeline-item, .nav-arrow',
      );
      els.forEach((el) => {
        el.style.animation = 'none';
        void el.offsetHeight;
        el.style.animation = '';
      });
    };

    resetTimelineAnimation();

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            section.classList.add('timeline-active');
            resetAndStartTimelineAnimation();
          } else {
            section.classList.remove('timeline-active');
            resetTimelineAnimation();
          }
        });
      },
      { threshold: 0.3, rootMargin: '0px 0px -20% 0px' },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  const currentYear = years[currentIndex];
  const monthsInYear = (yearGroups[currentYear] || []).filter((m) => m.month > 0);

  if (loading) {
    return (
      <section className="timeline-section" ref={sectionRef}>
        <h1>{copy.title}</h1>
        <p style={{ color: '#fff', textAlign: 'center' }}>{copy.loading}</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="timeline-section" ref={sectionRef}>
        <h1>{copy.title}</h1>
        <p style={{ color: '#fff', textAlign: 'center' }}>{copy.error}</p>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="timeline-section" ref={sectionRef}>
        <h1>{copy.title}</h1>
        <p style={{ color: '#fff', textAlign: 'center' }}>{copy.empty}</p>
      </section>
    );
  }

  return (
    <section className="timeline-section" id="timeline-1" ref={sectionRef}>
      <h1>{copy.title}</h1>

      <div className="timeline-nav">
        <button
          type="button"
          className="nav-arrow prev"
          onClick={() => navigateTimeline('prev')}
          aria-label={copy.prev}
        >
          ‹
        </button>
        <button
          type="button"
          className="nav-arrow next"
          onClick={() => navigateTimeline('next')}
          aria-label={copy.next}
        >
          ›
        </button>

        <div className="timeline-scroll-container">
          <div className="timeline-track" />
          <div className="timeline-items-container" id="timelineContainer" ref={containerRef}>
            {navMeta.map(({ item, index, year, duplicate }) => (
                <div
                  key={`${year}-${item.month}-${index}`}
                  className={`timeline-item${years[currentIndex] === year ? ' active' : ''}${duplicate ? ' year-duplicate' : ''}`}
                  data-year={year}
                  data-month={Number(item.month) || 0}
                  data-index={index}
                  onClick={() => switchToCard(firstIndexByYear[year] ?? index)}
                  onKeyDown={(e) => e.key === 'Enter' && switchToCard(firstIndexByYear[year] ?? index)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="timeline-bullet">{year}</div>
                </div>
            ))}
          </div>
        </div>
      </div>

      <div className="timeline-body">
        {!isMobile && monthsInYear.length > 0 ? (
        <div className="timeline-month-sidebar" id="monthSidebar">
          {monthsInYear.map((m) => (
            <div
              key={m.index}
              className={`month-item${m.index === currentIndex ? ' active' : ''}`}
              onClick={() => switchToCard(m.index)}
              onKeyDown={(e) => e.key === 'Enter' && switchToCard(m.index)}
              role="button"
              tabIndex={0}
            >
              <div className="month-dot" />
              <span>{copy.formatMonth(m.month)}</span>
            </div>
          ))}
        </div>
        ) : null}

        <div className="timeline-content-container">
          <div className="timeline-cards-wrapper">
            {items.map((item, index) => {
              const year = resolveTimelineYear(item, index, years);
              const month = Number(item.month) || 0;
              const badgeLabel = year ? formatTimelineYearBadge(copy, year, month) : '';
              return (
                <div
                  key={`content-${year}-${month}-${index}`}
                  className={`timeline-content-item${currentIndex === index ? ' active' : ''}`}
                  data-year={year}
                  data-index={index}
                  data-month={month}
                >
                  <div className="timeline-content">
                    <div className="timeline-image">
                      {item.image_url ? (
                        <img src={item.image_url} alt={copy.formatImageAlt(year)} />
                      ) : null}
                    </div>
                    <div className="timeline-text">
                      {badgeLabel ? (
                        <div className="year-badge">{badgeLabel}</div>
                      ) : null}
                      <h3>{item.title}</h3>
                      {item.description1 ? <p>{item.description1}</p> : null}
                      {item.description2 ? <p>{item.description2}</p> : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
