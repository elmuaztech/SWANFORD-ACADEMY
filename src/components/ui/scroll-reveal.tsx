'use client';

import React, { useEffect, useRef, useState } from 'react';

export type ScrollAnimationType =
  | 'fade-up'
  | 'fade-in'
  | 'fade-left'
  | 'fade-right'
  | 'scale'
  | 'zoom';

export interface ScrollRevealProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  animation?: ScrollAnimationType;
  delay?: number; // milliseconds
  duration?: number; // milliseconds
  threshold?: number;
  once?: boolean;
  as?: React.ElementType;
  className?: string;
}

/**
 * Swanford Academy — ScrollReveal Component
 * High-performance, GPU-accelerated scroll reveal wrapper with IntersectionObserver
 * and full accessibility support (prefers-reduced-motion).
 */
export function ScrollReveal({
  children,
  animation = 'fade-up',
  delay = 0,
  duration = 750,
  threshold = 0.12,
  once = true,
  as: Component = 'div',
  className = '',
  style,
  ...props
}: ScrollRevealProps) {
  const elementRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return true;
    }
    return false;
  });

  useEffect(() => {
    const currentEl = elementRef.current;
    if (!currentEl) return;

    if (typeof IntersectionObserver === 'undefined') {
      const raf = requestAnimationFrame(() => setIsVisible(true));
      return () => cancelAnimationFrame(raf);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (once && currentEl) {
            observer.unobserve(currentEl);
          }
        } else if (!once) {
          setIsVisible(false);
        }
      },
      {
        threshold,
        rootMargin: '0px 0px -40px 0px',
      }
    );

    observer.observe(currentEl);

    return () => {
      if (currentEl) observer.unobserve(currentEl);
    };
  }, [threshold, once]);

  const customStyle: React.CSSProperties = {
    ...style,
    ...(delay > 0 ? { transitionDelay: `${delay}ms` } : {}),
    ...(duration > 0 ? { transitionDuration: `${duration}ms` } : {}),
  };

  return (
    <Component
      ref={elementRef}
      data-reveal={animation}
      data-revealed={isVisible ? 'true' : 'false'}
      className={`scroll-reveal reveal-${animation} ${isVisible ? 'revealed' : ''} ${className}`.trim()}
      style={customStyle}
      {...props}
    >
      {children}
    </Component>
  );
}

export interface ScrollStaggerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  staggerMs?: number;
  animation?: ScrollAnimationType;
  className?: string;
}

/**
 * ScrollStagger Component
 * Automatically staggers child elements with sequential entrance delays.
 */
export function ScrollStagger({
  children,
  staggerMs = 80,
  animation = 'fade-up',
  className = '',
  ...props
}: ScrollStaggerProps) {
  const childrenArray = React.Children.toArray(children);

  return (
    <div className={`scroll-stagger ${className}`.trim()} {...props}>
      {childrenArray.map((child, index) => (
        <ScrollReveal
          key={index}
          animation={animation}
          delay={index * staggerMs}
        >
          {child}
        </ScrollReveal>
      ))}
    </div>
  );
}
