import React, { useId } from 'react';

interface WidgetCardProps {
  title: string;
  titleIcon?: React.ReactNode;
  subtitle?: string;
  boardNames?: string[];
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  children?: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}

const WidgetCard: React.FC<WidgetCardProps> = ({
  title,
  titleIcon,
  subtitle,
  boardNames,
  isLoading = false,
  isEmpty = false,
  emptyMessage = 'No data yet',
  children,
  className = '',
  actions,
}) => {
  const titleId = useId();

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      className={`group bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-3 ${className}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h2
              id={titleId}
              className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex-shrink-0 flex items-center gap-1.5"
            >
              {titleIcon}{title}
            </h2>
            {subtitle && (
              <p className="text-xs text-gray-500">{subtitle}</p>
            )}
          </div>
          {boardNames && boardNames.length > 0 && (
            <p className="text-xs text-gray-400 mt-0.5" aria-label="Boards used in this widget">
              {boardNames.join(' · ')}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150" role="toolbar" aria-label="Widget actions">
            {actions}
          </div>
        )}
      </div>

      {isLoading ? (
        <div
          className="flex flex-col gap-2 animate-pulse"
          role="status"
          aria-label={`Loading ${title}`}
        >
          <div className="h-4 bg-gray-200 rounded w-3/4" />
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="h-4 bg-gray-200 rounded w-5/6" />
          <div className="h-20 bg-gray-200 rounded" />
        </div>
      ) : isEmpty ? (
        <div
          className="flex flex-col items-center justify-center py-8 text-gray-400"
          role="status"
          aria-label={emptyMessage}
        >
          <p className="text-sm">{emptyMessage}</p>
        </div>
      ) : (
        children
      )}
    </div>
  );
};

export default WidgetCard;
