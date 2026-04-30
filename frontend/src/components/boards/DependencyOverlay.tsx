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
    <marker id={MARKER_ID} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#6366f1" />
    </marker>
    <marker id={MARKER_INVALID_ID} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#ef4444" />
    </marker>
  </defs>
);

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
      const srcRect = getCellRect({ itemId: dep.sourceItemId, columnId: dep.sourceColumnId });
      const tgtRect = getCellRect({ itemId: dep.targetItemId, columnId: dep.targetColumnId });
      if (!srcRect || !tgtRect) { setCoords(null); return; }

      // Pure viewport coordinates — the SVG is position:fixed at 0,0
      setCoords({
        x1: srcRect.right,
        y1: (srcRect.top + srcRect.bottom) / 2,
        x2: tgtRect.left,
        y2: (tgtRect.top + tgtRect.bottom) / 2,
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
      setSrcX(srcRect.right);
      setSrcY((srcRect.top + srcRect.bottom) / 2);
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
      x2 = tgtRect.left;
      y2 = (tgtRect.top + tgtRect.bottom) / 2;
    }
  }

  return (
    <line
      x1={srcX} y1={srcY} x2={x2} y2={y2}
      stroke={isInvalid ? '#ef4444' : '#6366f1'}
      strokeWidth={2}
      strokeDasharray={isValid ? 'none' : '6 3'}
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
