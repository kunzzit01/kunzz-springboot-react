import { useAnimateOnScroll } from './useAnimateOnScroll.js';

/** Wrapper for elements that need scroll-triggered animation. */
export function AnimateOnScroll({ as: Tag = 'div', className = '', children, ...props }) {
  const ref = useAnimateOnScroll();
  const classes = ['animate-on-scroll', className].filter(Boolean).join(' ');

  return (
    <Tag ref={ref} className={classes} {...props}>
      {children}
    </Tag>
  );
}
