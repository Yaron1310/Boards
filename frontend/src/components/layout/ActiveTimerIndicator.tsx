import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiExternalLink, FiSquare } from 'react-icons/fi';
import { useActiveTimer, useTimerElapsedSeconds } from '../../hooks/useActiveTimer';
import { formatTimerClock } from '../../utils/hoursLog';

/**
 * Pill at the top of the sidebar while the user's Hours Log timer runs — so it can be found and
 * stopped without hunting for the board and row it was started on. The name links back to where it
 * was started. Hidden while the floating timer window is open (that shows the same thing); where
 * the browser supports it, a pop-out button opens that window.
 */
const ActiveTimerIndicator: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { timer, serverOffsetMs, requestStop, pipSupported, pipOpen, openPip } = useActiveTimer();
  const elapsed = useTimerElapsedSeconds(timer, serverOffsetMs);
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);

  if (!timer || pipOpen) return null;
  const clock = formatTimerClock(elapsed);
  const name = timer.itemName || 'Untitled item';

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label="Running timer"
      className={`relative z-10 flex items-center bg-white border border-gray-200 shadow-lg ${compact ? 'flex-col gap-1 mx-2 mt-3 rounded-2xl p-1.5' : 'gap-2 mx-3 mt-3 rounded-full ps-3 pe-1.5 py-1.5'}`}
    >
      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" aria-hidden="true" />
      {!compact && <button
        type="button"
        onClick={() => navigate(timer.kind === 'personal' ? '/personal-hub' : `/boards/${timer.boardId}`)}
        className="text-xs text-gray-600 hover:text-indigo-600 hover:underline truncate flex-1 min-w-0 text-start"
        title={name}
        aria-label={`Go to ${name}`}
      >
        {name}
      </button>}
      <span role="timer" aria-label={`Elapsed ${clock}`} className={`font-semibold text-gray-800 tabular-nums ${compact ? 'text-[10px]' : 'text-sm'}`}>
        {clock}
      </span>
      {pipSupported && (
        <button
          type="button"
          onClick={openPip}
          className="p-1.5 rounded-full text-gray-500 hover:bg-gray-100 transition-colors"
          title="Pop out the timer into a floating window"
          aria-label="Pop out the timer into a floating window"
        >
          <FiExternalLink size={12} aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        onClick={() => requestStop({ anchorEl: rootRef.current })}
        className="p-1.5 rounded-full text-red-600 hover:bg-red-50 transition-colors"
        title="Stop timer"
        aria-label={`Stop timer on ${name}, elapsed ${clock}`}
      >
        <FiSquare size={12} fill="currentColor" aria-hidden="true" />
      </button>
    </div>
  );
};

export default ActiveTimerIndicator;
