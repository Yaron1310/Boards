import { useLayoutEffect, useRef, useState } from 'react';

interface FlippedPosition {
  top: number;
  left: number;
}

/**
 * Positions a fixed/portal-rendered popover relative to an anchor rect,
 * flipping it to open upward instead of downward when it wouldn't fit
 * below the viewport (and there's more room above). Call `ref` on the
 * popover's root element so its real rendered height can be measured
 * after mount — this keeps the flip correct for popovers whose height
 * varies with content (e.g. a status options list).
 */
export function useFlippedPosition<T extends HTMLElement = HTMLDivElement>(
  anchorRect: DOMRect | null,
  width: number,
  gap = 6,
  padding = 8,
): { ref: React.RefObject<T>; style: FlippedPosition } {
  const ref = useRef<T>(null);
  const [pos, setPos] = useState<FlippedPosition>(() => ({
    top: anchorRect ? anchorRect.bottom + gap : 0,
    left: anchorRect ? Math.max(padding, Math.min(anchorRect.left, window.innerWidth - width - padding)) : 0,
  }));

  useLayoutEffect(() => {
    if (!anchorRect) return;
    const left = Math.max(padding, Math.min(anchorRect.left, window.innerWidth - width - padding));
    const height = ref.current?.getBoundingClientRect().height ?? 0;
    const fitsBelow = anchorRect.bottom + gap + height <= window.innerHeight - padding;
    const top = !fitsBelow && anchorRect.top - gap - height >= padding
      ? anchorRect.top - gap - height
      : anchorRect.bottom + gap;
    setPos({ top, left });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorRect?.top, anchorRect?.bottom, anchorRect?.left, width]);

  return { ref, style: pos };
}
