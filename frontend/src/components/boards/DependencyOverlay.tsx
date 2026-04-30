import React, { useEffect, useState } from 'react';
import type { TimeRangeDependency } from '../../types';
import { useDependency } from '../../contexts/DependencyContext';

// ---------------------------------------------------------------------------
// The SVG uses position:fixed so it sits at the viewport level, completely
// outside any overflow:auto/hidden ancestor. All coordinates are raw viewport
// coordinates from getBoundingClientRect() — no scroll offset arithmetic.
// ---------------------------------------------------------------------------

const MARKER_ID = 'dep-arrow';
const MARKER_INVALID_ID = 'dep-arrow-invalid';

const Defs: React.FC = () => (
  <defs>
    {/* refX=8 places the tip exactly at the path endpoint */}
    <marker id={MARKER_ID} markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#6366f1" />
    </marker>
    <marker id={MARKER_INVALID_ID} markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#ef4444" />
    </marker>
  </defs>
);

// Cubic-bezier arc that bows perpendicular to the line direction so the
// arrowhead always tracks toward the target regardless of angle.
// C1 creates the visible bow; C2 sits near P3 on the direct line so the
// end tangent (and thus the marker) points from source toward target.
const arcPath = (x1: number, y1: number, x2: number, y2: number): string => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
  const bow = Math.min(len * 0.15, 25);
  // Perpendicular-left of travel direction
  const c1x = (x1 + x2) / 2 + (dy / len) * bow;
  const c1y = (y1 + y2) / 2 - (dx / len) * bow;
  // C2 close to P3 on the straight line → end tangent ≈ P0→P3
  const c2x = x2 - dx * 0.15;
  const c2y = y2 - dy * 0.15;
  return `M ${x1} ${y1} C ${c1x} ${c1y} ${c2x} ${c2y} ${x2} ${y2}`;
};

// Blue dot (outgoing) is w-3 h-3 at right-1 top-1/2 -translate-y-1/2:
//   center-x  = cellRect.right  - 4 (right-1) - 6 (half of w-3) = right - 10
//   center-y  = cellRect center (vertically)
//   top       = center-y - 6
const blueDotCoords = (r: DOMRect) => ({
  x: r.right - 10,
  y: (r.top + r.bottom) / 2 - 6,
});

// Orange dot (incoming) is w-3 h-3 at left-1 top-1/2 -translate-y-1/2:
//   center-x  = cellRect.left + 4 + 6 = left + 10
//   bottom    = center-y + 6
const orangeDotCoords = (r: DOMRect) => ({
  x: r.left + 10,
  y: (r.top + r.bottom) / 2 + 6,
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

  // Always recalculate — not gated on isHighlighted so the invisible hit-area
  // stays in place and mouse-enter fires correctly, preventing flicker.
  useEffect(() => {
    const recalc = () => {
      const srcRect = getCellRect({ itemId: dep.sourceItemId, columnId: dep.sourceColumnId });
      const tgtRect = getCellRect({ itemId: dep.targetItemId, columnId: dep.targetColumnId });
      if (!srcRect || !tgtRect) { setCoords(null); return; }
      const src = blueDotCoords(srcRect);
      const tgt = orangeDotCoords(tgtRect);
      setCoords({ x1: src.x, y1: src.y, x2: tgt.x, y2: tgt.y });
    };

    recalc();
    containerEl.addEventListener('scroll', recalc);
    window.addEventListener('resize', recalc);
    return () => {
      containerEl.removeEventListener('scroll', recalc);
      window.removeEventListener('resize', recalc);
    };
  }, [dep, getCellRect, containerEl]);

  if (!coords) return null;

  const visible = isHighlighted || showRemove;
  const d = arcPath(coords.x1, coords.y1, coords.x2, coords.y2);

  return (
    <g
      onMouseEnter={() => setShowRemove(true)}
      onMouseLeave={() => setShowRemove(false)}
      style={{ cursor: 'default' }}
    >
      {/* Wide hit area — always present so hover works even when line is invisible */}
      <path
        d={d}
        stroke="rgba(0,0,0,0.01)"
        strokeWidth={12}
        fill="none"
        style={{ pointerEvents: 'stroke' } as React.CSSProperties}
      />
      {visible && (
        <path
          d={d}
          stroke="#6366f1"
          strokeWidth={showRemove ? 2.5 : 1.5}
          strokeOpacity={showRemove ? 1 : 0.7}
          fill="none"
          markerEnd={`url(#${MARKER_ID})`}
          style={{ pointerEvents: 'none' }}
        />
      )}
      {/* Remove button lives on the blue dot in TimeRangeCell; clicking the
          arrow line itself also triggers removal via the context menu. */}
      {showRemove && (
        <g
          transform={`translate(${coords.x1 - 9}, ${coords.y1 - 9})`}
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{ cursor: 'pointer' }}
          aria-label="Remove dependency"
          role="button"
        >
          {/* Invisible hit circle for easy clicking */}
          <circle cx="9" cy="9" r="9" fill="transparent" />
        </g>
      )}
    </g>
  );
};

// ---------------------------------------------------------------------------
// Live draw-mode line — mouse coords are also viewport (clientX/Y)
// ---------------------------------------------------------------------------

const LiveLine: React.FC<{ containerEl: HTMLDivElement }> = ({ containerEl }) => {
  const { drawState, getCellRect } = useDependency();
  const [srcX, setSrcX] = useState(0);
  const [srcY, setSrcY] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!drawState) { setReady(false); return; }

    const recalc = () => {
      const srcRect = getCellRect(drawState.source);
      if (!srcRect) { setReady(false); return; }
      const src = blueDotCoords(srcRect);
      setSrcX(src.x);
      setSrcY(src.y);
      setReady(true);
    };

    recalc();
    containerEl.addEventListener('scroll', recalc);
    return () => containerEl.removeEventListener('scroll', recalc);
  }, [drawState, getCellRect, containerEl]);

  if (!drawState || !ready) return null;

  const isValid = drawState.hoveredTarget !== null;
  const isInvalid = (drawState.mouseX !== 0 || drawState.mouseY !== 0) && !isValid;

  let x2 = drawState.mouseX;
  let y2 = drawState.mouseY;

  if (isValid && drawState.hoveredTarget) {
    const tgtRect = getCellRect(drawState.hoveredTarget);
    if (tgtRect) {
      const tgt = orangeDotCoords(tgtRect);
      x2 = tgt.x;
      y2 = tgt.y;
    }
  }

  const d = arcPath(srcX, srcY, x2, y2);

  return (
    <path
      d={d}
      stroke={isInvalid ? '#ef4444' : '#6366f1'}
      strokeWidth={2}
      strokeDasharray={isValid ? 'none' : '6 3'}
      fill="none"
      markerEnd={`url(#${isInvalid ? MARKER_INVALID_ID : MARKER_ID})`}
      style={{ pointerEvents: 'none' }}
    />
  );
};

// ---------------------------------------------------------------------------
// Main overlay — fixed to viewport, no clipping issues
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
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
      aria-hidden="true"
    >
      <Defs />
      {allDeps.map((dep) => {
        const isHighlighted =
          (hoveredCell?.itemId === dep.sourceItemId && hoveredCell?.columnId === dep.sourceColumnId) ||
          (hoveredCell?.itemId === dep.targetItemId && hoveredCell?.columnId === dep.targetColumnId);
        return (
          // pointerEvents: auto overrides the svg's inherited none so the hit-area works
          <g key={dep.id} style={{ pointerEvents: 'auto' }}>
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
