import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiSquare } from 'react-icons/fi';
import { useActiveTimer, useTimerElapsedSeconds } from '../../hooks/useActiveTimer';
import { formatTimerClock } from '../../utils/hoursLog';

/**
 * Floating pill shown on every page while the user's Hours Log timer runs — so it can be found
 * and stopped without hunting for the board and row it was started on. The name links back to
 * where it was started.
 */
const ActiveTimerIndicator: React.FC = () => {
  const { timer, serverOffsetMs, requestStop } = useActiveTimer();
  const elapsed = useTimerElapsedSeconds(timer, serverOffsetMs);
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);

  if (!timer) return null;
  const clock = formatTimerClock(elapsed);
  const name = timer.itemName || 'Untitled item';

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label="Running timer"
      className="fixed bottom-4 end-4 z-40 flex items-center gap-2 max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-full shadow-lg ps-3 pe-1.5 py-1.5"
    >
      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" aria-hidden="true" />
      <button
        type="button"
        onClick={() => navigate(timer.kind === 'personal' ? '/personal-hub' : `/boards/${timer.boardId}`)}
        className="text-xs text-gray-600 hover:text-indigo-600 hover:underline truncate max-w-[12rem]"
        title={name}
        aria-label={`Go to ${name}`}
      >
        {name}
      </button>
      <span role="timer" aria-label={`Elapsed ${clock}`} className="text-sm font-semibold text-gray-800 tabular-nums">
        {clock}
      </span>
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
