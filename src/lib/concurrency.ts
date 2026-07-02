export const concurrencyConfig = {
  crawl: readConcurrencyEnv("WORKER_CRAWL_CONCURRENCY", 12, 50),
  media: readConcurrencyEnv("WORKER_MEDIA_CONCURRENCY", 30, 100),
  gpt: readConcurrencyEnv("WORKER_GPT_CONCURRENCY", 50, 50),
  image: readConcurrencyEnv("WORKER_IMAGE_CONCURRENCY", 100, 100),
  localImage: readConcurrencyEnv("WORKER_LOCAL_IMAGE_CONCURRENCY", 1, 1),
  feishu: readConcurrencyEnv("WORKER_FEISHU_CONCURRENCY", 50, 50),
  feishuAttachment: readConcurrencyEnv("WORKER_FEISHU_ATTACHMENT_CONCURRENCY", 3, 10),
  production: readConcurrencyEnv("WORKER_PRODUCTION_CONCURRENCY", 30, 50),
  distributionRecord: readConcurrencyEnv("WORKER_DISTRIBUTION_RECORD_CONCURRENCY", 2, 10),
  distributionGpt: readConcurrencyEnv("WORKER_DISTRIBUTION_GPT_CONCURRENCY", 6, 15),
  distributionFeishuRead: readConcurrencyEnv("WORKER_DISTRIBUTION_FEISHU_READ_CONCURRENCY", 2, 10),
  distributionFeishuWrite: readConcurrencyEnv("WORKER_DISTRIBUTION_FEISHU_WRITE_CONCURRENCY", 1, 3),
} as const;

export type ConcurrencyPoolName = keyof typeof concurrencyConfig;

type PoolStats = {
  limit: number;
  active: number;
  queued: number;
};

class ConcurrencyPool {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  stats(): PoolStats {
    return {
      limit: this.limit,
      active: this.active,
      queued: this.queue.length,
    };
  }

  private acquire() {
    if (this.active < this.limit) {
      this.active += 1;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  private release() {
    this.active = Math.max(0, this.active - 1);
    const next = this.queue.shift();
    if (next) next();
  }
}

type GlobalConcurrencyState = typeof globalThis & {
  __fluxpostConcurrencyPools?: Partial<Record<ConcurrencyPoolName, ConcurrencyPool>>;
};

const globalState = globalThis as GlobalConcurrencyState;
const pools = (globalState.__fluxpostConcurrencyPools ||= {});

export function runWithConcurrencyPool<T>(name: ConcurrencyPoolName, task: () => Promise<T>) {
  return getPool(name).run(task);
}

export function getConcurrencySnapshot(): Record<ConcurrencyPoolName, PoolStats> {
  return Object.fromEntries(
    (Object.keys(concurrencyConfig) as ConcurrencyPoolName[]).map((name) => [name, getPool(name).stats()]),
  ) as Record<ConcurrencyPoolName, PoolStats>;
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, Math.floor(concurrency)), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex], currentIndex);
      }
    }),
  );

  return results;
}

function getPool(name: ConcurrencyPoolName) {
  const limit = concurrencyConfig[name];
  const current = pools[name];
  if (current && current.limit === limit) return current;
  const next = new ConcurrencyPool(limit);
  pools[name] = next;
  return next;
}

function readConcurrencyEnv(envName: string, fallback: number, hardMax: number) {
  const raw = process.env[envName];
  const value = raw === undefined || raw.trim() === "" ? fallback : Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.floor(value), 1), hardMax);
}
