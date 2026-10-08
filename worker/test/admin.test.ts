import { describe, expect, it } from 'vitest';
import { handleAdminBroadcast, handleAdminStats, isUserAdmin } from '../src/admin.js';

describe('Admin panel functionality', () => {
  it('correctly identifies admin users', () => {
    const env: any = { ADMIN_USER_ID: '12345678' };
    expect(isUserAdmin(env, '5067848442')).toBe(true);
    expect(isUserAdmin(env, '12345678')).toBe(true);
    expect(isUserAdmin(env, '99999999')).toBe(false);
  });

  it('rejects non-admin access to admin stats', async () => {
    const env: any = {};
    const req = new Request('https://test.com/api/admin/stats');
    const res = await handleAdminStats(req, env, '99999999');
    expect(res.status).toBe(403);
    const body: any = await res.json();
    expect(body.error).toContain('Доступ запрещён');
  });

  it('returns stats for authorized admin', async () => {
    const mockDb = {
      prepare(sql: string) {
        return {
          async all() {
            if (sql.includes('FROM users')) {
              return {
                results: [
                  { id: '5067848442', first_name: 'саша', created_at: '2026-10-08T12:00:00Z' },
                ],
              };
            }
            return { results: [] };
          },
          async first() {
            if (sql.includes('FROM transit_state')) {
              return { available: 1, source: 'Tranzy', vehicle_count: 670, note: 'OK' };
            }
            return null;
          },
        };
      },
    };

    const env: any = { DB: mockDb };
    const req = new Request('https://test.com/api/admin/stats');
    const res = await handleAdminStats(req, env, '5067848442');
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.ok).toBe(true);
    expect(body.totalUsers).toBe(1);
    expect(body.transit.vehicleCount).toBe(670);
  });

  it('validates custom broadcast message content', async () => {
    const env: any = {};
    const req = new Request('https://test.com/api/admin/broadcast', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'custom', message: '   ' }),
    });
    const res = await handleAdminBroadcast(req, env, '5067848442');
    expect(res.status).toBe(400);
    const body: any = await res.json();
    expect(body.error).toContain('Текст сообщения не может быть пустым');
  });
});
