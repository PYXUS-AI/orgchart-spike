import { useEffect, useRef, useState } from 'react';

// rAF-based frame counter. Publishes to React state only once per second so the
// HUD itself doesn't become a source of re-renders. Also records every frame
// duration into window.__spike for the Playwright profiler (p95 etc.).
export function useFps() {
  const [fps, setFps] = useState(0);
  const frames = useRef(0);
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let bucketStart = last;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      frames.current++;
      const s = (window as any).__spike;
      if (s?.recording) s.frameTimes.push(dt);
      if (now - bucketStart >= 1000) {
        setFps(Math.round((frames.current * 1000) / (now - bucketStart)));
        frames.current = 0;
        bucketStart = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return fps;
}

export function useHeapMB() {
  const [mb, setMb] = useState<number | null>(null);
  useEffect(() => {
    const id = setInterval(() => {
      const m = (performance as any).memory;
      if (m) setMb(Math.round(m.usedJSHeapSize / 1048576));
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return mb;
}
