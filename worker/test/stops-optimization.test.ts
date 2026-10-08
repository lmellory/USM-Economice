import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetStopsCacheForTesting, ensureStopsPopulated, searchStops } from '../src/commute.js';
import worker from '../src/index.js';
import * as transitModule from '../src/transit.js';
import * as tranzyModule from '../src/tranzy.js';

describe('D1 Read Quota Optimization for Stops', () => {
  const sampleStops = [
    {
      stop_id: 101,
      stop_name: 'Dacia / Cuza Vodă',
      stop_desc: 'bd. Dacia',
      stop_lat: 46.9825,
      stop_lon: 28.865,
    },
    {
      stop_id: 301,
      stop_name: 'Universitatea de Stat',
      stop_desc: 'str. A. Mateevici',
      stop_lat: 47.0185,
      stop_lon: 28.824,
    },
  ];

  beforeEach(() => {
    _resetStopsCacheForTesting();
    vi.restoreAllMocks();
  });

  it('cold start with populated app_state executes exactly 1 D1 query, 0 COUNT, 0 full scans', async () => {
    const executedQueries: string[] = [];
    const mockDb: any = {
      prepare(sql: string) {
        executedQueries.push(sql);
        return {
          bind() {
            return this;
          },
          async first() {
            return null;
          },
          async all() {
            if (sql.includes("key = 'stops_json'")) {
              return {
                meta: { rows_read: 1 },
                results: [{ value: JSON.stringify(sampleStops) }],
              };
            }
            return { results: [] };
          },
          async run() {
            return { success: true };
          },
        };
      },
    };

    const env = { DB: mockDb } as any;

    // 1. Cold start search
    const results = await searchStops(env, 'Dacia');
    expect(results).toHaveLength(1);
    expect(results[0].stop_name).toBe('Dacia / Cuza Vodă');

    // Verify D1 query counts
    expect(executedQueries).toHaveLength(1);
    expect(executedQueries[0]).toContain("SELECT value FROM app_state WHERE key = 'stops_json'");

    // Verify NO COUNT queries
    const countQueries = executedQueries.filter((q) => q.toUpperCase().includes('COUNT('));
    expect(countQueries).toHaveLength(0);

    // Verify NO full table scan queries
    const fullScanQueries = executedQueries.filter((q) =>
      q.toUpperCase().includes('SELECT * FROM TRANZY_STOPS')
    );
    expect(fullScanQueries).toHaveLength(0);

    // 2. Second search in warm isolate: uses in-memory cache, 0 queries to D1
    const warmResults = await searchStops(env, 'Universitatea');
    expect(warmResults).toHaveLength(1);
    expect(executedQueries).toHaveLength(1); // Still 1 query in total
  });

  it('ensureStopsPopulated does not sync if stops_synced_at is fresher than 7 days', async () => {
    const executedQueries: string[] = [];
    const syncSpy = vi.spyOn(transitModule, 'syncTranzyStops').mockResolvedValue({ count: 2 });
    const nowSec = Math.floor(Date.now() / 1000);
    const recentSyncTime = nowSec - 3600; // 1 hour ago (< 7 days)

    const mockDb: any = {
      prepare(sql: string) {
        executedQueries.push(sql);
        return {
          bind() {
            return this;
          },
          async first() {
            return null;
          },
          async all() {
            if (sql.includes("key = 'stops_synced_at'")) {
              return {
                meta: { rows_read: 1 },
                results: [{ value: String(recentSyncTime), updated_at: recentSyncTime }],
              };
            }
            return { results: [] };
          },
        };
      },
    };

    const env = { DB: mockDb } as any;
    await ensureStopsPopulated(env);

    expect(syncSpy).not.toHaveBeenCalled();
    const countQueries = executedQueries.filter((q) => q.toUpperCase().includes('COUNT('));
    expect(countQueries).toHaveLength(0);
  });

  it('ensureStopsPopulated syncs when stops_synced_at is absent or older than 7 days', async () => {
    const executedQueries: string[] = [];
    const syncSpy = vi.spyOn(transitModule, 'syncTranzyStops').mockResolvedValue({ count: 2 });
    const nowSec = Math.floor(Date.now() / 1000);
    const oldSyncTime = nowSec - (8 * 24 * 60 * 60); // 8 days ago (> 7 days)

    const mockDb: any = {
      prepare(sql: string) {
        executedQueries.push(sql);
        return {
          bind() {
            return this;
          },
          async first() {
            return null;
          },
          async all() {
            if (sql.includes("key = 'stops_synced_at'")) {
              return {
                meta: { rows_read: 1 },
                results: [{ value: String(oldSyncTime), updated_at: oldSyncTime }],
              };
            }
            return { results: [] };
          },
        };
      },
    };

    const env = { DB: mockDb } as any;
    await ensureStopsPopulated(env);

    expect(syncSpy).toHaveBeenCalledTimes(1);
    const countQueries = executedQueries.filter((q) => q.toUpperCase().includes('COUNT('));
    expect(countQueries).toHaveLength(0);
  });

  it('respects 1-minute cooldown when D1 query fails and falls back to Tranzy API', async () => {
    let d1Attempts = 0;
    const mockDb: any = {
      prepare() {
        d1Attempts++;
        throw new Error('D1 quota exceeded');
      },
    };

    const tranzySpy = vi.spyOn(tranzyModule, 'fetchTranzyStopsRaw').mockResolvedValue([
      { stop_id: 999, stop_name: 'Fallback Stop', stop_lat: 47.0, stop_lon: 28.8 },
    ]);

    const env = { DB: mockDb, TRANZY_API_KEY: 'test-key' } as any;

    // 1st call fails D1, enters cooldown, loads from Tranzy
    const res1 = await searchStops(env, 'Fallback');
    expect(res1).toHaveLength(1);
    expect(res1[0].stop_name).toBe('Fallback Stop');
    expect(d1Attempts).toBe(1);
    expect(tranzySpy).toHaveBeenCalledTimes(1);

    // Reset isolate cache to simulate fresh search while in cooldown
    _resetStopsCacheForTesting(null, 0, Date.now() - 10000); // error was 10s ago (< 60s)
    const res2 = await searchStops(env, 'Fallback');
    expect(res2).toHaveLength(1);
    expect(d1Attempts).toBe(1); // D1 was NOT called again because cooldown is active!
  });

  it('/health endpoint uses SELECT 1 LIMIT 1, returns stopsPresent, and executes 0 COUNT', async () => {
    const executedQueries: string[] = [];
    const mockDb: any = {
      prepare(sql: string) {
        executedQueries.push(sql);
        return {
          bind() {
            return this;
          },
          async first() {
            return null;
          },
          async all() {
            if (sql.includes('SELECT 1 FROM tranzy_stops LIMIT 1')) {
              return {
                meta: { rows_read: 1 },
                results: [{ 1: 1 }],
              };
            }
            return { results: [] };
          },
        };
      },
    };

    const env = { DB: mockDb, ASSETS: { fetch: vi.fn() } } as any;
    const req = new Request('https://worker.local/health');
    const res = await worker.fetch(req, env, {} as any);

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.ok).toBe(true);
    expect(data.stopsPresent).toBe(true);

    const countQueries = executedQueries.filter((q) => q.toUpperCase().includes('COUNT('));
    expect(countQueries).toHaveLength(0);

    const select1Queries = executedQueries.filter((q) =>
      q.includes('SELECT 1 FROM tranzy_stops LIMIT 1')
    );
    expect(select1Queries).toHaveLength(1);
  });
});
