import fs from "node:fs";
import path from "node:path";
import type { Campaign } from "@/lib/domain/schemas";
import type { AnalyticsEvent } from "@/lib/analytics/events";

/**
 * Persistence. Two interchangeable backends:
 * - File (default): one JSON file under PRESENCE_DATA_DIR (./.data). Single process, local use.
 * - Redis (Upstash REST): used automatically when UPSTASH_REDIS_REST_URL/TOKEN (or Vercel's
 *   KV_REST_API_URL/TOKEN) are set. Shared across serverless instances, e.g. on Vercel.
 * All writes go through `withLock`, so concurrent instances cannot interleave a read-modify-write.
 */

export interface Meta {
  examplesSeededAt?: string;
}

export interface StoreBackend {
  kind: "file" | "redis";
  getCampaign(id: string): Promise<Campaign | null>;
  listCampaigns(): Promise<Campaign[]>;
  putCampaign(c: Campaign): Promise<void>;
  deleteCampaign(id: string): Promise<boolean>;
  appendEvents(events: AnalyticsEvent[]): Promise<void>;
  listEvents(): Promise<AnalyticsEvent[]>;
  getMeta(): Promise<Meta>;
  setMeta(m: Meta): Promise<void>;
  withLock<T>(key: string, fn: () => Promise<T>): Promise<T>;
}

export function dataDir(): string {
  return path.resolve(process.env.PRESENCE_DATA_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), ".data"));
}

/* ------------------------------- file backend ------------------------------- */

interface FileDB {
  schemaVersion: 1;
  campaigns: Record<string, Campaign>;
  events: AnalyticsEvent[];
  meta?: Meta;
}

type Holder = { db: FileDB | null; file: string | null; locks: Map<string, Promise<unknown>> };
const g = globalThis as unknown as { __presenceStore?: Holder };
// One holder per server process (survives Next.js module re-instantiation in dev).
const holder: Holder = (g.__presenceStore ??= { db: null, file: null, locks: new Map() });
holder.locks ??= new Map(); // tolerate a holder created by an older module version during hot reload

/** A run persisted as "running" cannot still be executing in a fresh process: mark it interrupted. */
function recoverInterruptedRuns(c: Campaign): Campaign {
  for (const run of c.runs) {
    if (run.status !== "running") continue;
    run.status = "completed_with_errors";
    run.completedAt = new Date().toISOString();
    for (const r of Object.values(run.agents)) {
      if (r.status === "running" || r.status === "queued") Object.assign(r, { status: "failed", errors: [...r.errors, "Interrupted: the server restarted during this run."] });
    }
  }
  return c;
}

