import { prisma } from "@/lib/db";
import { recordApiEvent, recordMemoryEvent } from "@/lib/data/data-gateway";

type CircuitReason = "auth_blocked" | "rate_limited" | "timeout" | "temporary_error";

const inFlight = new Map<string, Promise<unknown>>();
const blocked = new Map<string, { until: number; reason: CircuitReason; statusCode?: number }>();
const logged = new Set<string>();
const LOCK_TTL_MS = 12_000;
const LOCK_WAIT_MS = 650;

function logOnce(key: string, message: string, level: "info" | "warn" = "info") {
  if (logged.has(key)) return;
  logged.add(key);
  console[level](message);
}

export function isCircuitBlocked(key: string): boolean {
  const item = blocked.get(key);
  if (!item) return false;
  if (Date.now() >= item.until) {
    blocked.delete(key);
    return false;
  }
  logOnce(`blocked:${key}:${item.reason}`, `[ProviderHealth] blocked provider_key=${key} reason=${item.reason} until=${new Date(item.until).toISOString()}`, "warn");
  return true;
}

export function blockCircuit(key: string, reason: CircuitReason, statusCode?: number) {
  const cooldownMs = reason === "auth_blocked" ? 6 * 60 * 60 * 1000 : reason === "rate_limited" ? 30 * 60 * 1000 : 5 * 60 * 1000;
  const until = Date.now() + cooldownMs;
  blocked.set(key, { until, reason, statusCode });
  logOnce(`block:${key}:${reason}:${statusCode ?? "none"}`, `[ProviderHealth] blocked provider=${key} reason=${reason} until=${new Date(until).toISOString()}`, "warn");
  void recordMemoryEvent("API_PROVIDER_BLOCKED", { providerKey: key, reason, statusCode, until: new Date(until).toISOString() }, key);
}

export async function singleFlight<T>(cacheKey: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(cacheKey) as Promise<T> | undefined;
  if (existing) {
    logOnce(`singleflight:${cacheKey}`, `[DataGateway] lock_wait key=${cacheKey}`);
    return existing;
  }

  const promise = fn().finally(() => {
    inFlight.delete(cacheKey);
  });
  inFlight.set(cacheKey, promise);
  return promise;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireDbLock(cacheKey: string, providerKey: string): Promise<{ acquired: boolean; owner: string; skipped: boolean }> {
  const owner = `${process.env.VERCEL_REGION ?? "local"}:${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const lockedUntil = new Date(Date.now() + LOCK_TTL_MS);

  try {
    await prisma.$executeRaw`
      insert into api_cache_locks (cache_key, locked_until, owner)
      values (${cacheKey}, ${lockedUntil}, ${owner})
      on conflict (cache_key) do update
      set locked_until = excluded.locked_until,
          owner = excluded.owner,
          updated_at = now()
      where api_cache_locks.locked_until <= now()
    `;

    const rows = await prisma.$queryRaw<Array<{ owner: string }>>`
      select owner from api_cache_locks where cache_key = ${cacheKey} limit 1
    `;

    const acquired = rows[0]?.owner === owner;
    await recordMemoryEvent(acquired ? "API_LOCK_ACQUIRED" : "API_LOCK_WAITED", { cacheKey, providerKey, owner }, providerKey);
    logOnce(
      `db-lock:${acquired ? "acquired" : "waited"}:${cacheKey}`,
      acquired
        ? `[DataGateway] lock_acquired key=${cacheKey} provider=${providerKey}`
        : `[DataGateway] lock_wait key=${cacheKey} provider=${providerKey}`,
    );
    if (acquired) {
      await recordApiEvent({ provider: providerKey, endpoint: cacheKey, usedCache: false, fallbackUsed: false, recordCount: 0 });
    }
    return { acquired, owner, skipped: false };
  } catch (err) {
    await recordMemoryEvent("API_LOCK_SKIPPED", { cacheKey, providerKey, error: err instanceof Error ? err.message : String(err) }, providerKey);
    logOnce(`db-lock:skipped:${cacheKey}`, `[DataGateway] lock_skip key=${cacheKey} provider=${providerKey}`, "warn");
    return { acquired: false, owner, skipped: true };
  }
}

async function releaseDbLock(cacheKey: string, owner: string) {
  try {
    await prisma.$executeRaw`
      update api_cache_locks
      set locked_until = now(), updated_at = now()
      where cache_key = ${cacheKey} and owner = ${owner}
    `;
  } catch {
  }
}

export async function validateApiCacheLocksAccess(): Promise<boolean> {
  try {
    await prisma.$queryRaw<Array<{ cache_key: string }>>`
      select cache_key from api_cache_locks limit 1
    `;
    return true;
  } catch {
    return false;
  }
}

export async function fetchJsonWithTimeout<T>(args: {
  url: string;
  init?: RequestInit;
  timeoutMs: number;
  providerKey: string;
  cacheKey: string;
}): Promise<T> {
  if (isCircuitBlocked(args.providerKey)) {
    throw new Error(`provider-circuit-open:${args.providerKey}`);
  }

  return singleFlight(args.cacheKey, async () => {
    const lock = await acquireDbLock(args.cacheKey, args.providerKey);
    if (!lock.acquired) {
      await sleep(LOCK_WAIT_MS);
      throw new Error(`${lock.skipped ? "api-lock-skipped" : "api-lock-held"}:${args.cacheKey}`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), args.timeoutMs);
    try {
      logOnce(`fetch:${args.cacheKey}`, `[DataGateway] external_fetch provider=${args.providerKey} key=${args.cacheKey}`);
      const res = await fetch(args.url, { ...args.init, signal: controller.signal });
      if (res.status === 401 || res.status === 403) {
        blockCircuit(args.providerKey, "auth_blocked", res.status);
        throw new Error(`provider-auth-blocked:${res.status}`);
      }
      if (res.status === 429) {
        blockCircuit(args.providerKey, "rate_limited", res.status);
        throw new Error("provider-rate-limited:429");
      }
      if (res.status >= 500) {
        blockCircuit(args.providerKey, "temporary_error", res.status);
        throw new Error(`provider-temporary-error:${res.status}`);
      }
      if (!res.ok) throw new Error(`provider-http-error:${res.status}`);
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        blockCircuit(args.providerKey, "timeout");
      }
      throw err;
    } finally {
      clearTimeout(timer);
      await releaseDbLock(args.cacheKey, lock.owner);
    }
  });
}
