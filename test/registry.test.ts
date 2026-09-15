import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { queryRegistry, type RegistryFetch, type RegistryInfo } from "../src/registry.js";

let cacheDir: string;

beforeEach(() => {
  cacheDir = mkdtempSync(join(tmpdir(), "blastradius-cache-"));
});

afterEach(() => {
  rmSync(cacheDir, { recursive: true, force: true });
});

function fakeFetcher(data: Record<string, RegistryInfo>): { fetch: RegistryFetch; calls: string[] } {
  const calls: string[] = [];
  const fetch: RegistryFetch = async (name) => {
    calls.push(name);
    const entry = data[name];
    if (!entry) throw new Error(`unexpected package ${name}`);
    return entry;
  };
  return { fetch, calls };
}

describe("queryRegistry", () => {
  it("fetches every uncached package exactly once", async () => {
    const { fetch, calls } = fakeFetcher({
      alpha: { latest: "2.0.0", deprecated: false, status: "ok" },
      beta: { latest: "1.5.0", deprecated: true, status: "ok" },
    });

    const results = await queryRegistry(["alpha", "beta"], fetch, { cacheDir });

    expect(calls.sort()).toEqual(["alpha", "beta"]);
    expect(results.get("alpha")).toEqual({ latest: "2.0.0", deprecated: false, status: "ok" });
    expect(results.get("beta")).toEqual({ latest: "1.5.0", deprecated: true, status: "ok" });
  });

  it("serves a second run from cache with zero network calls", async () => {
    const now = { value: 1_000_000 };
    const { fetch: firstFetch } = fakeFetcher({
      alpha: { latest: "2.0.0", deprecated: false, status: "ok" },
    });

    const first = await queryRegistry(["alpha"], firstFetch, { cacheDir, now: () => now.value });
    expect(first.get("alpha")?.latest).toBe("2.0.0");

    // Second run: fetcher throws unconditionally — if it's ever called the
    // test fails, proving the cache hit made zero calls.
    const angryFetch: RegistryFetch = async () => {
      throw new Error("network should not be touched on a cache hit");
    };
    now.value += 1000; // well inside the 24h TTL

    const second = await queryRegistry(["alpha"], angryFetch, { cacheDir, now: () => now.value });
    expect(second.get("alpha")).toEqual({ latest: "2.0.0", deprecated: false, status: "ok" });
  });

  it("re-fetches once the TTL has expired", async () => {
    const now = { value: 1_000_000 };
    const { fetch: firstFetch } = fakeFetcher({
      alpha: { latest: "2.0.0", deprecated: false, status: "ok" },
    });
    await queryRegistry(["alpha"], firstFetch, { cacheDir, now: () => now.value });

    now.value += 25 * 60 * 60 * 1000; // past the 24h TTL
    const { fetch: secondFetch, calls } = fakeFetcher({
      alpha: { latest: "2.1.0", deprecated: false, status: "ok" },
    });
    const second = await queryRegistry(["alpha"], secondFetch, { cacheDir, now: () => now.value });

    expect(calls).toEqual(["alpha"]);
    expect(second.get("alpha")?.latest).toBe("2.1.0");
  });

  it("degrades a throwing fetcher to unknown for every package, never crashes", async () => {
    const alwaysThrows: RegistryFetch = async () => {
      throw new Error("boom");
    };

    const results = await queryRegistry(["alpha", "beta", "gamma"], alwaysThrows, { cacheDir });

    for (const name of ["alpha", "beta", "gamma"]) {
      expect(results.get(name)).toEqual({ latest: null, deprecated: false, status: "unknown" });
    }
  });

  it("never runs more than the configured concurrency at once", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const names = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const fetch: RegistryFetch = async (name) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return { latest: `${name}-latest`, deprecated: false, status: "ok" };
    };

    await queryRegistry(names, fetch, { cacheDir, concurrency: 4 });

    expect(maxInFlight).toBeLessThanOrEqual(4);
  });
});
