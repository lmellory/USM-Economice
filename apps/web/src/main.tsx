import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BookOpen, CalendarDays, CircleAlert, GraduationCap, Settings, X } from 'lucide-react';
import './style.css';
import './telegram.css';
import './dark.css';
import './pink.css';

import { applyTheme, request, tg, vibrate } from './lib/api.js';
import {
  baseSchedule,
  calculateMorningRoutine,
  calculateWeekParity,
  ClassItem,
  dayNames,
  getDaySchedule,
  ScheduleException,
} from './lib/plan.js';
import { dateParts, dateShift, localNoon, TZ } from './lib/time.js';

import { ClassModal } from './components/ClassModal.js';
import { ExceptionModal } from './components/ExceptionModal.js';
import { HomeView } from './components/HomeView.js';
import { HomeworkModal } from './components/HomeworkModal.js';
import { HomeworkView } from './components/HomeworkView.js';
import { ScheduleView } from './components/ScheduleView.js';
import { SettingsView } from './components/SettingsView.js';

function getNowMinutes(): number {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const h = Number(f.find((x) => x.type === 'hour')?.value || 0);
  const m = Number(f.find((x) => x.type === 'minute')?.value || 0);
  return h * 60 + m;
}

export function App() {
  const [view, setView] = useState<'home' | 'schedule' | 'hw' | 'settings'>('home');
  const [selected, setSelected] = useState(new Date());
  const [weekOffset, setWeekOffset] = useState(0);
  const [hw, setHw] = useState<any[]>([]);
  const [schedule, setSchedule] = useState<ClassItem[]>(baseSchedule);
  const [exceptions, setExceptions] = useState<ScheduleException[]>([]);
  const [settings, setSettings] = useState<any>({
    theme: (typeof localStorage !== 'undefined' && localStorage.getItem('usm_theme')) || 'light',
    sleep_hours: 8,
    sleep_latency: 15,
    wash_minutes: 20,
    hair_dry_minutes: 5,
    breakfast_minutes: 30,
    get_ready_minutes: 10,
    travel_buffer: 10,
    travel_minutes: 35,
    target_bedtime: '00:15',
    english_duration: 60,
    semester_start: null,
    first_week_parity: null,
    reminders_enabled: false,
    reminder_minutes: 60,
    leave_reminder: false,
  });
  const [transit, setTransit] = useState<any>({
    available: false,
    estimateMinutes: 35,
    note: 'Загрузка…',
  });
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [classModal, setClassModal] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassItem | null>(null);
  const [classModalInitialDay, setClassModalInitialDay] = useState(1);
  const [exceptionModal, setExceptionModal] = useState(false);
  const [selectedExceptionClass, setSelectedExceptionClass] = useState<ClassItem | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('На сегодня');
  const [nowMinutes, setNowMinutes] = useState(getNowMinutes);

  useEffect(() => {
    const timer = setInterval(() => setNowMinutes(getNowMinutes()), 15000);
    return () => clearInterval(timer);
  }, []);

  const selectedInfo = dateParts(selected);
  const todayKey = dateParts(new Date()).key;

  useEffect(() => {
    if (tg) {
      tg.ready();
      tg.expand();
    }

    const loadBootstrap = async () => {
      try {
        const data = await request('/api/bootstrap');
        setSettings(data.settings);
        setSchedule(data.classes || data.schedule || baseSchedule);
        setExceptions(data.exceptions || []);
        setHw(
          data.homework.map((x: any) => ({
            ...x,
            completed: x.completed,
            dueAt: x.due_at,
            dueDate: x.due_date,
            telegramReminder: x.telegram_reminder,
          }))
        );
        setTransit(data.transit);
      } catch (e: any) {
        if (tg?.initData) setError(e.message);
        else
          setError(
            'Открой приложение через Telegram-бота. В режиме предпросмотра сохранение недоступно.'
          );
      } finally {
        setReady(true);
      }
    };

    loadBootstrap();

    const transitTimer = setInterval(() => {
      request('/api/transit')
        .then(setTransit)
        .catch(() => {});
    }, 60000);

    return () => clearInterval(transitTimer);
  }, []);

  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    const back = tg?.BackButton;
    if (!back) return;
    const handleBack = () => {
      if (modal) {
        setModal(false);
        setEditing(null);
      } else if (classModal) {
        setClassModal(false);
        setEditingClass(null);
      } else if (exceptionModal) {
        setExceptionModal(false);
        setSelectedExceptionClass(null);
      } else {
        setView('home');
      }
    };

    const hasOpenModal = modal || classModal || exceptionModal;
    if (view === 'home' && !hasOpenModal) back.hide();
    else back.show();

    back.onClick(handleBack);
    return () => back.offClick(handleBack);
  }, [view, modal, classModal, exceptionModal]);

  const scheduleFor = (d: Date) => {
    const p = dateParts(d);
    const parity = calculateWeekParity(p.key, settings.semester_start, settings.first_week_parity);
    return getDaySchedule(schedule, p.weekday, parity, exceptions, p.key);
  };

  const daySchedule = scheduleFor(selected);

  const weekStart = useMemo(() => {
    const d = localNoon(todayKey);
    const dayShift = -(dateParts(new Date()).weekday - 1 - weekOffset * 7);
    d.setUTCDate(d.getUTCDate() + dayShift);
    return d;
  }, [todayKey, weekOffset]);

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * 86400000)),
    [weekStart]
  );

  const deadlines = hw.filter((x) => !x.completed && x.due_date);
  const dayTasks = hw.filter((x) => !x.completed && x.due_date === selectedInfo.key);
  const nextTasks = hw
    .filter((x) => !x.completed && x.due_date)
    .sort((a, b) => String(a.due_at || a.due_date).localeCompare(String(b.due_at || b.due_date)))
    .slice(0, 3);

  const studyWeekLabel = daySchedule.parity
    ? `Неделя ${daySchedule.parity === 'odd' ? 'нечётная' : 'чётная'}`
    : 'Неделя не настроена';

  const routine = useMemo(
    () => calculateMorningRoutine(daySchedule.classes, settings, transit.estimateMinutes),
    [daySchedule.classes, settings, transit.estimateMinutes]
  );

  const saveSettings = async (patch: any) => {
    setSettings((s: any) => ({ ...s, ...patch }));
    try {
      const saved = await request('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
      setSettings(saved);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const saveHw = async (body: any) => {
    try {
      const saved = await request(body.id ? `/api/homework/${body.id}` : '/api/homework', {
        method: body.id ? 'PUT' : 'POST',
        body: JSON.stringify(body),
      });
      const mapped = {
        ...saved,
        dueAt: saved.due_at,
        dueDate: saved.due_date,
        telegramReminder: saved.telegram_reminder,
      };
      setHw((all) =>
        body.id ? all.map((x) => (x.id === body.id ? mapped : x)) : [mapped, ...all]
      );
      setModal(false);
      setEditing(null);
      vibrate();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const toggleDone = async (item: any) => {
    try {
      const saved = await request(`/api/homework/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({ completed: !item.completed }),
      });
      setHw((all) =>
        all.map((x) =>
          x.id === item.id ? { ...x, ...saved, dueAt: saved.due_at, dueDate: saved.due_date } : x
        )
      );
      vibrate();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const saveClass = async (payload: Partial<ClassItem>) => {
    try {
      const saved = await request(payload.id ? `/api/classes/${payload.id}` : '/api/classes', {
        method: payload.id ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      setSchedule((prev) =>
        payload.id ? prev.map((c) => (c.id === payload.id ? saved : c)) : [...prev, saved]
      );
      setClassModal(false);
      setEditingClass(null);
      vibrate();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const deleteClass = async (id: string) => {
    try {
      await request(`/api/classes/${id}`, { method: 'DELETE' });
      setSchedule((prev) => prev.filter((c) => c.id !== id));
      setExceptions((prev) => prev.filter((e) => e.class_id !== id));
      setClassModal(false);
      setEditingClass(null);
      vibrate();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const saveException = async (payload: any) => {
    try {
      const saved = await request('/api/schedule-exceptions', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setExceptions((prev) => {
        const filtered = prev.filter(
          (e) => !(e.class_id === saved.class_id && e.date === saved.date)
        );
        return [...filtered, saved];
      });
      setExceptionModal(false);
      setSelectedExceptionClass(null);
      vibrate();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const deleteException = async (id: string) => {
    try {
      await request(`/api/schedule-exceptions/${id}`, { method: 'DELETE' });
      setExceptions((prev) => prev.filter((e) => e.id !== id));
      setExceptionModal(false);
      setSelectedExceptionClass(null);
      vibrate();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const openHw = (item: any = null) => {
    setEditing(item);
    setModal(true);
    vibrate();
  };

  const openClassModal = (day = 1, item: ClassItem | null = null) => {
    setClassModalInitialDay(day);
    setEditingClass(item);
    setClassModal(true);
    vibrate();
  };

  const openExceptionModal = (item: ClassItem) => {
    setSelectedExceptionClass(item);
    setExceptionModal(true);
    vibrate();
  };

  const navigate = (v: any) => {
    setView(v);
    vibrate();
  };

  return (
    <main className="app">
      <header className="top">
        <div className="brand">
          <div className="brand-mark">
            <CalendarDays size={19} />
          </div>
          <span>тихий план</span>
        </div>
        <button
          type="button"
          className="avatar"
          onClick={() => navigate('settings')}
          aria-label="Настройки"
        >
          А
        </button>
      </header>

      {view === 'settings' ? (
        <SettingsView
          settings={settings}
          transit={transit}
          save={saveSettings}
          onBack={() => navigate('home')}
        />
      ) : view === 'schedule' ? (
        <ScheduleView
          schedule={schedule}
          exceptions={exceptions}
          onAddClass={(day) => openClassModal(day, null)}
          onEditClass={(item) => openClassModal(item.day, item)}
          onDeleteClass={deleteClass}
          onDeleteException={deleteException}
          vibrate={vibrate}
        />
      ) : view === 'hw' ? (
        <HomeworkView
          items={hw}
          tab={tab}
          setTab={setTab}
          onAdd={() => openHw()}
          onEdit={openHw}
          onDone={toggleDone}
        />
      ) : (
        <HomeView
          selected={selected}
          setSelected={setSelected}
          weekOffset={weekOffset}
          setWeekOffset={setWeekOffset}
          weekDates={weekDates}
          todayKey={todayKey}
          selectedInfo={selectedInfo}
          daySchedule={daySchedule}
          studyWeekLabel={studyWeekLabel}
          settings={settings}
          transit={transit}
          routine={routine}
          nowMinutes={nowMinutes}
          dayTasks={dayTasks}
          nextTasks={nextTasks}
          deadlines={deadlines}
          dayNames={dayNames}
          navigate={navigate}
          vibrate={vibrate}
          onOpenExceptionModal={openExceptionModal}
          onDeleteException={deleteException}
        />
      )}

      <nav className="bottom-nav">
        <button
          type="button"
          className={view === 'home' ? 'active' : ''}
          onClick={() => navigate('home')}
        >
          <CalendarDays size={20} />
          <span>День</span>
        </button>
        <button
          type="button"
          className={view === 'schedule' ? 'active' : ''}
          onClick={() => navigate('schedule')}
        >
          <GraduationCap size={20} />
          <span>Пары</span>
        </button>
        <button
          type="button"
          className={view === 'hw' ? 'active homework-nav' : ''}
          onClick={() => navigate('hw')}
        >
          <span className="nav-icon">
            <BookOpen size={20} />
            {hw.some((x) => !x.completed && x.due_date === todayKey) && <i />}
          </span>
          <span>ДЗ</span>
        </button>
        <button
          type="button"
          className={view === 'settings' ? 'active' : ''}
          onClick={() => navigate('settings')}
        >
          <Settings size={20} />
          <span>Настройки</span>
        </button>
      </nav>

      {modal && (
        <HomeworkModal
          item={editing}
          reminderMinutes={settings.reminder_minutes ?? 60}
          onClose={() => {
            setModal(false);
            setEditing(null);
          }}
          onSave={saveHw}
        />
      )}

      {classModal && (
        <ClassModal
          item={editingClass}
          initialDay={classModalInitialDay}
          onClose={() => {
            setClassModal(false);
            setEditingClass(null);
          }}
          onSave={saveClass}
          onDelete={deleteClass}
        />
      )}

      {exceptionModal && selectedExceptionClass && (
        <ExceptionModal
          classItem={selectedExceptionClass}
          date={selectedInfo.key}
          existingException={
            exceptions.find(
              (e) => e.class_id === selectedExceptionClass.id && e.date === selectedInfo.key
            ) || null
          }
          onClose={() => {
            setExceptionModal(false);
            setSelectedExceptionClass(null);
          }}
          onSave={saveException}
          onDelete={deleteException}
        />
      )}

      {error && (
        <div className="toast" onClick={() => setError('')}>
          <CircleAlert size={15} />
          {error}
          <X size={14} />
        </div>
      )}

      {ready && (
        <div className="tiny-footer">
          Данные хранятся приватно ·{' '}
          {transit.checkedAt
            ? `Транспорт проверен ${new Intl.DateTimeFormat('ru-RU', {
                timeZone: TZ,
                hour: '2-digit',
                minute: '2-digit',
              }).format(new Date(transit.checkedAt))}`
            : 'Ожидаем проверку транспорта'}
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