function fileBackend(): StoreBackend {
  const file = () => path.join(dataDir(), "presenceos.json");
  const load = (): FileDB => {
    if (holder.db && holder.file === file()) return holder.db;
    let db: FileDB = { schemaVersion: 1, campaigns: {}, events: [] };
    try {
      const parsed = JSON.parse(fs.readFileSync(file(), "utf8")) as FileDB;
      if (parsed.schemaVersion === 1) db = parsed;
      Object.values(db.campaigns).forEach(recoverInterruptedRuns);
    } catch {
      // First run or unreadable file — start empty.
    }
    holder.db = db;
    holder.file = file();
    return db;
  };
  const persist = () => {
    fs.mkdirSync(dataDir(), { recursive: true });
    const tmp = `${file()}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(load()));
    fs.renameSync(tmp, file());
  };
  return {
    kind: "file",
    async getCampaign(id) {
      const c = load().campaigns[id];
      return c ? structuredClone(c) : null;
    },
    async listCampaigns() {
      return structuredClone(Object.values(load().campaigns));
    },
    async putCampaign(c) {
      load().campaigns[c.id] = structuredClone(c);
      persist();
    },
    async deleteCampaign(id) {
      const db = load();
      if (!db.campaigns[id]) return false;
      delete db.campaigns[id];
      persist();
      return true;
    },
    async appendEvents(events) {
      load().events.push(...events);
      persist();
    },
    async listEvents() {
      return structuredClone(load().events);
    },
    async getMeta() {
      return { ...load().meta };
    },
    async setMeta(m) {
      load().meta = m;
      persist();
    },
    async withLock(key, fn) {
      // In-process serialisation per key.
      const prev = holder.locks.get(key) ?? Promise.resolve();
      const next = prev.then(fn, fn);
      holder.locks.set(key, next.catch(() => undefined));
      return next;
    },
  };
}

/* ------------------------------- redis backend ------------------------------ */

function redisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

const MAX_EVENTS = 5000;

function redisBackend(cfg: { url: string; token: string }): StoreBackend {
  const prefix = process.env.PRESENCE_REDIS_PREFIX || "presenceos";
  const k = (s: string) => `${prefix}:${s}`;
  const call = async <T = unknown>(cmd: (string | number)[]): Promise<T> => {
    const res = await fetch(cfg.url, { method: "POST", headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" }, body: JSON.stringify(cmd), cache: "no-store" });
    const data = (await res.json()) as { result?: T; error?: string };
    if (!res.ok || data.error) throw new Error(`Redis ${cmd[0]} failed: ${data.error ?? res.status}`);
    return data.result as T;
  };
  const parse = <T>(s: string | null): T | null => (s ? (JSON.parse(s) as T) : null);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  return {
    kind: "redis",
    async getCampaign(id) {
      return parse<Campaign>(await call<string | null>(["GET", k(`campaign:${id}`)]));
    },
    async listCampaigns() {
      const ids = await call<string[]>(["SMEMBERS", k("campaigns")]);
      if (!ids.length) return [];
      const rows = await call<(string | null)[]>(["MGET", ...ids.map((id) => k(`campaign:${id}`))]);
      return rows.map((r) => parse<Campaign>(r)).filter((c): c is Campaign => !!c);
    },
    async putCampaign(c) {
      await call(["SET", k(`campaign:${c.id}`), JSON.stringify(c)]);
      await call(["SADD", k("campaigns"), c.id]);
    },
    async deleteCampaign(id) {
      const n = await call<number>(["DEL", k(`campaign:${id}`)]);
      await call(["SREM", k("campaigns"), id]);
      return n > 0;
    },
    async appendEvents(events) {
      if (!events.length) return;
      await call(["RPUSH", k("events"), ...events.map((e) => JSON.stringify(e))]);
      await call(["LTRIM", k("events"), -MAX_EVENTS, -1]);
    },
    async listEvents() {
      const rows = await call<string[]>(["LRANGE", k("events"), 0, -1]);
      return rows.map((r) => JSON.parse(r) as AnalyticsEvent);
    },
    async getMeta() {
      return parse<Meta>(await call<string | null>(["GET", k("meta")])) ?? {};
    },
    async setMeta(m) {
      await call(["SET", k("meta"), JSON.stringify(m)]);
    },
    async withLock(key, fn) {
      // Distributed lock: SET NX with expiry; released only by its owner.
      const lockKey = k(`lock:${key}`);
      const owner = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const deadline = Date.now() + 15_000;
      while ((await call<string | null>(["SET", lockKey, owner, "NX", "PX", 15_000])) !== "OK") {
        if (Date.now() > deadline) throw new Error(`Timed out waiting for lock ${key}`);
        await sleep(40 + Math.random() * 60);
      }
      try {
        return await fn();
      } finally {
        if ((await call<string | null>(["GET", lockKey])) === owner) await call(["DEL", lockKey]);
      }
    },
  };
}

/* --------------------------------- selection -------------------------------- */

const gb = globalThis as unknown as { __presenceBackend?: { key: string; backend: StoreBackend } };

export function store(): StoreBackend {
  const cfg = redisConfig();
  const key = cfg ? `redis:${cfg.url}` : `file:${dataDir()}`;
  if (gb.__presenceBackend?.key !== key) gb.__presenceBackend = { key, backend: cfg ? redisBackend(cfg) : fileBackend() };
  return gb.__presenceBackend.backend;
}

/** Uploaded photos are stored on local disk, which serverless hosts do not persist. */
export function uploadsEnabled(): boolean {
  return store().kind === "file" && !process.env.VERCEL;
}
