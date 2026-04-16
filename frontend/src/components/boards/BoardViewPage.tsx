import React from 'react';
import { useParams } from 'react-router-dom';
import { useBoard } from '../../hooks/queries/useBoardQueries';
import { FiLoader } from 'react-icons/fi';

const BoardViewPage: React.FC = () => {
  const { boardId } = useParams<{ boardId: string }>();
  const { data: board, isLoading, error } = useBoard(boardId ?? '', !!boardId);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64" role="status" aria-label="Loading board">
        <FiLoader className="animate-spin h-8 w-8 text-indigo-600" aria-hidden="true" />
      </div>
    );
  }

  if (error || !board) {
    return (
      <div className="p-6" role="alert">
        <p className="text-red-600">Failed to load board.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-gray-200 bg-white">
        <h1 className="text-xl font-bold text-gray-800" aria-label={`Board: ${board.name}`}>
          {board.name}
        </h1>
        {board.description && (
          <p className="text-sm text-gray-500 mt-1">{board.description}</p>
        )}
      </div>
      <div className="flex-1 overflow-auto p-6">
        <p className="text-gray-400 text-sm">
          Groups and items will be rendered here in Phase 7B/7C.
        </p>
      </div>
    </div>
  );
};

export default BoardViewPage;
