declare global {
  interface Window {
    Telegram?: any;
  }
}

export const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;
export const apiBase = import.meta.env.VITE_API_URL || '';

export async function request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const initData = tg?.initData || '';
  const response = await fetch(apiBase + path, {
    ...options,
    headers: {
      'content-type': 'application/json',
      'x-telegram-init-data': initData,
      ...options.headers,
    },
    signal:
      options.signal ??
      AbortSignal.timeout(path.startsWith('/api/admin/broadcast') ? 90000 : 20000),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error || 'Не удалось связаться с сервером. Попробуй ещё раз.';
    const requestId = payload.requestId ? ` · код ${payload.requestId}` : '';
    throw new Error(`${message}${requestId}`);
  }

  return payload as T;
}

export function vibrate(): void {
  try {
    tg?.HapticFeedback?.impactOccurred('light');
  } catch {
    // Ignore environments without haptics
  }
}

export function applyTheme(theme: string): void {
  const dark = theme === 'dark';
  const pink = theme === 'pink';

  document.body.classList.toggle('dark-theme', dark);
  document.body.classList.toggle('pink-theme', pink);

  const color = dark ? '#171b18' : pink ? '#fdf5f7' : tg?.themeParams?.bg_color || '#f6f5f1';

  try {
    tg?.setHeaderColor?.(color);
    tg?.setBackgroundColor?.(color);
  } catch {
    // Non-Telegram environment
  }

  try {
    if (theme) {
      localStorage.setItem('usm_theme', theme);
    }
  } catch {
    // Ignore storage restrictions
  }
}
