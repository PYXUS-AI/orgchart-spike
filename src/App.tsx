import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, Background, MiniMap, type Edge, type Viewport } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './styles.css';
import { DEPT_COLORS, generateOrg } from './data/generateOrg';
import { layoutOrg, NODE_H, NODE_W, type Algo } from './layout/elk';
import { PersonNode, type PersonNodeType } from './nodes/PersonNode';
import { useFps, useHeapMB } from './hud/useFps';

// ---- URL-driven config so every variant is reproducible (and scriptable by Playwright)
const params = new URLSearchParams(location.search);
const CONFIG = {
  n: Number(params.get('n') ?? 2000),
  virt: params.get('virt') !== '0', // onlyRenderVisibleElements
  lod: params.get('lod') !== '0', // semantic zoom via CSS
  algo: (params.get('algo') ?? 'mrtree') as Algo,
  minimap: params.get('minimap') === '1',
  compact: params.get('compact') !== '0', // stacked columns + hanging teams (narrow chart)
  dotted: params.get('dotted') !== '0', // dotted-line (matrix) reporting edges
};

const nodeTypes = { person: PersonNode };
const T_START = performance.now();

// Metrics exposed for the profiler and the HUD
const spike = ((window as any).__spike = {
  ready: false,
  config: CONFIG,
  nodes: 0,
  edges: 0,
  layoutMs: 0,
  firstRenderMs: 0,
  recording: false,
  frameTimes: [] as number[],
});

export default function App() {
  const [nodes, setNodes] = useState<PersonNodeType[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [status, setStatus] = useState('generating…');
  const wrapRef = useRef<HTMLDivElement>(null);
  const fps = useFps();
  const heap = useHeapMB();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const people = generateOrg(CONFIG.n);
      setStatus(`laying out ${people.length} nodes with ELK (${CONFIG.algo}) in a worker…`);
      const { positions, inbound, ms } = await layoutOrg(people, CONFIG.algo, CONFIG.compact);
      if (cancelled) return;
      const pos = new Map(positions.map((p) => [p.id, p]));
      const ns: PersonNodeType[] = people.map((p) => ({
        id: p.id,
        type: 'person',
        position: { x: pos.get(p.id)!.x, y: pos.get(p.id)!.y },
        width: NODE_W,
        height: NODE_H,
        data: p,
      }));
      const byId = new Map(people.map((p) => [p.id, p]));
      const es: Edge[] = people
        .filter((p) => p.managerId)
        .map((p) => ({
          id: `e-${p.id}`,
          source: p.managerId!,
          target: p.id,
          sourceHandle: inbound.get(p.id) === 'rail' ? 'rail' : 'bottom',
          targetHandle: inbound.get(p.id) === 'top' ? 'top' : 'left',
          type: 'smoothstep',
        }));
      if (CONFIG.dotted) {
        for (const p of people) {
          if (!p.dottedManagerId) continue;
          es.push({
            id: `d-${p.id}`,
            source: p.dottedManagerId,
            target: p.id,
            sourceHandle: 'bottom',
            targetHandle: 'top',
            className: 'dotted',
            style: { stroke: DEPT_COLORS[byId.get(p.dottedManagerId)!.dept] },
          });
        }
      }
      spike.layoutMs = Math.round(ms);
      spike.nodes = ns.length;
      spike.edges = es.length;
      setNodes(ns);
      setEdges(es);
      setStatus('ready');
      // Two frames after commit ≈ first painted frame with all nodes.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          spike.firstRenderMs = Math.round(performance.now() - T_START);
          spike.ready = true;
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Semantic zoom: write a data attribute directly on the DOM. No React state,
  // so a zoom change re-renders zero nodes; CSS does the level-of-detail.
  const onMove = useCallback((_: unknown, vp: Viewport) => {
    if (!CONFIG.lod || !wrapRef.current) return;
    const lod = vp.zoom < 0.3 ? '0' : vp.zoom < 0.6 ? '1' : '2';
    if (wrapRef.current.dataset.lod !== lod) wrapRef.current.dataset.lod = lod;
  }, []);

  const hud = useMemo(
    () => ({ nodes: spike.nodes, edges: spike.edges, layoutMs: spike.layoutMs, firstRenderMs: spike.firstRenderMs }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, fps],
  );

  return (
    <div ref={wrapRef} className="wrap" data-lod="2">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onMove={onMove}
        onlyRenderVisibleElements={CONFIG.virt}
        fitView
        minZoom={0.05}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={32} />
        {CONFIG.minimap && <MiniMap pannable zoomable />}
      </ReactFlow>

      <div className="hud">
        <div className="hud-title">React Flow + ELK spike</div>
        <div>status: <b>{status}</b></div>
        <div>nodes / edges: <b>{hud.nodes} / {hud.edges}</b></div>
        <div>ELK layout ({CONFIG.algo}): <b>{hud.layoutMs} ms</b> (worker)</div>
        <div>first full render: <b>{hud.firstRenderMs} ms</b> since script start</div>
        <div>FPS: <b className={fps && fps < 30 ? 'bad' : ''}>{fps}</b></div>
        <div>JS heap: <b>{heap ?? 'n/a'} MB</b></div>
        <div className="legend">
          <span><i className="line" /> reports to</span>
          <span><i className="line dashed" /> dotted line (matrix)</span>
        </div>
        <div className="hud-sep" />
        <Controls />
      </div>
    </div>
  );
}

function Controls() {
  const set = (k: string, v: string) => {
    const u = new URL(location.href);
    u.searchParams.set(k, v);
    location.href = u.toString();
  };
  return (
    <div className="controls">
      <label>
        nodes
        <select value={CONFIG.n} onChange={(e) => set('n', e.target.value)}>
          {[500, 1000, 2000, 5000, 10000].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <label>
        layout
        <select value={CONFIG.algo} onChange={(e) => set('algo', e.target.value)}>
          <option value="mrtree">mrtree (tree)</option>
          <option value="layered">layered (DAG)</option>
        </select>
      </label>
      <label><input type="checkbox" checked={CONFIG.virt} onChange={(e) => set('virt', e.target.checked ? '1' : '0')} /> virtualize (onlyRenderVisibleElements)</label>
      <label><input type="checkbox" checked={CONFIG.lod} onChange={(e) => set('lod', e.target.checked ? '1' : '0')} /> semantic zoom (CSS LOD)</label>
      <label><input type="checkbox" checked={CONFIG.compact} onChange={(e) => set('compact', e.target.checked ? '1' : '0')} /> compact (columns + hanging teams)</label>
      <label><input type="checkbox" checked={CONFIG.dotted} onChange={(e) => set('dotted', e.target.checked ? '1' : '0')} /> dotted-line reports</label>
      <label><input type="checkbox" checked={CONFIG.minimap} onChange={(e) => set('minimap', e.target.checked ? '1' : '0')} /> minimap</label>
    </div>
  );
}
