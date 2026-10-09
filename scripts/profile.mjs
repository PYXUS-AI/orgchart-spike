// Headless-Chromium profiler for the spike.
// Measures, per variant: ELK layout time, time to first full render, FPS during
// scripted pan and zoom (avg / p5 / p95 frame time), long tasks, JS heap.
//
// Usage:  npm run build && npm run profile            (uses `vite preview` on :4173)
//         CPU=4 npm run profile                        (4x CPU throttling, "mid-range laptop")
//         VARIANTS="n=2000&virt=1,n=5000&virt=0" npm run profile
//         CHROME=/path/to/chrome npm run profile       (if Playwright's bundled Chromium is missing)

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const PORT = 4173;
const CPU = Number(process.env.CPU ?? 1);
const VARIANTS = (
  process.env.VARIANTS ??
  'n=2000&virt=1&lod=1,n=2000&virt=0&lod=1,n=2000&virt=1&lod=0,n=5000&virt=1&lod=1,n=2000&virt=1&lod=1&algo=layered'
).split(',');

const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME || undefined,
  args: ['--enable-precise-memory-info', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
});

const results = [];
try {
  for (const q of VARIANTS) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });

    await page.goto(`http://localhost:${PORT}/?${q}`);
    await page.waitForFunction(() => window.__spike?.ready, null, { timeout: 120_000 });
    await page.waitForTimeout(500);
    const base = await page.evaluate(() => {
      const s = window.__spike;
      return { nodes: s.nodes, edges: s.edges, layoutMs: s.layoutMs, firstRenderMs: s.firstRenderMs };
    });
    const domNodes = await page.evaluate(() => document.querySelectorAll('.react-flow__node').length);

    // Long tasks observer (>50 ms blocks of main thread)
    await page.evaluate(() => {
      window.__long = 0;
      new PerformanceObserver((l) => (window.__long += l.getEntries().length)).observe({ type: 'longtask', buffered: false });
    });

    // ---- Scripted interaction: 3 s of pan (mouse drag), then 3 s of zoom (wheel)
    const rec = async (fn) => {
      await page.evaluate(() => { window.__spike.frameTimes = []; window.__spike.recording = true; });
      await fn();
      return page.evaluate(() => { window.__spike.recording = false; return window.__spike.frameTimes; });
    };
    const stats = (ft) => {
      if (!ft.length) return { fps: 0, p5fps: 0, p95ms: 0, frames: 0 };
      const sorted = [...ft].sort((a, b) => a - b);
      const avg = ft.reduce((a, b) => a + b, 0) / ft.length;
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      return { fps: +(1000 / avg).toFixed(1), p5fps: +(1000 / p95).toFixed(1), p95ms: +p95.toFixed(1), frames: ft.length };
    };

    const panFt = await rec(async () => {
      await page.mouse.move(720, 450);
      await page.mouse.down();
      for (let i = 0; i < 60; i++) {
        await page.mouse.move(720 + Math.sin(i / 6) * 300, 450 + Math.cos(i / 6) * 200, { steps: 2 });
        await page.waitForTimeout(40);
      }
      await page.mouse.up();
    });
    const zoomFt = await rec(async () => {
      for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(50); }
      for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(50); }
    });

    const longTasks = await page.evaluate(() => window.__long);
    const m = await cdp.send('Performance.getMetrics');
    const heapMB = +(m.metrics.find((x) => x.name === 'JSHeapUsedSize').value / 1048576).toFixed(0);
    const domCount = m.metrics.find((x) => x.name === 'Nodes').value;

    const row = { variant: q, cpu: `${CPU}x`, ...base, domNodesRendered: domNodes, domTotal: domCount, pan: stats(panFt), zoom: stats(zoomFt), longTasks, heapMB };
    results.push(row);
    console.log(JSON.stringify(row));
    await page.close();
  }
} finally {
  await browser.close();
  preview.kill();
}

mkdirSync('profiling', { recursive: true });
const out = `profiling/results-cpu${CPU}x-${Date.now()}.json`;
writeFileSync(out, JSON.stringify(results, null, 2));

console.log('\n| variant | ELK ms | first render ms | DOM nodes rendered | pan FPS avg / p5 | zoom FPS avg / p5 | long tasks | heap MB |');
console.log('|---|---|---|---|---|---|---|---|');
for (const r of results)
  console.log(`| ${r.variant} (${r.cpu}) | ${r.layoutMs} | ${r.firstRenderMs} | ${r.domNodesRendered}/${r.nodes} | ${r.pan.fps} / ${r.pan.p5fps} | ${r.zoom.fps} / ${r.zoom.p5fps} | ${r.longTasks} | ${r.heapMB} |`);
console.log(`\nsaved ${out}`);
