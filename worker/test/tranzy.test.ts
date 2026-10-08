import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTranzyAgency, getTranzyHeaders, resetTranzyAgencyCache } from '../src/tranzy.js';

describe('worker/src/tranzy.ts agency resolution & headers', () => {
  beforeEach(() => {
    resetTranzyAgencyCache();
    vi.restoreAllMocks();
  });

  it('throws an error if TRANZY_API_KEY is not defined', async () => {
    const env: any = {};
    await expect(getTranzyAgency(env)).rejects.toThrow('Секрет TRANZY_API_KEY не задан в Worker.');
  });

  it('uses TRANZY_AGENCY_ID directly without calling /agency if configured', async () => {
    const env: any = {
      TRANZY_API_KEY: 'test-key',
      TRANZY_AGENCY_ID: 'custom-agency-42',
    };
    const agency = await getTranzyAgency(env);
    expect(agency.id).toBe('custom-agency-42');

    const headersRes = await getTranzyHeaders(env);
    expect(headersRes.headers['X-API-KEY']).toBe('test-key');
    expect(headersRes.headers['X-Agency-Id']).toBe('custom-agency-42');
  });

  it('correctly matches Chisinau / RTEC agency from Tranzy /agency list', async () => {
    const env: any = {
      TRANZY_API_KEY: 'test-key',
    };

    const mockAgencies = [
      { agency_id: 'cluj-1', agency_name: 'CTP Cluj-Napoca', agency_timezone: 'Europe/Bucharest' },
      { agency_id: 'chisinau-rtec', agency_name: 'R.T.E.C. Chișinău', agency_timezone: 'Europe/Chisinau' },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockAgencies), { status: 200 })
    );

    const agency = await getTranzyAgency(env);
    expect(agency.id).toBe('chisinau-rtec');
    expect(agency.name).toContain('R.T.E.C.');
  });

  it('throws an explicit error when no Chisinau agency is found (no silent fallback to list[0])', async () => {
    const env: any = {
      TRANZY_API_KEY: 'test-key',
    };

    const mockOtherAgencies = [
      { agency_id: 'iasi-1', agency_name: 'CTP Iasi', agency_timezone: 'Europe/Bucharest' },
      { agency_id: 'timisoara-1', agency_name: 'STPT Timisoara', agency_timezone: 'Europe/Bucharest' },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockOtherAgencies), { status: 200 })
    );

    await expect(getTranzyAgency(env)).rejects.toThrow(
      'Подходящее транспортное агентство Кишинёва (RTEC/PUA) не найдено в Tranzy OpenData.'
    );
  });
});
