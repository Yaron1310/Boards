import React, { useId } from 'react';

interface WidgetCardProps {
  title: string;
  subtitle?: string;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  children?: React.ReactNode;
  className?: string;
}

const WidgetCard: React.FC<WidgetCardProps> = ({
  title,
  subtitle,
  isLoading = false,
  isEmpty = false,
  emptyMessage = 'No data yet',
  children,
  className = '',
}) => {
  const titleId = useId();

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      className={`bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-3 ${className}`}
    >
      <div>
        <h2
          id={titleId}
          className="text-sm font-semibold text-gray-700 uppercase tracking-wide"
        >
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
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
