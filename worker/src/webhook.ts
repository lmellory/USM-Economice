import { sectionForText, inlineSections, sectionReply, miniAppBase } from './bot-menu.js';
import { dateShift, toChisinauDate } from '@usm/shared';
import { json } from './homework.js';
import { buildEveningDigest, buildMorningWeatherMessage, telegram } from './notifications.js';
import { Env } from './types.js';

export async function handleWebhook(request: Request, env: Env): Promise<Response> {
  if (
    !env.TELEGRAM_WEBHOOK_SECRET ||
    request.headers.get('x-telegram-bot-api-secret-token') !== env.TELEGRAM_WEBHOOK_SECRET
  ) {
    return json({ error: 'Forbidden' }, 403);
  }

  const update: any = await request.json();
  const m = update.message;
  if (!m?.from?.id || m.chat?.type !== 'private' || String(m.chat.id) !== String(m.from.id))
    return json({ ok: true });

  if (
    /^\/start(?:@[A-Za-z0-9_]+)?(?:\s|$)/.test(m?.text || '') &&
    m.from?.id &&
    m.chat?.type === 'private' &&
    String(m.chat.id) === String(m.from.id)
  ) {
    const url = miniAppBase(env.MINI_APP_URL, new URL(request.url).origin);
    const reply = {
      chat_id: m.chat.id,
      text: 'USM | Economice 💚\n\nПары, задания и подготовка к экзаменам — всё под рукой. Для прямого входа выбери раздел под следующим сообщением. Клавиатура внизу тоже поможет открыть нужный раздел.\n\n/weather — погода и что надеть\n/plan — план на завтра',
      reply_markup: botKeyboard(),
    };
    await telegram(env, 'sendMessage', reply, { keep: true });
    await telegram(
      env,
      'sendMessage',
      { chat_id: m.chat.id, text: 'Открыть USM | Economice:', reply_markup: inlineSections(url) },
      { keep: true }
    );
    return json({ ok: true });
  }

  const section = sectionForText(m.text);
  if (section) {
    const url = miniAppBase(env.MINI_APP_URL, new URL(request.url).origin);
    await telegram(env, 'sendMessage', { chat_id: m.chat.id, ...sectionReply(section, url) });
    return json({ ok: true });
  }

  if (
    (m?.text === '/weather' || m?.text === '/погода') &&
    m.from?.id &&
    m.chat?.type === 'private'
  ) {
    const today = toChisinauDate(new Date());
    const chParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Chisinau',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const curHour = Number(chParts.find((p) => p.type === 'hour')?.value || 0);

    const weatherMsg = await buildMorningWeatherMessage(
      env,
      String(m.from.id),
      today,
      m.from.first_name,
      curHour
    );
    if (weatherMsg) {
      await telegram(env, 'sendMessage', { chat_id: m.chat.id, text: weatherMsg });
    }
    return json({ ok: true });
  }

  if ((m?.text === '/digest' || m?.text === '/plan') && m.from?.id && m.chat?.type === 'private') {
    const tomorrow = dateShift(toChisinauDate(new Date()), 1);
    const digestMsg = await buildEveningDigest(env, String(m.from.id), tomorrow);
    if (digestMsg) {
      await telegram(env, 'sendMessage', { chat_id: m.chat.id, text: digestMsg });
    }
    return json({ ok: true });
  }

  return json({ ok: true });
}

export function botKeyboard() {
  return {
    keyboard: [['📅 Сегодня', '🎓 Расписание'], ['📚 Сроки', '📝 Учёба'], ['⚙️ Настройки']],
    resize_keyboard: true,
    is_persistent: true,
    one_time_keyboard: false,
    input_field_placeholder: 'Выбери раздел или напиши команду',
  };
}
