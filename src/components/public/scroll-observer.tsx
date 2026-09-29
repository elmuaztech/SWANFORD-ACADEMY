'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Swanford Academy — Global Scroll Animation Observer
 * Automatically detects elements with `data-reveal` or `reveal-*` classes
 * across the site and triggers smooth, GPU-accelerated entrance animations on scroll.
 */
export function ScrollObserver() {
  const pathname = usePathname();

  useEffect(() => {
    // Respect reduced motion accessibility
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.querySelectorAll<HTMLElement>('[data-reveal], .scroll-reveal, .reveal-fade-up, .reveal-fade-left, .reveal-fade-right, .reveal-scale, .reveal-fade-in').forEach((el) => {
        el.classList.add('revealed');
        el.setAttribute('data-revealed', 'true');
      });
      return;
    }

    if (typeof IntersectionObserver === 'undefined') {
      document.querySelectorAll<HTMLElement>('[data-reveal], .scroll-reveal, .reveal-fade-up, .reveal-fade-left, .reveal-fade-right, .reveal-scale, .reveal-fade-in').forEach((el) => {
        el.classList.add('revealed');
        el.setAttribute('data-revealed', 'true');
      });
      return;
    }

    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const target = entry.target as HTMLElement;
            
            // Apply delay if specified in data-delay attribute
            const delay = target.getAttribute('data-delay');
            if (delay && !target.style.transitionDelay) {
              target.style.transitionDelay = `${delay}ms`;
            }

            // Apply duration if specified in data-duration attribute
            const duration = target.getAttribute('data-duration');
            if (duration && !target.style.transitionDuration) {
              target.style.transitionDuration = `${duration}ms`;
            }

            target.classList.add('revealed');
            target.setAttribute('data-revealed', 'true');
            obs.unobserve(target);
          }
        });
      },
      {
        threshold: 0.1,
        rootMargin: '0px 0px -40px 0px',
      }
    );

    const initObserver = () => {
      const elements = document.querySelectorAll<HTMLElement>(
        '[data-reveal], .scroll-reveal, .reveal-fade-up, .reveal-fade-left, .reveal-fade-right, .reveal-scale, .reveal-fade-in'
      );

      elements.forEach((el) => {
        // If already revealed or already in viewport
        if (el.getAttribute('data-revealed') === 'true' || el.classList.contains('revealed')) {
          return;
        }

        const rect = el.getBoundingClientRect();
        // If already visible in the initial viewport, reveal immediately
        if (rect.top <= window.innerHeight * 0.95 && rect.bottom >= 0) {
          const delay = el.getAttribute('data-delay');
          if (delay && !el.style.transitionDelay) {
            el.style.transitionDelay = `${delay}ms`;
          }
          el.classList.add('revealed');
          el.setAttribute('data-revealed', 'true');
        } else {
          observer.observe(el);
        }
      });
    };

    // Run after DOM has painted
    const frameId = requestAnimationFrame(initObserver);

    // Watch for dynamically inserted content (e.g., loaded gallery images, cards)
    const mutationObserver = new MutationObserver(() => {
      initObserver();
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Safety timeout: ensure everything is visible after 2 seconds regardless of scroll
    const fallbackTimer = setTimeout(() => {
      document.querySelectorAll<HTMLElement>(
        '[data-reveal]:not([data-revealed="true"]), .scroll-reveal:not(.revealed)'
      ).forEach((el) => {
        el.classList.add('revealed');
        el.setAttribute('data-revealed', 'true');
      });
    }, 2000);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(fallbackTimer);
      observer.disconnect();
      mutationObserver.disconnect();
    };
  }, [pathname]);

  return null;
}
