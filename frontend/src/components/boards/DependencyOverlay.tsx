import React, { useEffect, useState } from 'react';
import type { TimeRangeDependency } from '../../types';
import { useDependency } from '../../contexts/DependencyContext';

// ---------------------------------------------------------------------------
// Arrowhead marker definitions
// ---------------------------------------------------------------------------

const MARKER_ID = 'dep-arrow';
const MARKER_INVALID_ID = 'dep-arrow-invalid';

const Defs: React.FC = () => (
  <defs>
    <marker id={MARKER_ID} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#6366f1" />
    </marker>
    <marker id={MARKER_INVALID_ID} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#ef4444" />
    </marker>
  </defs>
);

// ---------------------------------------------------------------------------
// Coord helper — converts a cell's viewport rect to SVG (scroll-content) coords
// The SVG is absolute at top:0 left:0 inside the scroll container, so:
//   svgX = cellRect.x - containerRect.x + scrollLeft
//   svgY = cellRect.y - containerRect.y + scrollTop
// ---------------------------------------------------------------------------

const toSvgCoords = (
  cellRect: DOMRect,
  containerRect: DOMRect,
  containerEl: HTMLDivElement,
) => ({
  x: cellRect.x - containerRect.x + containerEl.scrollLeft,
  y: cellRect.y - containerRect.y + containerEl.scrollTop,
  w: cellRect.width,
  h: cellRect.height,
});

// ---------------------------------------------------------------------------
// Single saved dependency line
// ---------------------------------------------------------------------------

interface DepLineProps {
  dep: TimeRangeDependency;
  isHighlighted: boolean;
  onRemove: () => void;
  containerEl: HTMLDivElement;
}

const DepLine: React.FC<DepLineProps> = ({ dep, isHighlighted, onRemove, containerEl }) => {
  const { getCellRect } = useDependency();
  const [coords, setCoords] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [showRemove, setShowRemove] = useState(false);

  useEffect(() => {
    if (!isHighlighted && !showRemove) { setCoords(null); return; }

    const recalc = () => {
      const containerRect = containerEl.getBoundingClientRect();
      const srcRect = getCellRect({ itemId: dep.sourceItemId, columnId: dep.sourceColumnId });
      const tgtRect = getCellRect({ itemId: dep.targetItemId, columnId: dep.targetColumnId });
      if (!srcRect || !tgtRect) { setCoords(null); return; }

      const src = toSvgCoords(srcRect, containerRect, containerEl);
      const tgt = toSvgCoords(tgtRect, containerRect, containerEl);

      setCoords({
        x1: src.x + src.w,            // right edge of source cell
        y1: src.y + src.h / 2,        // vertical centre
        x2: tgt.x,                     // left edge of target cell
        y2: tgt.y + tgt.h / 2,
      });
    };

    recalc();
    containerEl.addEventListener('scroll', recalc);
    window.addEventListener('resize', recalc);
    return () => {
      containerEl.removeEventListener('scroll', recalc);
      window.removeEventListener('resize', recalc);
    };
  }, [isHighlighted, showRemove, dep, getCellRect, containerEl]);

  if (!coords) return null;

  const midX = (coords.x1 + coords.x2) / 2;
  const midY = (coords.y1 + coords.y2) / 2;

  return (
    <g
      onMouseEnter={() => setShowRemove(true)}
      onMouseLeave={() => setShowRemove(false)}
      style={{ cursor: 'default' }}
    >
      {/* Wide invisible hit area */}
      <line x1={coords.x1} y1={coords.y1} x2={coords.x2} y2={coords.y2} stroke="transparent" strokeWidth={12} />
      <line
        x1={coords.x1} y1={coords.y1} x2={coords.x2} y2={coords.y2}
        stroke="#6366f1"
        strokeWidth={showRemove ? 2.5 : 1.5}
        strokeOpacity={showRemove ? 1 : 0.7}
        markerEnd={`url(#${MARKER_ID})`}
      />
      {showRemove && (
        <g
          transform={`translate(${midX - 9}, ${midY - 9})`}
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{ cursor: 'pointer' }}
          aria-label="Remove dependency"
          role="button"
        >
          <circle cx="9" cy="9" r="9" fill="white" stroke="#ef4444" strokeWidth="1.5" />
          <line x1="5" y1="5" x2="13" y2="13" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
          <line x1="13" y1="5" x2="5" y2="13" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
        </g>
      )}
    </g>
  );
};

