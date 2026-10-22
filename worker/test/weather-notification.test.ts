import { describe, expect, it, vi } from 'vitest';
import {
  DAILY_WISHES_31,
  getClothingAdvice,
  getWeatherConditionDesc,
  buildMorningWeatherMessage,
} from '../src/notifications.js';

describe('Weather notification & 31 wishes', () => {
  it('has exactly 31 unique daily wishes without unwanted phrases', () => {
    expect(DAILY_WISHES_31).toHaveLength(31);
    const unique = new Set(DAILY_WISHES_31);
    expect(unique.size).toBe(31);

    for (const wish of DAILY_WISHES_31) {
      expect(wish.length).toBeGreaterThan(15);
      expect(wish.toLowerCase()).not.toContain('без спешки');
    }
  });

  it('correctly maps weather codes to human-readable strings with emoji', () => {
    expect(getWeatherConditionDesc(0)).toBe('Ясно ☀️');
    expect(getWeatherConditionDesc(1)).toBe('В основном ясно 🌤️');
    expect(getWeatherConditionDesc(2)).toBe('Переменная облачность ⛅');
    expect(getWeatherConditionDesc(3)).toBe('Пасмурно ☁️');
    expect(getWeatherConditionDesc(45)).toBe('Туман 🌫️');
    expect(getWeatherConditionDesc(61)).toBe('Дождь 🌧️');
    expect(getWeatherConditionDesc(71)).toBe('Снег ❄️');
    expect(getWeatherConditionDesc(95)).toBe('Гроза ⛈️');
  });

  it('generates appropriate clothing advice based on temperature and precipitation', () => {
    const freezing = getClothingAdvice(-5, 0, 0);
    expect(freezing).toContain('пуховик');

    const coolWithRain = getClothingAdvice(12, 60, 61);
    expect(coolWithRain).toContain('худи');
    expect(coolWithRain).toContain('зонт');

    const warm = getClothingAdvice(24, 5, 0);
    expect(warm).toContain('футболка');
    expect(warm).not.toContain('зонт');
  });

  it('builds complete morning weather message with dot after student name', async () => {
    const mockDb = {
      prepare(sql: string) {
        return {
          bind(..._args: any[]) {
            return this;
          },
          async first() {
            if (sql.includes('FROM settings')) {
              return {
                first_name: 'Александр',
                daily_wishes: 1,
                sleep_hours: 8,
                travel_minutes: 35,
              };
            }
            return null;
          },
          async all() {
            return { results: [], meta: {} };
          },
        };
      },
    };

    const mockEnv: any = {
      DB: mockDb,
      BOT_TOKEN: 'test',
    };

    // Mock fetch for Open-Meteo
    const mockWeather = {
      current: {
        temperature_2m: 14.2,
        apparent_temperature: 13.5,
        weather_code: 1,
        wind_speed_10m: 12,
      },
      hourly: {
        temperature_2m: Array(24).fill(15),
        apparent_temperature: Array(24).fill(14),
        precipitation_probability: Array(24).fill(10),
        weather_code: Array(24).fill(1),
      },
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('open-meteo')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockWeather,
        });
      }
      return originalFetch(url);
    });

    try {
      const msg = await buildMorningWeatherMessage(mockEnv, 'user-123', '2026-10-08', 'Александр');

      // Verify dot after name
      expect(msg).toContain('Доброе утро, Александр.');
      // Verify all required sections
      expect(msg).toContain('Сейчас (07:00)');
      expect(msg).toContain('На время выхода');
      expect(msg).toContain('Что надеть');
      expect(msg).toContain('Пожелание на день');
      expect(msg).not.toContain('без спешки');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
