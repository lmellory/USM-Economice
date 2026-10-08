import { describe, expect, it } from 'vitest';
import {
  CHISINAU_BOUNDS,
  CHISINAU_RTEC_ROUTE_MAP,
  calculateTrafficLevel,
  findNearestStop,
  isWithinChisinauBounds,
  parseDurationSeconds,
  TransitStop,
} from '../src/index.js';

describe('Trip Plan & Traffic calculations (@usm/shared)', () => {
  describe('Chisinau bounds validation', () => {
    it('returns true for coordinates within Chisinau municipality', () => {
      expect(isWithinChisinauBounds(47.0185, 28.824)).toBe(true); // USM Bloc Central
      expect(isWithinChisinauBounds(46.9825, 28.865)).toBe(true); // Botanica Cuza Voda
      expect(isWithinChisinauBounds(CHISINAU_BOUNDS.minLat, CHISINAU_BOUNDS.minLon)).toBe(true);
      expect(isWithinChisinauBounds(CHISINAU_BOUNDS.maxLat, CHISINAU_BOUNDS.maxLon)).toBe(true);
    });

    it('returns false for coordinates outside Chisinau bounds', () => {
      expect(isWithinChisinauBounds(46.89, 28.82)).toBe(false); // Below minLat
      expect(isWithinChisinauBounds(47.11, 28.82)).toBe(false); // Above maxLat
      expect(isWithinChisinauBounds(47.0, 28.69)).toBe(false); // West of minLon
      expect(isWithinChisinauBounds(47.0, 28.96)).toBe(false); // East of maxLon
      expect(isWithinChisinauBounds(NaN, 28.82)).toBe(false);
      expect(isWithinChisinauBounds(47.0, NaN)).toBe(false);
      expect(isWithinChisinauBounds('47.0' as any, 28.8)).toBe(false);
    });
  });

  describe('Duration parsing ("689s")', () => {
    it('parses valid duration strings ending with "s"', () => {
      expect(parseDurationSeconds('689s')).toBe(689);
      expect(parseDurationSeconds('540s')).toBe(540);
      expect(parseDurationSeconds('0s')).toBe(0);
      expect(parseDurationSeconds('12.4s')).toBe(12);
      expect(parseDurationSeconds('  300s  ')).toBe(300);
    });

    it('returns null for unexpected formats or empty values', () => {
      expect(parseDurationSeconds(null)).toBeNull();
      expect(parseDurationSeconds(undefined)).toBeNull();
      expect(parseDurationSeconds('')).toBeNull();
      expect(parseDurationSeconds('689')).toBeNull();
      expect(parseDurationSeconds('10m')).toBeNull();
      expect(parseDurationSeconds('invalid')).toBeNull();
    });
  });

  describe('Traffic level calculation', () => {
    it('returns no_data ("нет данных") when staticDuration is missing, null, or zero', () => {
      expect(calculateTrafficLevel(689, null)).toEqual({
        level: 'no_data',
        label: 'нет данных',
      });
      expect(calculateTrafficLevel(689, 0)).toEqual({
        level: 'no_data',
        label: 'нет данных',
      });
      expect(calculateTrafficLevel(0, 540)).toEqual({
        level: 'no_data',
        label: 'нет данных',
      });
    });

    it('returns free ("свободно") when duration / staticDuration < 1.15', () => {
      // 540s / 540s = 1.00
      expect(calculateTrafficLevel(540, 540)).toEqual({
        level: 'free',
        label: 'свободно',
        ratio: 1.0,
      });
      // 615s / 540s = 1.138 < 1.15
      const res = calculateTrafficLevel(615, 540);
      expect(res.level).toBe('free');
      expect(res.label).toBe('свободно');
      expect(res.ratio).toBe(1.14);
    });

    it('returns dense ("плотно") on boundary 1.15 and up to 1.40', () => {
      // Exactly 1.15
      const b1 = calculateTrafficLevel(115, 100);
      expect(b1.level).toBe('dense');
      expect(b1.label).toBe('плотно');
      expect(b1.ratio).toBe(1.15);

      // Mid dense: 1.28
      const mid = calculateTrafficLevel(689, 540);
      expect(mid.level).toBe('dense');
      expect(mid.label).toBe('плотно');
      expect(mid.ratio).toBe(1.28);

      // Upper boundary: exactly 1.40
      const b2 = calculateTrafficLevel(140, 100);
      expect(b2.level).toBe('dense');
      expect(b2.label).toBe('плотно');
      expect(b2.ratio).toBe(1.4);
    });

    it('returns jam ("пробки") when ratio > 1.40', () => {
      // Just above boundary: 1.41
      const j1 = calculateTrafficLevel(141, 100);
      expect(j1.level).toBe('jam');
      expect(j1.label).toBe('пробки');
      expect(j1.ratio).toBe(1.41);

      // Severe jam: 900s / 540s = 1.67
      const j2 = calculateTrafficLevel(900, 540);
      expect(j2.level).toBe('jam');
      expect(j2.label).toBe('пробки');
      expect(j2.ratio).toBe(1.67);
    });
  });

  describe('Snap coordinates to nearest Tranzy stop within 400m', () => {
    const mockStops: TransitStop[] = [
      {
        stop_id: 1001,
        stop_name: 'Universitatea de Stat',
        stop_lat: 47.0185,
        stop_lon: 28.824,
      },
      {
        stop_id: 1002,
        stop_name: 'Parcul Ștefan cel Mare',
        stop_lat: 47.0245,
        stop_lon: 28.8322,
      },
    ];

    it('finds nearest stop within 400m', () => {
      // Point ~50 meters from USM stop
      const res = findNearestStop(47.0188, 28.8243, mockStops, 400);
      expect(res).not.toBeNull();
      expect(res!.stop.stop_id).toBe(1001);
      expect(res!.stop.stop_name).toBe('Universitatea de Stat');
      expect(res!.distanceMeters).toBeLessThan(100);
    });

    it('returns null when nearest stop is further than 400m', () => {
      // Point ~2 km away from both stops
      const res = findNearestStop(46.99, 28.85, mockStops, 400);
      expect(res).toBeNull();
    });

    it('returns null for empty stops list', () => {
      const res = findNearestStop(47.0185, 28.824, [], 400);
      expect(res).toBeNull();
    });
  });

  describe('Tranzy RTEC route nameShort mapping', () => {
    it('correctly maps Google Transit line short names to Tranzy route_ids', () => {
      expect(CHISINAU_RTEC_ROUTE_MAP['2']).toBe(9);
      expect(CHISINAU_RTEC_ROUTE_MAP['4']).toBe(20);
      expect(CHISINAU_RTEC_ROUTE_MAP['17']).toBe(16);
      expect(CHISINAU_RTEC_ROUTE_MAP['22']).toBe(8);
      expect(CHISINAU_RTEC_ROUTE_MAP['10']).toBe(4);
      expect(CHISINAU_RTEC_ROUTE_MAP['24']).toBe(28);
    });
  });
});
