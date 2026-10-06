import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export interface PaginationProps {
  currentPage: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange?: (itemsPerPage: number) => void;
  itemsPerPageOptions?: number[];
  itemLabel?: string;
  hasMoreOnServer?: boolean;
  onLoadMoreServer?: () => void;
  isLoadingMoreServer?: boolean;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  itemsPerPageOptions = [25, 50, 100, 200],
  itemLabel = 'records',
  hasMoreOnServer = false,
  onLoadMoreServer,
  isLoadingMoreServer = false,
}) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const validPage = Math.min(Math.max(1, currentPage), totalPages);

  const startItem = totalItems === 0 ? 0 : (validPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(validPage * itemsPerPage, totalItems);

  // Generate page numbers with ellipsis
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (validPage > 3) pages.push('...');

      const start = Math.max(2, validPage - 1);
      const end = Math.min(totalPages - 1, validPage + 1);

      for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) pages.push(i);
      }

      if (validPage < totalPages - 2) pages.push('...');
      if (!pages.includes(totalPages)) pages.push(totalPages);
    }

    return pages;
  };

  const pages = getPageNumbers();

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4 px-2 select-none">
      {/* Left side: Range information */}
      <div className="flex items-center space-x-3 text-xs sm:text-sm text-gray-500 font-medium">
        <span>
          Showing <strong className="text-gray-900 font-bold">{startItem}</strong> to{' '}
          <strong className="text-gray-900 font-bold">{endItem}</strong> of{' '}
          <strong className="text-gray-900 font-bold">{totalItems.toLocaleString()}</strong> {itemLabel}
        </span>
      </div>

      {/* Right side: Page navigation & per-page selector */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-4">
        {onItemsPerPageChange && (
          <div className="flex items-center space-x-2 text-xs text-gray-500">
            <span>Per page:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                onItemsPerPageChange(Number(e.target.value));
                onPageChange(1);
              }}
              className="px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 focus:outline-none focus:ring-1 focus:ring-be-orange focus:border-be-orange shadow-sm cursor-pointer"
            >
              {itemsPerPageOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center space-x-1">
          {/* First Page */}
          <button
            onClick={() => onPageChange(1)}
            disabled={validPage === 1}
            className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
            title="First Page"
          >
            <ChevronsLeft size={14} />
          </button>

          {/* Previous Page */}
          <button
            onClick={() => onPageChange(Math.max(1, validPage - 1))}
            disabled={validPage === 1}
            className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
            title="Previous Page"
          >
            <ChevronLeft size={14} />
          </button>

          {/* Page numbers */}
          <div className="flex items-center space-x-1 px-1">
            {pages.map((p, idx) =>
              p === '...' ? (
                <span key={`ellipsis-${idx}`} className="px-1.5 text-xs text-gray-400 font-semibold">
                  ...
                </span>
              ) : (
                <button
                  key={`page-${p}`}
                  onClick={() => onPageChange(Number(p))}
                  className={`min-w-[28px] h-7 px-2 rounded-lg text-xs font-bold transition-all ${
                    validPage === p
                      ? 'bg-be-orange text-white shadow-sm shadow-orange-500/20'
                      : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {p}
                </button>
              )
            )}
          </div>

          {/* Next Page */}
          <button
            onClick={() => onPageChange(Math.min(totalPages, validPage + 1))}
            disabled={validPage === totalPages}
            className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
            title="Next Page"
          >
            <ChevronRight size={14} />
          </button>

          {/* Last Page */}
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={validPage === totalPages}
            className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
            title="Last Page"
          >
            <ChevronsRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
