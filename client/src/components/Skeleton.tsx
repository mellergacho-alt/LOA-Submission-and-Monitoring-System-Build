import type { CSSProperties } from "react";
import "./Skeleton.css";

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  radius?: string | number;
  style?: CSSProperties;
  className?: string;
}

// A single shimmering placeholder block -- the primitive every other
// Skeleton* helper below composes with. Reuses the app's own card-border/
// page-bg tokens for the shimmer tones so it fits the existing palette
// instead of introducing new colors.
export function Skeleton({ width = "100%", height = 14, radius, style, className }: SkeletonProps) {
  return (
    <div
      className={"skeleton" + (className ? ` ${className}` : "")}
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

// A skeleton replacement for a whole `<table className="data-table">` while
// its rows are loading -- keeps the real column count so nothing visually
// jumps once real data arrives (used by every account-management table and
// the Audit Log).
export function SkeletonTable({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return (
    <table className="data-table skeleton-table">
      <thead>
        <tr>
          {Array.from({ length: columns }).map((_, i) => (
            <th key={i}>
              <Skeleton height={11} width="70%" />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, r) => (
          <tr key={r}>
            {Array.from({ length: columns }).map((_, c) => (
              <td key={c}>
                <Skeleton height={13} width={c === 0 ? "85%" : "60%"} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// A skeleton replacement for the matrix-style Submission Form / Status of
// Submission grids -- a labeled first column (Class/Section or Grade Level)
// plus N fixed-size cell columns, matching .upload-cell/.status-cell's own
// rough box size rather than a plain text-row skeleton.
export function SkeletonGrid({
  columns,
  rows = 4,
  cellHeight = 48,
}: {
  columns: number;
  rows?: number;
  cellHeight?: number;
}) {
  return (
    <table className="data-table skeleton-table">
      <thead>
        <tr>
          <th>
            <Skeleton height={11} width="70%" />
          </th>
          {Array.from({ length: columns }).map((_, i) => (
            <th key={i}>
              <Skeleton height={11} width="80%" />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, r) => (
          <tr key={r}>
            <td>
              <Skeleton height={13} width="80%" />
            </td>
            {Array.from({ length: columns }).map((_, c) => (
              <td key={c}>
                <Skeleton height={cellHeight} radius={8} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// A skeleton replacement for a simple `.card` of prose/fields (a profile
// form, a single-card fetch result) -- a title-shaped bar plus N lines.
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card skeleton-card">
      <Skeleton height={16} width="40%" style={{ marginBottom: 14 }} />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={12} width={i === lines - 1 ? "60%" : "100%"} style={{ marginBottom: 10 }} />
      ))}
    </div>
  );
}
