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
      <Handle type="target" id="top" position={Position.Top} className="handle" />
      <Handle type="target" id="left" position={Position.Left} className="handle" />
      <div className="person-text">
        <div className="person-name">{data.name}</div>
        <div className="person-title">{data.title} · {data.dept}</div>
      </div>
      <div className="person-block" style={{ background: DEPT_COLORS[data.dept] ?? '#999' }} />
      <Handle type="source" id="bottom" position={Position.Bottom} className="handle" />
      {/* Lines a hanging team's left rail up with the indent of the rows below. */}
      <Handle type="source" id="rail" position={Position.Bottom} className="handle" style={{ left: 12 }} />
    </div>
  );
}

export const PersonNode = memo(PersonNodeImpl);
