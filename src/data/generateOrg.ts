// Deterministic fake org tree. Same N always yields the same org (seeded PRNG),
// so profiling runs are comparable.

export type Person = {
  id: string;
  name: string;
  title: string;
  dept: string;
  level: number; // 0 = CEO
  managerId: string | null;
};

const DEPTS = ['Engineering', 'Sales', 'Marketing', 'Finance', 'People', 'Operations', 'Product', 'Support'];
const FIRST = ['Ana', 'Luis', 'Maya', 'Omar', 'Keri', 'Tom', 'Priya', 'Diego', 'Sara', 'Ken', 'Lila', 'Noah', 'Ivy', 'Raj', 'Zoe', 'Eli'];
const LAST = ['Rich', 'McCarty', 'Nguyen', 'Garcia', 'Okafor', 'Patel', 'Silva', 'Kim', 'Rossi', 'Haddad', 'Brown', 'Sato'];
const TITLES = ['CEO', 'VP', 'Director', 'Senior Manager', 'Manager', 'Team Lead', 'Senior IC', 'IC'];

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateOrg(n: number, seed = 42): Person[] {
  const rnd = mulberry32(seed);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const people: Person[] = [];
  const queue: Person[] = [];

  const ceo: Person = { id: 'p0', name: 'Alex Founder', title: 'CEO', dept: 'Executive', level: 0, managerId: null };
  people.push(ceo);
  queue.push(ceo);

  while (people.length < n && queue.length) {
    const mgr = queue.shift()!;
    // Branching: wide at the top, narrower below -> depth ~6 for 2k, ~7 for 5k.
    const kids = mgr.level === 0 ? DEPTS.length : mgr.level < 3 ? 3 + Math.floor(rnd() * 4) : 2 + Math.floor(rnd() * 6);
    for (let k = 0; k < kids && people.length < n; k++) {
      const level = mgr.level + 1;
      const dept = mgr.level === 0 ? DEPTS[k % DEPTS.length] : mgr.dept;
      const p: Person = {
        id: `p${people.length}`,
        name: `${pick(FIRST)} ${pick(LAST)}`,
        title: TITLES[Math.min(level, TITLES.length - 1)],
        dept,
        level,
        managerId: mgr.id,
      };
      people.push(p);
      queue.push(p);
    }
  }
  return people;
}

export const DEPT_COLORS: Record<string, string> = {
  Executive: '#1f3a5f', Engineering: '#2f6fed', Sales: '#e07b39', Marketing: '#c94f9b',
  Finance: '#2a9d8f', People: '#8a5cf6', Operations: '#6b7280', Product: '#f2b134', Support: '#3fa34d',
};