// ---------------------------------------------------------------------------
// Live draw-mode line
// ---------------------------------------------------------------------------

interface LiveLineProps {
  containerEl: HTMLDivElement;
}

const LiveLine: React.FC<LiveLineProps> = ({ containerEl }) => {
  const { drawState, getCellRect } = useDependency();
  const [srcCoords, setSrcCoords] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!drawState) { setSrcCoords(null); return; }

    const containerRect = containerEl.getBoundingClientRect();
    const srcRect = getCellRect(drawState.source);
    if (!srcRect) { setSrcCoords(null); return; }

    const src = toSvgCoords(srcRect, containerRect, containerEl);
    setSrcCoords({ x: src.x + src.w, y: src.y + src.h / 2 });
  }, [drawState, getCellRect, containerEl]);

  if (!drawState || !srcCoords) return null;

  const isValid = drawState.hoveredTarget !== null;
  const isInvalid = (drawState.mouseX !== 0 || drawState.mouseY !== 0) && !isValid;

  // Snap to target centre-left when hovering a valid cell
  let x2 = drawState.mouseX;
  let y2 = drawState.mouseY;
  if (isValid && drawState.hoveredTarget) {
    const containerRect = containerEl.getBoundingClientRect();
    const tgtRect = getCellRect(drawState.hoveredTarget);
    if (tgtRect) {
      const tgt = toSvgCoords(tgtRect, containerRect, containerEl);
      x2 = tgt.x;
      y2 = tgt.y + tgt.h / 2;
    }
  }

  return (
    <line
      x1={srcCoords.x} y1={srcCoords.y} x2={x2} y2={y2}
      stroke={isInvalid ? '#ef4444' : '#6366f1'}
      strokeWidth={2}
      strokeDasharray={isValid ? 'none' : '6 3'}
      markerEnd={`url(#${isInvalid ? MARKER_INVALID_ID : MARKER_ID})`}
      style={{ pointerEvents: 'none' }}
    />
  );
};

// ---------------------------------------------------------------------------
// Main overlay — zero-size SVG with overflow:visible so it takes no layout
// space but can draw lines anywhere in the scroll container
// ---------------------------------------------------------------------------

interface Props {
  onRemoveDep: (dep: TimeRangeDependency) => void;
}

const DependencyOverlay: React.FC<Props> = ({ onRemoveDep }) => {
  const { allDeps, hoveredCell, drawState, boardContainerRef } = useDependency();

  const containerEl = boardContainerRef.current;
  if (!containerEl || (allDeps.length === 0 && !drawState)) return null;

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        overflow: 'visible',
        pointerEvents: 'none',
        zIndex: 15,
      }}
      aria-hidden="true"
    >
      <Defs />
      {allDeps.map((dep) => {
        const isHighlighted =
          (hoveredCell?.itemId === dep.sourceItemId && hoveredCell?.columnId === dep.sourceColumnId) ||
          (hoveredCell?.itemId === dep.targetItemId && hoveredCell?.columnId === dep.targetColumnId);
        return (
          <g key={dep.id} style={{ pointerEvents: isHighlighted ? 'auto' : 'none' }}>
            <DepLine
              dep={dep}
              isHighlighted={isHighlighted}
              onRemove={() => onRemoveDep(dep)}
              containerEl={containerEl}
            />
          </g>
        );
      })}
      <LiveLine containerEl={containerEl} />
    </svg>
  );
};

export default DependencyOverlay;
