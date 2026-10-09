// Deterministic fake org tree. Same N always yields the same org (seeded PRNG),
// so profiling runs are comparable.

export type Person = {
  id: string;
  name: string;
  title: string;
  dept: string;
  level: number; // 0 = CEO
  managerId: string | null;
  dottedManagerId: string | null; // matrix org: secondary (dotted-line) manager in another dept
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

  const ceo: Person = { id: 'p0', name: 'Alex Founder', title: 'CEO', dept: 'Executive', level: 0, managerId: null, dottedManagerId: null };
  people.push(ceo);
  queue.push(ceo);

  while (people.length < n && queue.length) {
    const mgr = queue.shift()!;
    const kids = mgr.level === 0 ? DEPTS.length : 2 + Math.floor(rnd() * 5);
    for (let k = 0; k < kids && people.length < n; k++) {
      const level = mgr.level + 1;
      const dept = mgr.level === 0 ? DEPTS[k % DEPTS.length] : mgr.dept;
      // Below the VPs a good share of people are individual contributors with no
      // reports, so branches end at different depths instead of one huge bottom row.
      const isManager = level <= 1 || rnd() < 0.55;
      const p: Person = {
        id: `p${people.length}`,
        name: `${pick(FIRST)} ${pick(LAST)}`,
        title: isManager ? TITLES[Math.min(level, 5)] : rnd() < 0.4 ? 'Senior IC' : 'IC',
        dept,
        level,
        managerId: mgr.id,
        dottedManagerId: null,
      };
      people.push(p);
      if (isManager) queue.push(p);
    }
  }

  // ~3% of people below the VPs also report (dotted line) to a manager one or two
  // levels up in a different department.
  const hasReports = new Set(people.map((p) => p.managerId));
  const managersByLevel = new Map<number, Person[]>();
  for (const p of people) {
    if (!hasReports.has(p.id) || p.level === 0) continue;
    if (!managersByLevel.has(p.level)) managersByLevel.set(p.level, []);
    managersByLevel.get(p.level)!.push(p);
  }
  for (const p of people) {
    if (p.level < 2 || rnd() >= 0.03) continue;
    const pool = [...(managersByLevel.get(p.level - 1) ?? []), ...(managersByLevel.get(p.level - 2) ?? [])].filter(
      (m) => m.dept !== p.dept,
    );
    if (pool.length) p.dottedManagerId = pick(pool).id;
  }
  return people;
}

export const DEPT_COLORS: Record<string, string> = {
  Executive: '#1f3a5f', Engineering: '#2f6fed', Sales: '#e07b39', Marketing: '#c94f9b',
  Finance: '#2a9d8f', People: '#8a5cf6', Operations: '#6b7280', Product: '#f2b134', Support: '#3fa34d',
};
