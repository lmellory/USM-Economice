import { initialView } from './lib/entry-view.js';
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { BookOpen, CalendarDays, CircleAlert, GraduationCap, ClipboardList, X } from 'lucide-react';
import './style.css';
import './telegram.css';
import './dark.css';
import './pink.css';
import './improvements.css';
import './study.css';
import './home-calm.css';
import { Assessment, AssessmentInput } from '@usm/shared';
import { installViewportControls } from './lib/viewport.js';
import { AssessmentModal } from './components/AssessmentModal.js';
import { StudyView } from './components/StudyView.js';

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
import { DeadlinesView } from './components/DeadlinesView.js';
import { nextSubjectClass } from './lib/deadlines.js';
import './deadlines.css';
import { ScheduleView } from './components/ScheduleView.js';
import { SettingsView } from './components/SettingsView.js';
import { AdminView } from './components/AdminView.js';

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

export const DEFAULT_APP_SETTINGS = {
  theme: (() => {
    try {
      return localStorage.getItem('usm_theme') || 'light';
    } catch {
      return 'light';
    }
  })(),
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
};

export function App() {
  const [view, setView] = useState<'home' | 'schedule' | 'hw' | 'study' | 'settings' | 'admin'>(
    () => initialView(window.location.search)
  );
  const [isAdmin, setIsAdmin] = useState(false);
  const [selected, setSelected] = useState(new Date());
  const [weekOffset, setWeekOffset] = useState(0);
  const [hw, setHw] = useState<any[]>([]);
  const [schedule, setSchedule] = useState<ClassItem[]>(baseSchedule);
  const [exceptions, setExceptions] = useState<ScheduleException[]>([]);
  const [settings, setSettings] = useState<any>(DEFAULT_APP_SETTINGS);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [assessmentModal, setAssessmentModal] = useState(false);
  const [editingAssessment, setEditingAssessment] = useState<Assessment | null>(null);
  const assessmentLocks = useRef(new Set<string>());
  const [assessmentBusy, setAssessmentBusy] = useState(new Set<string>());
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [homeworkDraft, setHomeworkDraft] = useState<{
    subject: string;
    dueDate: string;
    dueTime: string;
  } | null>(null);
  const [classModal, setClassModal] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassItem | null>(null);
  const [classModalInitialDay, setClassModalInitialDay] = useState(1);
  const [exceptionModal, setExceptionModal] = useState(false);
  const [selectedExceptionClass, setSelectedExceptionClass] = useState<ClassItem | null>(null);
  const [ready, setReady] = useState(false);
  const [bootstrapFailed, setBootstrapFailed] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('Все');
  const [nowMinutes, setNowMinutes] = useState(getNowMinutes);
  const settingsQueue = useRef<Promise<void>>(Promise.resolve());
  const confirmedSettings = useRef<any>(DEFAULT_APP_SETTINGS);
  const pendingSettings = useRef(new Map<number, any>());
  const settingsRevision = useRef(0);
  const [settingsSaveState, setSettingsSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle'
  );
  const previousViewRef = useRef<'home' | 'schedule' | 'hw' | 'study'>('home');

  const tgUser = tg?.initDataUnsafe?.user;
  const userPhotoUrl = tgUser?.photo_url;
  const userDisplayName = tgUser?.first_name
    ? `${tgUser.first_name}${tgUser.last_name ? ` ${tgUser.last_name}` : ''}`
    : 'Студент USM';
  const avatarLetter = (tgUser?.first_name?.trim()[0] || 'А').toUpperCase();

  useEffect(() => installViewportControls(), []);

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
      try {
        if (typeof tg.disableVerticalSwipes === 'function') {
          tg.disableVerticalSwipes();
        }
      } catch {
        // Fallback for older Telegram clients
      }
    }

    const loadBootstrap = async () => {
      try {
        const data = await request('/api/bootstrap');
        if (data?.settings && typeof data.settings === 'object') {
          confirmedSettings.current = { ...DEFAULT_APP_SETTINGS, ...data.settings };
          setSettings(confirmedSettings.current);
        }
        setSchedule(data?.classes || data?.schedule || baseSchedule);
        setExceptions(data?.exceptions || []);
        setAssessments(data?.assessments || []);
        if (Array.isArray(data?.homework)) {
          setHw(
            data.homework.map((x: any) => ({
              ...x,
              completed: x.completed,
              dueAt: x.due_at,
              dueDate: x.due_date,
              telegramReminder: x.telegram_reminder,
            }))
          );
        }

        if (data?.isAdmin != null) {
          setIsAdmin(Boolean(data.isAdmin));
        }
      } catch (e: any) {
        setBootstrapFailed(true);
        if (tg?.initData) setError(e.message);
        else
          setError(
            'Этот способ запуска не передаёт Telegram-сессию. Отправь боту /start и открой раздел кнопкой под приветственным сообщением.'
          );
      } finally {
        setReady(true);
      }
    };

    loadBootstrap();
  }, []);

  useEffect(() => {
    applyTheme(settings?.theme || 'light');
  }, [settings?.theme]);

  useEffect(() => {
    const back = tg?.BackButton;
    if (!back) return;

    const handleBack = () => {
      vibrate();
      if (modal) {
        setModal(false);
        setEditing(null);
      } else if (classModal) {
        setClassModal(false);
        setEditingClass(null);
      } else if (exceptionModal) {
        setExceptionModal(false);
        setSelectedExceptionClass(null);
      } else if (assessmentModal) {
        if (assessmentLocks.current.size) return;
        setAssessmentModal(false);
        setEditingAssessment(null);
      } else if (view === 'admin') {
        setView('settings');
      } else if (view === 'settings') {
        setView(previousViewRef.current || 'home');
      }
    };

    const hasOpenModal = modal || classModal || exceptionModal || assessmentModal;
    const shouldShow = view === 'settings' || view === 'admin' || hasOpenModal;

    if (shouldShow) {
      back.show();
    } else {
      back.hide();
    }

    back.onClick(handleBack);
    return () => back.offClick(handleBack);
  }, [view, modal, classModal, exceptionModal, assessmentModal]);

  const scheduleFor = (d: Date) => {
    const p = dateParts(d);
    const safe = settings || DEFAULT_APP_SETTINGS;
    const parity = calculateWeekParity(p.key, safe.semester_start, safe.first_week_parity);
    return getDaySchedule(schedule, p.weekday, parity, exceptions, p.key);
  };

  const daySchedule = scheduleFor(selected);
  const tomorrowKey = dateShift(todayKey, 1);
  const tomorrowSchedule = scheduleFor(localNoon(tomorrowKey));
  const tomorrowRoutine = calculateMorningRoutine(
    tomorrowSchedule.classes,
    settings,
    settings.travel_minutes ?? 35
  );

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
  const studyWeekLabel = daySchedule.parity
    ? `Неделя ${daySchedule.parity === 'odd' ? 'нечётная' : 'чётная'}`
    : 'Неделя не настроена';

  const routine = useMemo(() => {
    const safe = settings || DEFAULT_APP_SETTINGS;
    return calculateMorningRoutine(daySchedule.classes, safe, settings.travel_minutes ?? 35);
  }, [daySchedule.classes, settings]);

  const saveSettings = (patch: any): Promise<void> => {
    const revision = ++settingsRevision.current;
    pendingSettings.current.set(revision, patch);
    setSettings((previous: any) => ({ ...previous, ...patch }));
    setSettingsSaveState('saving');
    const rebuildSettings = () => {
      const next = { ...confirmedSettings.current };
      for (const pending of pendingSettings.current.values()) Object.assign(next, pending);
      setSettings(next);
    };
    const operation = settingsQueue.current.then(async () => {
      try {
        confirmedSettings.current = await request('/api/settings', {
          method: 'PUT',
          body: JSON.stringify(patch),
        });
        pendingSettings.current.delete(revision);
        rebuildSettings();
        if (revision === settingsRevision.current) setSettingsSaveState('saved');
      } catch (e: any) {
        pendingSettings.current.delete(revision);
        rebuildSettings();
        if (revision === settingsRevision.current) setSettingsSaveState('error');
        setError(e.message);
      }
    });
    settingsQueue.current = operation.catch(() => {});
    return operation;
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
    setHomeworkDraft(null);
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

  const navigate = (v: 'home' | 'schedule' | 'hw' | 'study' | 'settings', homeworkTab?: string) => {
    vibrate();
    if (view !== 'settings' && view !== 'admin') {
      previousViewRef.current = view;
    }
    if (v === 'hw' && homeworkTab) setTab(homeworkTab);
    setView(v);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveAssessment = async (
    input: AssessmentInput & { id?: string },
    close = false
  ): Promise<void> => {
    const key = input.id || 'new';
    if (assessmentLocks.current.has(key)) return;
    assessmentLocks.current.add(key);
    setAssessmentBusy(new Set(assessmentLocks.current));
    try {
      const saved: Assessment = await request(
        input.id ? `/api/assessments/${input.id}` : '/api/assessments',
        {
          method: input.id ? 'PUT' : 'POST',
          body: JSON.stringify(input),
        }
      );
      setAssessments((all) =>
        input.id ? all.map((x) => (x.id === input.id ? saved : x)) : [...all, saved]
      );
      if (close) {
        setAssessmentModal(false);
        setEditingAssessment(null);
      }
      vibrate();
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      assessmentLocks.current.delete(key);
      setAssessmentBusy(new Set(assessmentLocks.current));
    }
  };
  const deleteAssessment = async (id: string) => {
    await request(`/api/assessments/${id}`, { method: 'DELETE' });
    setAssessments((all) => all.filter((x) => x.id !== id));
    setAssessmentModal(false);
    setEditingAssessment(null);
    vibrate();
  };
  const openAssessment = (item: Assessment | null = null) => {
    if (item && assessmentLocks.current.has(item.id)) return;
    setEditingAssessment(item);
    setAssessmentModal(true);
    vibrate();
  };
  const nextClassFor = (subject: string) =>
    nextSubjectClass(schedule, exceptions, settings, subject, new Date());
  const addHomeworkForClass = (item: ClassItem) => {
    const next = nextClassFor(item.title);
    setEditing(null);
    setHomeworkDraft({ subject: item.title, dueDate: next?.date || '', dueTime: next?.time || '' });
    setModal(true);
    vibrate();
  };

  if (!ready)
    return (
      <main className="app loading-screen" aria-busy="true">
        <h1>USM | Economice</h1>
        <p>Загружаем твой день…</p>
      </main>
    );
  if (bootstrapFailed)
    return (
      <main className="app loading-screen">
        <h1>Не удалось загрузить данные</h1>
        <p role="alert">{error}</p>
        {!tg?.initData && (
          <a
            className="primary-btn telegram-reopen"
            href="https://t.me/USM_Economice_anul_anbot?start=menu"
          >
            Перейти к боту и обновить меню
          </a>
        )}
        <button type="button" className="primary-btn" onClick={() => window.location.reload()}>
          Попробовать ещё раз
        </button>
      </main>
    );

  return (
    <main className={`app view-${view}`}>
      <header className="top">
        <div className="brand">
          <div className="brand-mark">
            <CalendarDays size={19} />
          </div>
          <span>USM | Economice</span>
        </div>
        <button
          type="button"
          className="avatar"
          onClick={() => navigate('settings')}
          aria-label="Настройки профиля"
          title={userDisplayName}
        >
          {userPhotoUrl ? (
            <>
              <img
                src={userPhotoUrl}
                alt={userDisplayName}
                className="avatar-img"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              <span className="avatar-fallback">{avatarLetter}</span>
            </>
          ) : (
            <span className="avatar-fallback">{avatarLetter}</span>
          )}
          {isAdmin && (
            <span className="header-admin-crown" title="Администратор">
              👑
            </span>
          )}
        </button>
      </header>

      {view === 'admin' ? (
        <AdminView
          onBack={() => {
            vibrate();
            setView('settings');
          }}
        />
      ) : view === 'settings' ? (
        <SettingsView
          settings={settings}
          saveState={settingsSaveState}
          save={saveSettings}
          onBack={() => {
            vibrate();
            setView(previousViewRef.current || 'home');
          }}
          isAdmin={isAdmin}
          onOpenAdmin={() => {
            vibrate();
            setView('admin');
          }}
        />
      ) : view === 'schedule' ? (
        <ScheduleView
          onAddHomework={addHomeworkForClass}
          schedule={schedule}
          exceptions={exceptions}
          onAddClass={(day) => openClassModal(day, null)}
          onEditClass={(item) => openClassModal(item.day, item)}
          onDeleteClass={deleteClass}
          onDeleteException={deleteException}
          vibrate={vibrate}
        />
      ) : view === 'hw' ? (
        <DeadlinesView
          homework={hw}
          assessments={assessments}
          tab={tab}
          setTab={setTab}
          onAddHomework={() => openHw()}
          onAddEvent={() => openAssessment()}
          onEditHomework={openHw}
          onEditEvent={openAssessment}
          onDoneHomework={toggleDone}
          onDoneEvent={saveAssessment}
        />
      ) : view === 'study' ? (
        <StudyView
          items={assessments}
          schedule={schedule}
          homework={hw}
          busy={assessmentBusy}
          onAdd={() => openAssessment()}
          onEdit={openAssessment}
          onSave={saveAssessment}
          onHomework={() => navigate('hw')}
        />
      ) : (
        <HomeView
          onAddHomework={addHomeworkForClass}
          selected={selected}
          setSelected={setSelected}
          weekOffset={weekOffset}
          setWeekOffset={setWeekOffset}
          weekDates={weekDates}
          todayKey={todayKey}
          selectedInfo={selectedInfo}
          daySchedule={daySchedule}
          tomorrow={{
            key: tomorrowKey,
            classes: tomorrowSchedule.classes,
            routine: tomorrowRoutine,
          }}
          studyWeekLabel={studyWeekLabel}
          settings={settings}
          routine={routine}
          nowMinutes={nowMinutes}
          dayTasks={dayTasks}
          nextTasks={hw.filter((x) => !x.completed && x.due_date)}
          assessments={assessments}
          onOpenAssessment={openAssessment}
          onOpenHomework={openHw}
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
            {(hw.some((x) => !x.completed && x.due_date === todayKey) ||
              assessments.some((x) => !x.completed && x.date === todayKey)) && <i />}
          </span>
          <span>Сроки</span>
        </button>
        <button
          type="button"
          className={view === 'study' ? 'active study-nav' : ''}
          onClick={() => navigate('study')}
        >
          <ClipboardList size={20} />
          <span>Учёба</span>
        </button>
      </nav>

      {modal && (
        <HomeworkModal
          item={editing}
          draft={homeworkDraft}
          nextClassFor={nextClassFor}
          subjects={[...new Set(schedule.map((item) => item.title))]}
          reminderMinutes={settings.reminder_minutes ?? 60}
          remindersEnabled={Boolean(settings.reminders_enabled)}
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

      {assessmentModal && (
        <AssessmentModal
          item={editingAssessment}
          subjects={[...new Set(schedule.map((c) => c.title))]}
          onClose={() => {
            setAssessmentModal(false);
            setEditingAssessment(null);
          }}
          onSave={(input) => saveAssessment(input, true)}
          onDelete={deleteAssessment}
        />
      )}

      {error && (
        <div className="toast" onClick={() => setError('')}>
          <CircleAlert size={15} />
          {error}
          <X size={14} />
        </div>
      )}
    </main>
  );
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: any }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, info: any) {
    console.error('App render error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 24,
            textAlign: 'center',
            fontFamily: '-apple-system, sans-serif',
            color: '#111',
            paddingTop: '35vh',
          }}
        >
          <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>Что-то пошло не так</h3>
          <p style={{ color: '#ef4444', fontSize: 13, margin: '0 0 16px' }}>
            {this.state.error?.message || 'Неизвестная ошибка интерфейса'}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 20px',
              borderRadius: 10,
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Перезагрузить
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
