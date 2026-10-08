import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkTripPlanRateLimit, handleTripPlan } from '../src/trip-plan.js';

function createMockD1() {
  const store: Record<string, number> = {};

  return {
    prepare(sql: string) {
      let bound: any[] = [];
      return {
        bind(...args: any[]) {
          bound = args;
          return this;
        },
        async first() {
          if (sql.includes('SELECT request_count FROM trip_plan_rate_limit')) {
            const [userId, windowHour] = bound;
            const key = `${userId}:${windowHour}`;
            const count = store[key];
            return count !== undefined ? { request_count: count } : null;
          }
          if (sql.includes('SELECT * FROM tranzy_stops') || sql.includes('SELECT COUNT(*)')) {
            return { c: 50 };
          }
          return null;
        },
        async all() {
          if (sql.includes('SELECT * FROM tranzy_stops')) {
            return {
              results: [
                {
                  stop_id: 101,
                  stop_name: 'Dacia / Cuza Vodă',
                  stop_lat: 46.9825,
                  stop_lon: 28.865,
                },
                {
                  stop_id: 301,
                  stop_name: 'Universitatea de Stat',
                  stop_lat: 47.0185,
                  stop_lon: 28.824,
                },
              ],
            };
          }
          return { results: [] };
        },
        async run() {
          if (sql.includes('INSERT INTO trip_plan_rate_limit')) {
            const [userId, windowHour] = bound;
            const key = `${userId}:${windowHour}`;
            store[key] = (store[key] || 0) + 1;
            return { success: true };
          }
          return { success: true };
        },
      };
    },
    async batch() {
      return [];
    },
  } as any;
}

describe('Worker Trip Plan API (/api/trip/plan)', () => {
  let mockDb: any;

  beforeEach(() => {
    mockDb = createMockD1();
    vi.restoreAllMocks();
  });

  describe('Rate Limiter', () => {
    it('allows up to 30 requests per hour and blocks the 31st request with 429', async () => {
      const userId = 'user-test-rate';
      for (let i = 0; i < 30; i++) {
        const check = await checkTripPlanRateLimit(mockDb, userId, 30);
        expect(check.allowed).toBe(true);
      }

      // 31st request
      const blocked = await checkTripPlanRateLimit(mockDb, userId, 30);
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
    });
  });

  describe('Coordinate Validation', () => {
    it('returns 400 when query parameters are missing', async () => {
      const env = { DB: mockDb } as any;
      const req = new Request('https://api/api/trip/plan?fromLat=47.01');
      const res = await handleTripPlan(req, env, 'user-1');
      expect(res.status).toBe(400);
      const data = (await res.json()) as any;
      expect(data.error).toContain('обязательны');
    });

    it('returns 400 when coordinates are outside Chisinau bounds', async () => {
      const env = { DB: mockDb } as any;
      // fromLat 45.0 is far south outside Chisinau (46.9 - 47.1)
      const req = new Request(
        'https://api/api/trip/plan?fromLat=45.0&fromLon=28.82&toLat=47.01&toLon=28.83'
      );
      const res = await handleTripPlan(req, env, 'user-1');
      expect(res.status).toBe(400);
      const data = (await res.json()) as any;
      expect(data.error).toContain('внутри Кишинёва');
    });
  });

  describe('Google API fallback and error handling', () => {
    it('returns tranzy_only source with notice when GOOGLE_MAPS_SERVER_KEY is missing', async () => {
      const env = { DB: mockDb, GOOGLE_MAPS_SERVER_KEY: '' } as any;
      const req = new Request(
        'https://api/api/trip/plan?fromLat=46.9825&fromLon=28.865&toLat=47.0185&toLon=28.824'
      );
      const res = await handleTripPlan(req, env, 'user-1');
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.source).toBe('tranzy_only');
      expect(data.from.nearestStop).toBeDefined();
      expect(data.to.nearestStop).toBeDefined();
      expect(data.notice).toContain('не настроен');
    });

    it('handles Google API error (e.g. 403 or 429) gracefully without throwing', async () => {
      const env = {
        DB: mockDb,
        GOOGLE_MAPS_SERVER_KEY: 'test-google-key',
      } as any;

      // Mock fetch returning 403 Forbidden from Google
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        if (String(url).includes('routes.googleapis.com')) {
          return new Response(JSON.stringify({ error: { message: 'Quota exceeded' } }), {
            status: 429,
          });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const req = new Request(
        'https://api/api/trip/plan?fromLat=46.9825&fromLon=28.865&toLat=47.0185&toLon=28.824'
      );
      const res = await handleTripPlan(req, env, 'user-1');
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.source).toBe('tranzy_only');
      expect(data.notice).toContain('Google недоступен');
    });

    it('successfully processes valid Google Routes transit and traffic aware drive responses', async () => {
      const env = {
        DB: mockDb,
        GOOGLE_MAPS_SERVER_KEY: 'valid-test-key',
      } as any;

      const mockTransitRoutes = {
        routes: [
          {
            duration: '1200s',
            polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' },
            legs: [
              {
                steps: [
                  {
                    travelMode: 'WALK',
                    staticDuration: '180s',
                  },
                  {
                    travelMode: 'TRANSIT',
                    transitDetails: {
                      transitLine: {
                        nameShort: '2',
                        vehicle: { type: 'TROLLEYBUS' },
                      },
                      stopDetails: {
                        departureStop: {
                          name: 'Dacia / Cuza Vodă',
                          location: { latLng: { latitude: 46.9825, longitude: 28.865 } },
                        },
                        arrivalStop: {
                          name: 'Universitatea de Stat',
                          location: { latLng: { latitude: 47.0185, longitude: 28.824 } },
                        },
                      },
                      localizedValues: {
                        departureTime: { time: { text: '08:20' } },
                        arrivalTime: { time: { text: '08:40' } },
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      };

      const mockDriveRoutes = {
        routes: [
          {
            duration: '720s',
            staticDuration: '600s', // 720 / 600 = 1.20 -> dense ("плотно")
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, init: any) => {
        const bodyStr = String(init?.body || '');
        if (bodyStr.includes('"TRANSIT"')) {
          return new Response(JSON.stringify(mockTransitRoutes), { status: 200 });
        }
        if (bodyStr.includes('"DRIVE"')) {
          return new Response(JSON.stringify(mockDriveRoutes), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const req = new Request(
        'https://api/api/trip/plan?fromLat=46.9825&fromLon=28.865&toLat=47.0185&toLon=28.824'
      );
      const res = await handleTripPlan(req, env, 'user-1');
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;

      expect(data.source).toBe('google_and_tranzy');
      expect(data.routes.length).toBe(1);
      const r1 = data.routes[0];
      expect(r1.totalDurationSeconds).toBe(1200);
      expect(r1.totalDurationFormatted).toBe('20 мин');
      expect(r1.traffic.level).toBe('dense');
      expect(r1.traffic.label).toBe('плотно');
      expect(r1.steps.length).toBe(2);
      expect(r1.steps[0].travelMode).toBe('WALK');
      expect(r1.steps[1].travelMode).toBe('TRANSIT');
      expect(r1.steps[1].lineShortName).toBe('2');
      expect(r1.steps[1].tranzyRouteId).toBe(9); // RTEC route_id for №2
    });
  });
});
