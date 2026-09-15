import type { DependencyReport } from "./report.js";

const HEADER = ["package", "declared", "installed", "latest", "jump", "files", "score", "band"];
const MIN_TERMINAL_WIDTH = 80;

function displayLatest(dep: DependencyReport): string {
  return dep.latest ?? "unknown";
}

function displayJump(dep: DependencyReport): string {
  return dep.unused ? "unused" : dep.jump;
}

function row(dep: DependencyReport): string[] {
  return [
    dep.name,
    dep.declared,
    dep.installed,
    displayLatest(dep),
    displayJump(dep),
    String(dep.files.length),
    String(dep.score),
    dep.band,
  ];
}

/**
 * Renders the ranked table for terminal output — already sorted by score
 * descending in `report.ts`. Plain text only: no ANSI colour, no colour
 * dependency. Pads columns to content width, bounded by the terminal width
 * when known (falls back to a sane minimum for a non-TTY pipe).
 */
export function formatTable(dependencies: DependencyReport[], terminalWidth?: number): string {
  if (dependencies.length === 0) {
    return `${HEADER.join("  ")}\n(no dependencies declared)`;
  }

  const rows = dependencies.map(row);
  const widths = HEADER.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]?.length ?? 0)));

  const maxWidth = terminalWidth && terminalWidth > 0 ? terminalWidth : MIN_TERMINAL_WIDTH;
  // If the natural table is wider than the terminal, shrink the package
  // column first — it's the one most likely to be long and least likely to
  // need full precision to be useful.
  const naturalWidth = widths.reduce((a, b) => a + b, 0) + (widths.length - 1) * 2;
  if (naturalWidth > maxWidth && widths[0] !== undefined) {
    const overflow = naturalWidth - maxWidth;
    widths[0] = Math.max(12, widths[0] - overflow);
  }

  function fmt(cols: string[]): string {
    return cols
      .map((c, i) => {
        const w = widths[i] ?? 0;
        const truncated = c.length > w ? `${c.slice(0, Math.max(0, w - 1))}…` : c;
        return truncated.padEnd(w);
      })
      .join("  ");
  }

  return [fmt(HEADER), ...rows.map(fmt)].join("\n");
}
