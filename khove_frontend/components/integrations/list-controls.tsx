"use client";

import { useState } from "react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

/** Client-side search + pagination over an already-fetched list. */
export function usePagedList<T>(items: T[], searchText: (i: T) => string, pageSize = 25) {
  const [term, setTermRaw] = useState("");
  const [page, setPage] = useState(0);
  const q = term.trim().toLowerCase();
  const filtered = q ? items.filter((i) => searchText(i).toLowerCase().includes(q)) : items;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const clamped = Math.min(page, pageCount - 1);
  const paged = filtered.slice(clamped * pageSize, clamped * pageSize + pageSize);
  const setTerm = (t: string) => {
    setTermRaw(t);
    setPage(0);
  };
  return { term, setTerm, page: clamped, setPage, pageCount, total: filtered.length, paged };
}

export function SearchBar({
  value,
  onChange,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex min-w-[180px] items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5">
      <Search size={13} className="text-white/35" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent py-1.5 text-[12.5px] text-white placeholder:text-white/30 focus:outline-none"
      />
    </div>
  );
}

export function Pager({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (p: number) => void }) {
  if (pageCount <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-end gap-3 text-[12px] text-white/50">
      <button
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] hover:bg-white/[0.05] disabled:opacity-30"
      >
        <ChevronLeft size={14} />
      </button>
      <span className="tabular-nums">
        Page {page + 1} of {pageCount}
      </span>
      <button
        disabled={page >= pageCount - 1}
        onClick={() => onPage(page + 1)}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] hover:bg-white/[0.05] disabled:opacity-30"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}
