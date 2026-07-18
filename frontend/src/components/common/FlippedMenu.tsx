import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useFlippedPosition } from '../../hooks/useFlippedPosition';

interface FlippedMenuProps {
  /** The trigger element the menu is anchored to. Menu renders nothing while null. */
  anchorEl: HTMLElement | null;
  /** Expected menu width in px, used to keep it inside the viewport horizontally. */
  width: number;
  onClose: () => void;
  className?: string;
  role?: string;
  'aria-label'?: string;
  'aria-multiselectable'?: boolean;
  children: React.ReactNode;
}

/**
 * Portals a fixed-position dropdown/menu next to `anchorEl`, flipping it to
 * open upward instead of downward when it would otherwise overflow the
 * bottom of the viewport. Handles outside-click and Escape-to-close.
 */
const FlippedMenu: React.FC<FlippedMenuProps> = ({
  anchorEl, width, onClose, className, role = 'menu', children, ...aria
}) => {
  const anchorRect = anchorEl?.getBoundingClientRect() ?? null;
  const { ref, style } = useFlippedPosition<HTMLDivElement>(anchorRect, width);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current && !ref.current.contains(target) && !(anchorEl && anchorEl.contains(target))) {
        onClose();
      }
    };
    // Delay so the same click that opened the menu doesn't immediately close it.
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handler); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, anchorEl]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!anchorEl) return null;
  const root = document.getElementById('modal-root') ?? document.body;

  return createPortal(
    <div
      ref={ref}
      role={role}
      style={{ position: 'fixed', top: style.top, left: style.left, zIndex: 9999 }}
      className={className}
      {...aria}
    >
      {children}
    </div>,
    root,
  );
};

export default FlippedMenu;
