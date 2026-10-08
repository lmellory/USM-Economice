import { describe, expect, it } from 'vitest';
import { handleTransitRoutes } from '../src/commute.js';

function createMockEnv(initialRows: any[] = []) {
  const store = [...initialRows];

  const db = {
    prepare(sql: string) {
      let boundArgs: any[] = [];
      return {
        bind(...args: any[]) {
          boundArgs = args;
          return this;
        },
        async run() {
          if (sql.includes('UPDATE commute_options')) {
            // UPDATE commute_options SET walk_before_minutes=?, walk_after_minutes=?, legs=?, is_configured=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?
            const [walkBefore, walkAfter, legs, isConfigured, id, userId] = boundArgs;
            const item = store.find((r) => r.id === id && r.user_id === userId);
            if (item) {
              item.walk_before_minutes = walkBefore;
              item.walk_after_minutes = walkAfter;
              item.legs = legs;
              item.is_configured = isConfigured;
            }
            return { success: true };
          }
          return { success: true };
        },
        async first() {
          if (sql.includes('SELECT * FROM commute_options WHERE id=? AND user_id=?')) {
            const [id, userId] = boundArgs;
            const item = store.find((r) => r.id === id && r.user_id === userId);
            return item ? { ...item } : null;
          }
          return null;
        },
        async all() {
          return { results: store };
        },
      };
    },
    async batch() {
      return [];
    },
  };

  return { DB: db } as any;
}

describe('PUT /api/transit/options/:id security & owner check', () => {
  it('should not allow user to update an option belonging to another user', async () => {
    const env = createMockEnv([
      {
        id: 'opt_user1',
        user_id: '12345',
        destination: 'university',
        name: 'Троллейбус 2',
        position: 1,
        enabled: 1,
        is_configured: 0,
        walk_before_minutes: 7,
        walk_after_minutes: 5,
        legs: '[]',
      },
    ]);

    // User "99999" tries to update option belonging to "12345"
    const req = new Request('https://api/api/transit/options/opt_user1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walk_before_minutes: 10,
        is_configured: true,
      }),
    });

    const res = await handleTransitRoutes(req, env, '99999', '/options/opt_user1');
    expect(res.status).toBe(404);
    const data = await res.json() as any;
    expect(data.error).toBe('Маршрут не найден или нет доступа.');
  });

  it('should allow user to update their own option and correctly set is_configured=0 when false', async () => {
    const env = createMockEnv([
      {
        id: 'opt_user1',
        user_id: '12345',
        destination: 'university',
        name: 'Троллейбус 2',
        position: 1,
        enabled: 1,
        is_configured: 1,
        walk_before_minutes: 7,
        walk_after_minutes: 5,
        legs: '[]',
      },
    ]);

    const req = new Request('https://api/api/transit/options/opt_user1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walk_before_minutes: 12,
        walk_after_minutes: 8,
        is_configured: false,
      }),
    });

    const res = await handleTransitRoutes(req, env, '12345', '/options/opt_user1');
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.option.walk_before_minutes).toBe(12);
    expect(data.option.is_configured).toBe(false);
  });
});
