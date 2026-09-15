import type { PackageUsage } from "./usageMap.js";
import type { SemverJump } from "./semver.js";

export type Band = "ok" | "review" | "urgent";

export interface ScoreBreakdown {
  jump: number;
  files: number;
  symbols: number;
  namespace: number;
  deprecated: number;
  typeOnlyMultiplier: number;
  devOnlyMultiplier: number;
  raw: number;
}

export interface ScoreResult {
  score: number;
  band: Band;
  /** Declared but never imported — upgrade is free. Flagged, not scored. */
  unused: boolean;
  breakdown: ScoreBreakdown;
}

export interface ScoreInput {
  jump: SemverJump;
  deprecated: boolean;
  /** Whether the dependency is declared in `package.json` at all. */
  declared: boolean;
  /** Usage-map entry, if the package is imported anywhere. */
  usage: PackageUsage | undefined;
}

// See docs/scoring.md for the rationale behind every weight and threshold
// below — this table is the source of truth, docs/scoring.md is prose
// around it. Keep them in sync.
const JUMP_WEIGHT: Record<SemverJump, number> = {
  major: 40,
  minor: 15,
  patch: 5,
  prerelease: 10,
  unsupported: 0,
  unknown: 0,
};

const FILES_WEIGHT_PER_FILE = 3;
const FILES_WEIGHT_CAP = 20;
const SYMBOLS_WEIGHT_PER_SYMBOL = 2;
const SYMBOLS_WEIGHT_CAP = 15;
const NAMESPACE_WEIGHT = 10;
const DEPRECATED_WEIGHT = 30;
const TYPE_ONLY_MULTIPLIER = 0.3;
const DEV_ONLY_MULTIPLIER = 0.5;
const URGENT_THRESHOLD = 50;
const REVIEW_THRESHOLD = 20;

const ZERO_BREAKDOWN: ScoreBreakdown = {
  jump: 0,
  files: 0,
  symbols: 0,
  namespace: 0,
  deprecated: 0,
  typeOnlyMultiplier: 1,
  devOnlyMultiplier: 1,
  raw: 0,
};

function bandFor(score: number): Band {
  if (score >= URGENT_THRESHOLD) return "urgent";
  if (score >= REVIEW_THRESHOLD) return "review";
  return "ok";
}

/**
 * Scores how much it would hurt to upgrade one dependency, combining
 * registry data (semver jump, deprecation) with day 2's usage map (files,
 * symbols, import shape). Weights and thresholds are documented in
 * `docs/scoring.md` — this function must not be tuned to make any one
 * repo's output look good; pin behaviour with fixtures instead.
 */
export function scoreDependency(input: ScoreInput): ScoreResult {
  const isUnused = input.declared && (!input.usage || input.usage.files.length === 0);
  if (isUnused) {
    return { score: 0, band: "ok", unused: true, breakdown: ZERO_BREAKDOWN };
  }

  const usage = input.usage;
  const jump = JUMP_WEIGHT[input.jump];
  const files = usage ? Math.min(usage.files.length * FILES_WEIGHT_PER_FILE, FILES_WEIGHT_CAP) : 0;
  const symbols = usage ? Math.min(usage.symbols.length * SYMBOLS_WEIGHT_PER_SYMBOL, SYMBOLS_WEIGHT_CAP) : 0;
  const namespace = usage?.namespaceImport ? NAMESPACE_WEIGHT : 0;
  const deprecated = input.deprecated ? DEPRECATED_WEIGHT : 0;

  const raw = jump + files + symbols + namespace + deprecated;

  const typeOnlyMultiplier = usage?.typeOnly ? TYPE_ONLY_MULTIPLIER : 1;
  const devOnlyMultiplier = usage?.devOnly ? DEV_ONLY_MULTIPLIER : 1;

  const score = Math.round(raw * typeOnlyMultiplier * devOnlyMultiplier);

  return {
    score,
    band: bandFor(score),
    unused: false,
    breakdown: { jump, files, symbols, namespace, deprecated, typeOnlyMultiplier, devOnlyMultiplier, raw },
  };
}
