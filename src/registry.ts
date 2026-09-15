import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** What we need out of the public npm registry for one package. */
export interface RegistryInfo {
  /** `dist-tags.latest`, or `null` when the lookup could not be resolved. */
  latest: string | null;
  /** True when the `latest` version itself carries a `deprecated` field. */
  deprecated: boolean;
  /** `"unknown"` covers every failure mode: DNS, timeout, 429/5xx, bad JSON, missing field. */
  status: "ok" | "unknown";
}

const UNKNOWN: RegistryInfo = { latest: null, deprecated: false, status: "unknown" };

/**
 * A single-package registry lookup, injectable exactly like `LockfileReader`
 * (day 1) — tests supply a fake here so no test in this suite ever touches
 * the network.
 */
export type RegistryFetch = (name: string) => Promise<RegistryInfo>;

const USER_AGENT = "blastradius/0.1.0 (+https://github.com/rocksolid-dev-bot/blastradius)";
const TIMEOUT_MS = 10_000;

function registryUrl(name: string): string {
  // Scoped packages (`@scope/pkg`) keep their slash — the registry treats
  // scope and name as two path segments, so each is encoded independently.
  return `https://registry.npmjs.org/${name.split("/").map(encodeURIComponent).join("/")}`;
}

interface AbbreviatedPackument {
  "dist-tags"?: { latest?: string };
  versions?: Record<string, { deprecated?: string }>;
}

/**
 * The real registry lookup. Any failure — network, timeout, non-2xx,
 * non-JSON body, missing field — degrades to `status: "unknown"` and never
 * throws. `429`/`5xx` get exactly one implicit attempt (no retry loop): the
 * caller moves on and the package is `unknown` for this run.
 */
export const fetchFromNpmRegistry: RegistryFetch = async (name) => {
  try {
    const res = await fetch(registryUrl(name), {
      headers: {
        Accept: "application/vnd.npm.install-v1+json",
        "User-Agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return UNKNOWN;

    const body = (await res.json()) as AbbreviatedPackument;
    const latest = body["dist-tags"]?.latest;
    if (!latest || typeof latest !== "string") return UNKNOWN;

    const deprecated = Boolean(body.versions?.[latest]?.deprecated);
    return { latest, deprecated, status: "ok" };
  } catch {
    return UNKNOWN;
  }
};

interface CacheEntry {
  fetchedAt: number;
  data: RegistryInfo;
}

type CacheFile = Record<string, CacheEntry>;

const TTL_MS = 24 * 60 * 60 * 1000;

/**
 * `$XDG_CACHE_HOME/blastradius` or `~/.cache/blastradius`. Overridable via
 * `BLASTRADIUS_CACHE_DIR` so tests never touch the real cache.
 */
export function defaultCacheDir(): string {
  const override = process.env.BLASTRADIUS_CACHE_DIR;
  if (override && override.length > 0) return override;
  const xdg = process.env.XDG_CACHE_HOME;
  const base = xdg && xdg.length > 0 ? xdg : join(homedir(), ".cache");
  return join(base, "blastradius");
}

function cacheFilePath(cacheDir: string): string {
  return join(cacheDir, "registry-cache.json");
}

function loadCache(cacheDir: string): CacheFile {
  try {
    const raw = readFileSync(cacheFilePath(cacheDir), "utf8");
    const parsed = JSON.parse(raw) as CacheFile;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function saveCache(cacheDir: string, cache: CacheFile): void {
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cacheFilePath(cacheDir), JSON.stringify(cache, null, 2));
}

export interface QueryRegistryOptions {
  cacheDir?: string;
  /** Max in-flight registry requests. Registry etiquette, not a suggestion. */
  concurrency?: number;
  now?: () => number;
}

/**
 * Resolves registry info for every name in `names`, cache-first. A cache
 * hit inside the 24h TTL makes zero calls into `fetcher`. Misses run
 * through a small fixed-size worker pool (default 4) — never
 * `Promise.all` over the whole list.
 */
export async function queryRegistry(
  names: string[],
  fetcher: RegistryFetch,
  options: QueryRegistryOptions = {},
): Promise<Map<string, RegistryInfo>> {
  const cacheDir = options.cacheDir ?? defaultCacheDir();
  const concurrency = Math.max(1, options.concurrency ?? 4);
  const now = options.now ?? Date.now;

  const cache = loadCache(cacheDir);
  const results = new Map<string, RegistryInfo>();
  const toFetch: string[] = [];

  for (const name of names) {
    const entry = cache[name];
    if (entry && now() - entry.fetchedAt < TTL_MS) {
      results.set(name, entry.data);
    } else {
      toFetch.push(name);
    }
  }

  let dirty = false;
  let cursor = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor++;
      const name = toFetch[i];
      if (name === undefined) return;
      let info: RegistryInfo;
      try {
        info = await fetcher(name);
      } catch {
        info = UNKNOWN;
      }
      results.set(name, info);
      cache[name] = { fetchedAt: now(), data: info };
      dirty = true;
    }
  }

  const poolSize = Math.min(concurrency, toFetch.length);
  await Promise.all(Array.from({ length: poolSize }, () => worker()));

  if (dirty) saveCache(cacheDir, cache);
  return results;
}
