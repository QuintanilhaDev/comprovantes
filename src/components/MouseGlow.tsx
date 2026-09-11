"use client";

import { useEffect, useRef } from "react";

/**
 * Atualiza as variáveis CSS --mx / --my conforme o mouse se move, criando
 * uma luz laranja discreta que "acompanha" o ponteiro pelo fundo ônix.
 * Em telas touch (sem mouse), o efeito simplesmente não aparece.
 */
export default function MouseGlow() {
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    let lastX = window.innerWidth / 2;
    let lastY = window.innerHeight / 3;

    function apply(x: number, y: number) {
      root.style.setProperty("--mx", `${x}px`);
      root.style.setProperty("--my", `${y}px`);
    }
    apply(lastX, lastY);

    function onMove(e: PointerEvent) {
      if (e.pointerType === "touch") return;
      lastX = e.clientX;
      lastY = e.clientY;
      root.style.setProperty("--glow-opacity", "1");
      if (frame.current) return;
      frame.current = requestAnimationFrame(() => {
        apply(lastX, lastY);
        frame.current = null;
      });
    }

    function onLeave() {
      root.style.setProperty("--glow-opacity", "0");
    }

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, []);

  return (
    <>
      <div className="checker-bg" aria-hidden />
      <div className="mouse-glow" aria-hidden />
    </>
  );
}
