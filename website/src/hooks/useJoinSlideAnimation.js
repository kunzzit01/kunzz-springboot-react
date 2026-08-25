import { useEffect, useRef } from 'react';

/**
 * Adds joinus-loaded / benefits-loaded / contact-loaded classes like the PHP IntersectionObserver.
 */
export function useJoinSlideAnimation(className, loadedClass) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(loadedClass);
          } else {
            entry.target.classList.remove(loadedClass);
          }
        });
      },
      { threshold: 0.2, rootMargin: '0px 0px -10% 0px' },
    );

    observer.observe(el);

    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.85 && rect.bottom > window.innerHeight * 0.15) {
      el.classList.add(loadedClass);
    }

    return () => observer.disconnect();
  }, [loadedClass]);

  return ref;
}
