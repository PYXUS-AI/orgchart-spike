import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { DEPT_COLORS, type Person } from '../data/generateOrg';

export type PersonNodeType = Node<Person, 'person'>;

// memo() is what keeps pan/zoom from re-rendering 2,000 of these.
// Level-of-detail is driven purely by CSS (see styles.css, [data-lod]) so a zoom
// change never touches React state in the nodes.
function PersonNodeImpl({ data }: NodeProps<PersonNodeType>) {
  return (
    <div className="person" style={{ borderLeftColor: DEPT_COLORS[data.dept] ?? '#999' }}>
      <Handle type="target" position={Position.Top} className="handle" />
      <div className="person-text">
        <div className="person-name">{data.name}</div>
        <div className="person-title">{data.title} · {data.dept}</div>
      </div>
      <div className="person-block" style={{ background: DEPT_COLORS[data.dept] ?? '#999' }} />
      <Handle type="source" position={Position.Bottom} className="handle" />
    </div>
  );
}

export const PersonNode = memo(PersonNodeImpl);
