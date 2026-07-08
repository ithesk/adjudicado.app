"use client";

import { useEffect, useRef } from "react";

// Aparece con un fundido sutil al entrar al viewport. La clase oculta se
// aplica recién al montar y SOLO a lo que aún está por debajo del viewport:
// ocultar contenido ya pintado (o ya scrolleado antes de hidratar) causaría
// un parpadeo o lo dejaría invisible. Sin JavaScript todo queda visible, y
// prefers-reduced-motion se respeta vía CSS (globals.css).
export default function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.getBoundingClientRect().top <= window.innerHeight - 40) return;

    el.classList.add("reveal");
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("reveal-in");
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
