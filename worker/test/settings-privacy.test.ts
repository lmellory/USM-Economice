import { describe, expect, it } from 'vitest';
import { dbSettings, DEFAULT_SETTINGS, validatedSettings } from '../src/settings.js';
describe('Retired personal address settings', () => {
  it('does not disclose existing or default addresses in settings responses', () => {
    const result = dbSettings({
      home_address: 'Private home',
      university_address: 'Private university',
      homeAddress: 'Old alias',
      universityAddress: 'Old alias',
      travel_minutes: 25,
      theme: 'dark',
    });
    for (const key of ['home_address', 'homeAddress']) {
      expect(result).not.toHaveProperty(key);
      expect(DEFAULT_SETTINGS).not.toHaveProperty(key);
    }
    expect(result).toMatchObject({
      travel_minutes: 25,
      theme: 'dark',
      university_address: 'Private university',
    });
  });
  it('ignores retired address writes while retaining manual travel duration', () => {
    expect(
      validatedSettings({
        home_address: 'x',
        homeAddress: 'x',
        travel_minutes: 25,
        travel_buffer: 0,
      })
    ).toEqual({ travel_minutes: 25, travel_buffer: 0 });
  });
});
