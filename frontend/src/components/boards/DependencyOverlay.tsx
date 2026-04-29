import React, { useEffect, useRef, useState } from 'react';
import type { TimeRangeDependency } from '../../types';
import { useDependency } from '../../contexts/DependencyContext';

// ---------------------------------------------------------------------------
// Arrowhead marker definitions (reusable SVG defs)
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
  containerEl: HTMLDivElement | null;
}

const DepLine: React.FC<DepLineProps> = ({ dep, isHighlighted, onRemove, containerEl }) => {
  const { getCellRect } = useDependency();
  const [coords, setCoords] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [showRemove, setShowRemove] = useState(false);

  useEffect(() => {
    if (!isHighlighted && !showRemove) { setCoords(null); return; }

    const recalc = () => {
      if (!containerEl) return;
      const containerRect = containerEl.getBoundingClientRect();
      const srcRect = getCellRect({ itemId: dep.sourceItemId, columnId: dep.sourceColumnId });
      const tgtRect = getCellRect({ itemId: dep.targetItemId, columnId: dep.targetColumnId });
      if (!srcRect || !tgtRect) { setCoords(null); return; }

      const scrollLeft = containerEl.scrollLeft;
      const scrollTop = containerEl.scrollTop;

      setCoords({
        x1: srcRect.right - containerRect.left + scrollLeft,
        y1: (srcRect.top + srcRect.bottom) / 2 - containerRect.top + scrollTop,
        x2: tgtRect.left - containerRect.left + scrollLeft,
        y2: (tgtRect.top + tgtRect.bottom) / 2 - containerRect.top + scrollTop,
      });
    };

    recalc();
    containerEl?.addEventListener('scroll', recalc);
    window.addEventListener('resize', recalc);
    return () => {
      containerEl?.removeEventListener('scroll', recalc);
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
      {/* Wider invisible hit area */}
      <line
        x1={coords.x1}
        y1={coords.y1}
        x2={coords.x2}
        y2={coords.y2}
        stroke="transparent"
        strokeWidth={12}
      />
      <line
        x1={coords.x1}
        y1={coords.y1}
        x2={coords.x2}
        y2={coords.y2}
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
// Live draw-mode line (follows the mouse)
// ---------------------------------------------------------------------------

interface LiveLineProps {
  containerEl: HTMLDivElement | null;
}

const LiveLine: React.FC<LiveLineProps> = ({ containerEl }) => {
  const { drawState, getCellRect } = useDependency();
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!drawState || !containerEl) { setStart(null); return; }

    const containerRect = containerEl.getBoundingClientRect();
    const srcRect = getCellRect(drawState.source);
    if (!srcRect) { setStart(null); return; }

    setStart({
      x: srcRect.right - containerRect.left + containerEl.scrollLeft,
      y: (srcRect.top + srcRect.bottom) / 2 - containerRect.top + containerEl.scrollTop,
    });
  }, [drawState, getCellRect, containerEl]);

  if (!drawState || !start) return null;

  const isValid = drawState.hoveredTarget !== null;
  const isInvalid =
    drawState.mouseX !== 0 &&
    drawState.mouseY !== 0 &&
    !isValid &&
    drawState.hoveredTarget === null;

  let x2 = drawState.mouseX;
  let y2 = drawState.mouseY;

  // If hovering a valid target snap to its center-left
  if (drawState.hoveredTarget && containerEl) {
    const containerRect = containerEl.getBoundingClientRect();
    const tgtRect = getCellRect(drawState.hoveredTarget);
    if (tgtRect) {
      x2 = tgtRect.left - containerRect.left + containerEl.scrollLeft;
      y2 = (tgtRect.top + tgtRect.bottom) / 2 - containerRect.top + containerEl.scrollTop;
    }
  }

  const color = isInvalid ? '#ef4444' : isValid ? '#6366f1' : '#6366f1';
  const markerId = isInvalid ? MARKER_INVALID_ID : MARKER_ID;

  return (
    <line
      x1={start.x}
      y1={start.y}
      x2={x2}
      y2={y2}
      stroke={color}
      strokeWidth={2}
      strokeDasharray={isValid ? 'none' : '6 3'}
      markerEnd={`url(#${markerId})`}
      style={{ pointerEvents: 'none' }}
    />
  );
};

// ---------------------------------------------------------------------------
// Main overlay
// ---------------------------------------------------------------------------

interface Props {
  onRemoveDep: (dep: TimeRangeDependency) => void;
}

const DependencyOverlay: React.FC<Props> = ({ onRemoveDep }) => {
  const { allDeps, hoveredCell, drawState, boardContainerRef } = useDependency();

  // We need to know scrollable container dimensions to size the SVG
  const [size, setSize] = useState({ w: 0, h: 0 });
  const resizeRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    const el = boardContainerRef.current;
    if (!el) return;

    const update = () =>
      setSize({ w: el.scrollWidth, h: el.scrollHeight });

    update();
    resizeRef.current = new ResizeObserver(update);
    resizeRef.current.observe(el);
    el.addEventListener('scroll', update);

    return () => {
      resizeRef.current?.disconnect();
      el.removeEventListener('scroll', update);
    };
  }, [boardContainerRef]);

  const containerEl = boardContainerRef.current;

  if (!containerEl || (allDeps.length === 0 && !drawState)) return null;

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: size.w,
        height: size.h,
        pointerEvents: 'none',
        zIndex: 15,
        overflow: 'visible',
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
