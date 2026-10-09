// ELK layout running in a Web Worker so the main thread (and the UI) stays responsive.
import ELK, { type ElkNode } from 'elkjs/lib/elk-api.js';
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url';
import type { Person } from '../data/generateOrg';

export const NODE_W = 180;
export const NODE_H = 56;
// Stacked direct reports sit indented under the manager; the smoothstep edges into
// their left side then share one vertical rail inside that indent.
export const STACK_INDENT = 32;
const STACK_GAP = 12;
// From this level down, a manager's whole team is drawn as an indented (hanging)
// tree instead of a fanned-out tree, which is what keeps the chart from going wide.
export const HANGING_LEVEL = 3;
const LEVEL_GAP = 64;

// How the edge into a person attaches: from the manager's top-down fan ('top'), into
// a stacked column ('stack'), or along the left rail of a hanging team ('rail').
export type Inbound = 'top' | 'stack' | 'rail';

export type Algo = 'mrtree' | 'layered';
export type Positioned = { id: string; x: number; y: number };

// Official bundler-friendly setup: elk-api on the main thread, the ELK engine in a
// classic Web Worker served untouched (?url) so the UMD bundle is not re-wrapped.
const elk = new ELK({ workerUrl: elkWorkerUrl });

export async function layoutOrg(
  people: Person[],
  algo: Algo,
  compact: boolean,
): Promise<{ positions: Positioned[]; inbound: Map<string, Inbound>; ms: number }> {
  const reports = new Map<string, Person[]>();
  for (const p of people) {
    if (!p.managerId) continue;
    if (!reports.has(p.managerId)) reports.set(p.managerId, []);
    reports.get(p.managerId)!.push(p);
  }
  const inbound = new Map<string, Inbound>(people.map((p) => [p.id, 'top']));

  // Hanging teams: each manager at HANGING_LEVEL plus everyone under them, in DFS
  // order with their depth. ELK sees the whole team as one tall node.
  const blocks = new Map<string, { p: Person; depth: number }[]>();
  if (compact) {
    for (const head of people) {
      if (head.level !== HANGING_LEVEL || !reports.has(head.id)) continue;
      const rows: { p: Person; depth: number }[] = [];
      const walk = (p: Person, depth: number) => {
        rows.push({ p, depth });
        if (depth > 0) inbound.set(p.id, 'rail');
        for (const k of reports.get(p.id) ?? []) walk(k, depth + 1);
      };
      walk(head, 0);
      blocks.set(head.id, rows);
    }
  }
  const inBlock = new Set([...blocks.values()].flat().map((r) => r.p.id));

  // Classic org-chart trick for the levels above: a manager's direct reports that
  // have no reports of their own go in one column instead of a row.
  const stacks = new Map<string, Person[]>();
  if (compact) {
    for (const [managerId, kids] of reports) {
      if (inBlock.has(managerId)) continue;
      const leaves = kids.filter((k) => !reports.has(k.id));
      if (leaves.length < 2) continue;
      stacks.set(managerId, leaves);
      for (const l of leaves) inbound.set(l.id, 'stack');
    }
  }

  // What ELK lays out: free people, stacked columns and hanging teams, each as one box.
  const boxOf = (p: Person) =>
    blocks.has(p.id) ? `block-${p.id}` : inbound.get(p.id) === 'stack' ? `stack-${p.managerId}` : p.id;
  const tops = people.filter((p) => !inBlock.has(p.id) || blocks.has(p.id));
  const children: ElkNode[] = [];
  const edges: { id: string; sources: string[]; targets: string[] }[] = [];
  const seen = new Set<string>();
  for (const p of tops) {
    const box = boxOf(p);
    if (seen.has(box)) continue;
    seen.add(box);
    if (box.startsWith('block-')) {
      const rows = blocks.get(p.id)!;
      const maxDepth = Math.max(...rows.map((r) => r.depth));
      children.push({ id: box, width: NODE_W + maxDepth * STACK_INDENT, height: rows.length * (NODE_H + STACK_GAP) - STACK_GAP });
    } else if (box.startsWith('stack-')) {
      const n = stacks.get(p.managerId!)!.length;
      children.push({ id: box, width: NODE_W + STACK_INDENT, height: n * (NODE_H + STACK_GAP) - STACK_GAP });
    } else {
      children.push({ id: box, width: NODE_W, height: NODE_H });
    }
    if (p.managerId) edges.push({ id: `e-${box}`, sources: [p.managerId], targets: [box] });
  }

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
    children,
    edges,
  };
  const t0 = performance.now();
  const res = await elk.layout(graph);
  const ms = performance.now() - t0;

  // ELK gives the x. mrtree centers every box on its level's axis, which leaves tall
  // boxes floating away from their manager, so y is taken top-down from the manager
  // instead: every box hangs a fixed gap below the bottom of its manager.
  const managerOf = new Map(tops.map((p) => [boxOf(p), p.managerId]));
  const yOf = new Map<string, number>();
  for (const c of children) {
    // `children` is in people order (BFS), so a manager's y is known before its reports'.
    const m = managerOf.get(c.id);
    yOf.set(c.id, m ? yOf.get(m)! + NODE_H + LEVEL_GAP : 0);
  }

  const positions: Positioned[] = [];
  for (const c of res.children ?? []) {
    const x = c.x ?? 0;
    const y = yOf.get(c.id)!;
    if (c.id.startsWith('block-')) {
      blocks.get(c.id.slice('block-'.length))!.forEach(({ p, depth }, i) => {
        positions.push({ id: p.id, x: x + depth * STACK_INDENT, y: y + i * (NODE_H + STACK_GAP) });
      });
    } else if (c.id.startsWith('stack-')) {
      stacks.get(c.id.slice('stack-'.length))!.forEach((p, i) => {
        positions.push({ id: p.id, x: x + STACK_INDENT, y: y + i * (NODE_H + STACK_GAP) });
      });
    } else {
      positions.push({ id: c.id, x, y });
    }
  }
  return { positions, inbound, ms };
}
