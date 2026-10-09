// ELK layout running in a Web Worker so the main thread (and the UI) stays responsive.
import ELK, { type ElkNode } from 'elkjs/lib/elk-api.js';
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url';
import type { Person } from '../data/generateOrg';

export const NODE_W = 180;
export const NODE_H = 56;

export type Algo = 'mrtree' | 'layered';
export type Positioned = { id: string; x: number; y: number };

// Official bundler-friendly setup: elk-api on the main thread, the ELK engine in a
// classic Web Worker served untouched (?url) so the UMD bundle is not re-wrapped.
const elk = new ELK({ workerUrl: elkWorkerUrl });

export async function layoutOrg(people: Person[], algo: Algo): Promise<{ positions: Positioned[]; ms: number }> {
  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': algo,
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': '24',
      'elk.layered.spacing.nodeNodeBetweenLayers': '64',
      'elk.mrtree.spacing.nodeNode': '24',
      // Cheap settings: we care about speed for the spike, not aesthetics.
      'elk.layered.nodePlacement.strategy': 'SIMPLE',
      'elk.layered.thoroughness': '1',
    },
    children: people.map((p) => ({ id: p.id, width: NODE_W, height: NODE_H })),
    edges: people.filter((p) => p.managerId).map((p) => ({ id: `e-${p.id}`, sources: [p.managerId!], targets: [p.id] })),
  };
  const t0 = performance.now();
  const res = await elk.layout(graph);
  const ms = performance.now() - t0;
  const positions = (res.children ?? []).map((c) => ({ id: c.id, x: c.x ?? 0, y: c.y ?? 0 }));
  return { positions, ms };
}
