export type MenuSection = 'home' | 'schedule' | 'hw' | 'study' | 'settings';
const labels: Record<MenuSection, string> = {
  home: '📅 Сегодня',
  schedule: '🎓 Расписание',
  hw: '📚 Сроки',
  study: '📝 Учёба',
  settings: '⚙️ Настройки',
};
export function miniAppBase(configured: string | undefined, origin: string): string {
  try {
    const url = new URL(configured || '');
    if (url.protocol === 'https:' && !['t.me', 'telegram.me'].includes(url.hostname))
      return url.toString();
  } catch {}
  return origin;
}
export function sectionForText(text: unknown): MenuSection | null {
  if (typeof text !== 'string') return null;
  const normalized = text.trim();
  const aliases: Record<string, MenuSection> = {
    '/today': 'home',
    Сегодня: 'home',
    '/schedule': 'schedule',
    Расписание: 'schedule',
    '/homework': 'hw',
    '/hw': 'hw',
    '📚 ДЗ': 'hw',
    Сроки: 'hw',
    ДЗ: 'hw',
    '/study': 'study',
    Учёба: 'study',
    '/settings': 'settings',
    Настройки: 'settings',
  };
  for (const [section, label] of Object.entries(labels))
    if (normalized === label) return section as MenuSection;
  return aliases[normalized] || null;
}
function button(base: string, view: MenuSection, text = labels[view]) {
  const url = new URL(base);
  url.searchParams.set('view', view);
  return { text, web_app: { url: url.toString() } };
}
export function inlineSections(base: string) {
  return {
    inline_keyboard: [
      [button(base, 'home'), button(base, 'schedule')],
      [button(base, 'hw'), button(base, 'study')],
      [button(base, 'settings')],
    ],
  };
}
export function sectionReply(section: MenuSection, base: string) {
  const titles = {
    home: 'твой день',
    schedule: 'расписание',
    hw: 'домашние задания',
    study: 'контрольные и экзамены',
    settings: 'настройки',
  };
  return {
    text: `${labels[section]}\n\nКнопка ниже откроет ${titles[section]} в приложении.`,
    reply_markup: { inline_keyboard: [[button(base, section, 'Открыть ' + titles[section])]] },
  };
}
