// 앱 상태. 영속 저장은 설정·선택 캘린더·앱 캘린더 ID뿐이고 항목은 캐시다 — 캘린더가 원본.
// 외부 의존 없이 useSyncExternalStore로 만든 작은 스토어.

import { useSyncExternalStore } from "react";
import * as api from "./api";
import type { CalendarEntry } from "./api";
import { MOCK_APP_ID, MOCK_TT_ID, mockItems } from "./api/mock";
import * as auth from "./auth";
import type { ISODate } from "./model/dates";
import { addDays, startOfWeek, todayKST } from "./model/dates";
import type { CheckItem, ExtEvent, Goal, Item } from "./model/items";
import { checkEventBody, classStatusBody, extDoneBody, fromEvent, goalEventBody } from "./model/items";
import type { ClassDef, ClassStatus } from "./model/timetable";
import { classMasterBody, defKey, oneOffClassBody, stripClassTitle } from "./model/timetable";
import type { Settings } from "./model/plan";
import { DEFAULT_SETTINGS, rolloverCandidates } from "./model/plan";

export interface State {
  signedIn: boolean;
  loading: boolean;
  error: string | null;
  calendars: CalendarEntry[];
  selectedCalendarIds: string[];
  appCalendarId: string | null;
  appCalendarName: string;
  timetableCalendarId: string | null;
  semester: { start: ISODate; end: ISODate };
  classes: ClassDef[]; // 시간표 캘린더의 master 목록 (읽기 캐시)
  exceptions: ExtEvent[]; // 상태가 정상이 아닌 수업 인스턴스 (학기 범위)
  settings: Settings;
  items: Record<string, Item>; // key = `${calendarId}|${id}`
  window: { from: ISODate; to: ISODate } | null; // 로드된 범위 [from, to)
}

const LS_KEY = "calcheck.v1";

interface Persisted {
  selectedCalendarIds: string[];
  appCalendarId: string | null;
  appCalendarName: string;
  timetableCalendarId: string | null;
  semester: { start: ISODate; end: ISODate };
  settings: Settings;
}

function defaultSemester(): { start: ISODate; end: ISODate } {
  // 3~8월이면 1학기(3/1~6/30), 아니면 2학기(9/1~12/31). 설정에서 바꾼다.
  const t = todayKST();
  const y = Number(t.slice(0, 4));
  const m = Number(t.slice(5, 7));
  return m >= 3 && m <= 8 ? { start: `${y}-03-01`, end: `${y}-06-30` } : m >= 9 ? { start: `${y}-09-01`, end: `${y}-12-31` } : { start: `${y - 1}-09-01`, end: `${y}-02-28` };
}

function loadPersisted(): Persisted {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Persisted>;
      return {
        selectedCalendarIds: p.selectedCalendarIds ?? [],
        appCalendarId: p.appCalendarId ?? null,
        appCalendarName: p.appCalendarName ?? "할 일",
        timetableCalendarId: p.timetableCalendarId ?? null,
        semester: p.semester ?? defaultSemester(),
        settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
      };
    }
  } catch {
    /* ignore */
  }
  return { selectedCalendarIds: [], appCalendarId: null, appCalendarName: "할 일", timetableCalendarId: null, semester: defaultSemester(), settings: DEFAULT_SETTINGS };
}

function savePersisted(s: State) {
  try {
    const p: Persisted = {
      selectedCalendarIds: s.selectedCalendarIds,
      appCalendarId: s.appCalendarId,
      appCalendarName: s.appCalendarName,
      timetableCalendarId: s.timetableCalendarId,
      semester: s.semester,
      settings: s.settings,
    };
    localStorage.setItem(LS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

const persisted = loadPersisted();
let state: State = {
  signedIn: false,
  loading: false,
  error: null,
  calendars: [],
  selectedCalendarIds: persisted.selectedCalendarIds,
  appCalendarId: persisted.appCalendarId,
  appCalendarName: persisted.appCalendarName,
  timetableCalendarId: persisted.timetableCalendarId,
  semester: persisted.semester,
  classes: [],
  exceptions: [],
  settings: persisted.settings,
  items: {},
  window: null,
};

const listeners = new Set<() => void>();
function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  savePersisted(state);
  listeners.forEach((l) => l());
}

export function useStore(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export const key = (calendarId: string, id: string) => `${calendarId}|${id}`;

// ---- selectors ----

export function selectChecks(s: State): CheckItem[] {
  return Object.values(s.items).filter((i): i is CheckItem => i.kind === "check");
}
export function selectGoals(s: State): Goal[] {
  return Object.values(s.items).filter((i): i is Goal => i.kind === "goal");
}
export function selectExt(s: State): ExtEvent[] {
  return Object.values(s.items).filter((i): i is ExtEvent => i.kind === "ext");
}

// ---- actions ----

function fail(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  set({ error: msg, loading: false });
}

export async function signIn(): Promise<void> {
  set({ error: null, loading: true });
  try {
    await auth.requestToken(true);
    set({ signedIn: true });
    await bootstrap();
  } catch (e) {
    fail(e);
  }
}

export async function signOut(): Promise<void> {
  await auth.signOut();
  set({ signedIn: false, items: {}, window: null, calendars: [] });
}

/** 로그인 직후: 캘린더 목록 → 앱 전용 캘린더 확보 → 기본 선택 → 오늘 주변 로드. */
async function bootstrap(): Promise<void> {
  const calendars = await api.listCalendars();
  let appId = state.appCalendarId;
  // 캐시된 ID가 목록에 없으면(지워졌거나 다른 계정) 이름으로 다시 찾고, 그래도 없으면 만든다.
  if (!appId || !calendars.some((c) => c.id === appId)) {
    const found = calendars.find((c) => c.summary === state.appCalendarName && c.accessRole === "owner");
    if (found) appId = found.id;
    else {
      const created = await api.insertCalendar(state.appCalendarName);
      calendars.push(created);
      appId = created.id;
    }
  }
  let ttId = state.timetableCalendarId;
  if (!ttId || !calendars.some((c) => c.id === ttId)) {
    ttId = calendars.find((c) => c.summary === TT_NAME && c.accessRole === "owner")?.id ?? null;
  }
  let selected = state.selectedCalendarIds.filter((id) => calendars.some((c) => c.id === id) && id !== appId && id !== ttId);
  if (selected.length === 0) {
    const primary = calendars.find((c) => c.primary);
    if (primary) selected = [primary.id];
  }
  set({ calendars, appCalendarId: appId, timetableCalendarId: ttId, selectedCalendarIds: selected });
  await Promise.all([loadAround(todayKST()), loadClasses()]);
}

const TT_NAME = "시간표";

/** anchor가 속한 주의 전주 월요일부터 4주를 읽는다. 오늘 뷰 ±와 주간 뷰 이번·다음 주를 덮는다. */
export async function loadAround(anchor: ISODate): Promise<void> {
  const from = addDays(startOfWeek(anchor), -7);
  const to = addDays(from, 35);
  await loadRange(from, to);
}

export async function loadRange(from: ISODate, to: ISODate): Promise<void> {
  const appId = state.appCalendarId;
  if (!appId) return;
  if (api.IS_MOCK) {
    // 목 모드: 심어 둔 항목을 비우지 않는다.
    set({ window: { from, to } });
    return;
  }
  set({ loading: true, error: null });
  try {
    const nameOf = new Map(state.calendars.map((c) => [c.id, c.summary]));
    const ttId = state.timetableCalendarId;
    const calIds = [appId, ...(ttId ? [ttId] : []), ...state.selectedCalendarIds];
    const results = await Promise.all(calIds.map((id) => api.listEvents(id, from, to)));
    const items: Record<string, Item> = {};
    calIds.forEach((calId, i) => {
      for (const ev of results[i]) {
        const it = fromEvent(ev, calId, appId, nameOf.get(calId), ttId);
        if (it) items[key(calId, it.id)] = it;
      }
    });
    // 앱 캘린더의 목표 중 범위 밖에서 시작했지만 아직 살아 있는 것은 listEvents가
    // 범위와 겹치는 한 포함한다(종일 이벤트가 범위에 걸치면 반환됨). 끝난 지 오래된 것은 안 온다.
    set({ items, window: { from, to }, loading: false });
    await rollover();
  } catch (e) {
    fail(e);
  }
}

export async function refresh(): Promise<void> {
  if (state.window) await loadRange(state.window.from, state.window.to);
  else await loadAround(todayKST());
}

/** 이월: 오늘보다 앞선 미완 체크 항목을 오늘로 옮긴다 (스펙 7절). 앱을 열 때가 유일한 시점. */
async function rollover(): Promise<void> {
  const today = todayKST();
  const cands = rolloverCandidates(selectChecks(state), today);
  for (const c of cands) {
    try {
      const moved: CheckItem = { ...c, date: today, rolled: c.rolled + 1 };
      const ev = await api.patchEvent(c.calendarId, c.id, {
        start: { date: today },
        end: { date: addDays(today, 1) },
        extendedProperties: { private: { rolled: String(moved.rolled) } },
      });
      set({ items: { ...state.items, [key(c.calendarId, c.id)]: { ...moved, etag: ev.etag } } });
    } catch (e) {
      fail(e);
    }
  }
}

function put(item: Item) {
  set({ items: { ...state.items, [key(item.calendarId, item.id)]: item } });
}
function remove(calendarId: string, id: string) {
  const items = { ...state.items };
  delete items[key(calendarId, id)];
  set({ items });
}

/** 낙관적 갱신: 화면 먼저 바꾸고 patch. 실패하면 원래대로 돌리고 에러 표시. */
async function optimistic(next: Item, prev: Item | null, work: () => Promise<{ etag?: string } | void>) {
  put(next);
  try {
    const r = await work();
    if (r && r.etag) put({ ...next, etag: r.etag });
  } catch (e) {
    if (prev) put(prev);
    else remove(next.calendarId, next.id);
    fail(e);
  }
}

export function toggleCheck(c: CheckItem) {
  const next = { ...c, done: !c.done };
  return optimistic(next, c, () =>
    api.patchEvent(c.calendarId, c.id, {
      summary: checkEventBody(next).summary,
      extendedProperties: { private: { done: next.done ? "1" : "0" } },
    }),
  );
}

export function toggleExt(e: ExtEvent) {
  const next = { ...e, done: !e.done };
  // 사용자 캘린더에는 private 속성만 쓴다. 제목·시간은 절대 보내지 않는다.
  return optimistic(next, e, () => api.patchEvent(e.calendarId, e.id, extDoneBody(next.done)));
}

export function setGoalCurrent(g: Goal, current: number) {
  const n = Math.max(0, Math.min(g.target, Math.round(current)));
  const next: Goal = { ...g, current: n, done: g.target > 0 && n >= g.target };
  const body = goalEventBody(next, todayKST());
  return optimistic(next, g, () =>
    api.patchEvent(g.calendarId, g.id, {
      summary: body.summary,
      extendedProperties: { private: { current: String(n), done: next.done ? "1" : "0" } },
    }),
  );
}

export async function createCheck(title: string, date: ISODate, parent?: string) {
  const appId = state.appCalendarId;
  if (!appId) return;
  set({ error: null });
  try {
    const body = checkEventBody({ kind: "check", title, date, done: false, rolled: 0, parent });
    const ev = await api.insertEvent(appId, body);
    put({ kind: "check", id: ev.id, calendarId: appId, title, date, done: false, rolled: 0, parent, etag: ev.etag });
  } catch (e) {
    fail(e);
  }
}

export async function createGoal(title: string, start: ISODate, due: ISODate, target: number, unit: string) {
  const appId = state.appCalendarId;
  if (!appId) return;
  set({ error: null });
  try {
    const g: Omit<Goal, "id" | "calendarId" | "etag"> = { kind: "goal", title, start, due, target, current: 0, unit, done: false };
    const ev = await api.insertEvent(appId, goalEventBody(g, todayKST()));
    put({ ...g, id: ev.id, calendarId: appId, etag: ev.etag });
  } catch (e) {
    fail(e);
  }
}

export function updateCheck(c: CheckItem, patch: { title?: string; date?: ISODate }) {
  const next: CheckItem = { ...c, ...patch };
  const body = checkEventBody(next);
  return optimistic(next, c, () => api.patchEvent(c.calendarId, c.id, { summary: body.summary, start: body.start, end: body.end }));
}

export function updateGoal(g: Goal, patch: { title?: string; start?: ISODate; due?: ISODate; target?: number; unit?: string }) {
  const merged: Goal = { ...g, ...patch };
  const next: Goal = { ...merged, current: Math.min(merged.current, merged.target), done: merged.target > 0 && merged.current >= merged.target };
  const body = goalEventBody(next, todayKST());
  return optimistic(next, g, () => api.patchEvent(g.calendarId, g.id, body));
}

export async function deleteItem(item: CheckItem | Goal) {
  const prev = item;
  remove(item.calendarId, item.id);
  try {
    await api.deleteEvent(item.calendarId, item.id);
  } catch (e) {
    put(prev);
    fail(e);
  }
}

export function setSettings(settings: Settings) {
  set({ settings });
}

export async function setSelectedCalendars(ids: string[]) {
  set({ selectedCalendarIds: ids });
  await refresh();
}

export function clearError() {
  set({ error: null });
}

// ---- 시간표 ----

function defFromMaster(ev: { id: string; summary?: string; location?: string; start: { dateTime?: string }; end: { dateTime?: string }; recurrence?: string[] }): ClassDef | null {
  if (!ev.start.dateTime || !ev.end.dateTime) return null;
  const toKst = (iso: string) => new Date(Date.parse(iso) + 9 * 3_600_000).toISOString();
  const st = toKst(ev.start.dateTime);
  const en = toKst(ev.end.dateTime);
  return { id: ev.id, title: ev.summary ?? "", day: new Date(st).getUTCDay(), start: st.slice(11, 16), end: en.slice(11, 16), room: ev.location };
}

/** 시간표 캘린더의 master 수업 목록 + 학기 내 상태 예외 인스턴스. */
export async function loadClasses(): Promise<void> {
  const ttId = state.timetableCalendarId;
  if (!ttId) {
    set({ classes: [], exceptions: [] });
    return;
  }
  try {
    const [masters, flagged] = await Promise.all([
      api.listMasters(ttId, { privateExtendedProperty: "kind=class" }),
      api.listEvents(ttId, state.semester.start, addDays(state.semester.end, 1), { privateExtendedProperty: "flag=1" }),
    ]);
    const classes = masters.filter((m) => m.recurrence && m.recurrence.length > 0).map(defFromMaster).filter((d): d is ClassDef => !!d);
    const exceptions = flagged
      .map((ev) => fromEvent(ev, ttId, state.appCalendarId ?? "", "시간표", ttId))
      .filter((i): i is ExtEvent => !!i && i.kind === "ext")
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.startTime ?? "").localeCompare(b.startTime ?? "")));
    set({ classes, exceptions });
  } catch (e) {
    fail(e);
  }
}

export function setSemester(sem: { start: ISODate; end: ISODate }) {
  set({ semester: sem });
}

/**
 * 편집기의 목록을 캘린더에 반영한다.
 * 키(제목+요일+시작)가 같은 수업은 그대로 두고, 사라진 것은 지우고, 새 것은 만든다.
 * 그대로 두는 이유: master를 다시 만들면 그 수업의 휴강·시험 표시(예외 인스턴스)가 전부 날아가기 때문.
 */
export async function syncTimetable(defs: ClassDef[]): Promise<{ added: number; removed: number; kept: number } | null> {
  set({ loading: true, error: null });
  try {
    let ttId = state.timetableCalendarId;
    if (!ttId) {
      const created = await api.insertCalendar(TT_NAME);
      ttId = created.id;
      set({ timetableCalendarId: ttId, calendars: [...state.calendars, created] });
    }
    const existing = new Map(state.classes.map((c) => [defKey(c), c]));
    const wanted = new Map(defs.map((d) => [defKey(d), d]));
    let added = 0, removed = 0, kept = 0;
    for (const [k, c] of existing) {
      if (!wanted.has(k) && c.id) {
        await api.deleteEvent(ttId, c.id);
        removed++;
      } else kept++;
    }
    for (const [k, d] of wanted) {
      const prev = existing.get(k);
      if (prev) {
        // 끝 시각·강의실만 바뀐 경우 patch
        if (prev.end !== d.end || (prev.room ?? "") !== (d.room ?? "")) {
          const body = classMasterBody(d, state.semester.start, state.semester.end);
          await api.patchEvent(ttId, prev.id!, { location: body.location ?? "", end: body.end, start: body.start });
        }
        continue;
      }
      await api.insertEvent(ttId, classMasterBody(d, state.semester.start, state.semester.end));
      added++;
    }
    set({ loading: false });
    await Promise.all([loadClasses(), refresh()]);
    return { added, removed, kept };
  } catch (e) {
    fail(e);
    return null;
  }
}

/** 이미 로드된 수업 인스턴스의 상태 변경 (오늘 뷰에서 탭했을 때). */
export function setClassStatus(e: ExtEvent, status: ClassStatus) {
  if (!e.klass) return Promise.resolve();
  const next: ExtEvent = { ...e, klass: { ...e.klass, status } };
  return optimistic(next, e, async () => {
    const r = await api.patchEvent(e.calendarId, e.id, classStatusBody(e.title, status));
    void loadClasses();
    return r;
  });
}

/** 날짜 + 수업으로 인스턴스를 찾아 상태를 바꾼다 (설정 화면). */
export async function setClassStatusOn(def: ClassDef, date: ISODate, status: ClassStatus): Promise<void> {
  const ttId = state.timetableCalendarId;
  if (!ttId || !def.id) return;
  set({ error: null });
  try {
    const inst = await api.listInstances(ttId, def.id, date, addDays(date, 1));
    if (inst.length === 0) {
      set({ error: `${date}에는 ${def.title} 수업이 없어요` });
      return;
    }
    const ev = await api.patchEvent(ttId, inst[0].id, classStatusBody(def.title, status));
    const it = fromEvent(ev, ttId, state.appCalendarId ?? "", "시간표", ttId);
    if (it) put({ ...it, title: stripClassTitle(ev.summary ?? def.title) });
    await loadClasses();
  } catch (e) {
    fail(e);
  }
}

/** 보강처럼 하루짜리 수업을 추가한다. */
export async function addOneOffClass(title: string, date: ISODate, start: string, end: string, status: ClassStatus, room?: string): Promise<void> {
  const ttId = state.timetableCalendarId;
  if (!ttId) {
    set({ error: "먼저 시간표를 캘린더에 반영해 주세요" });
    return;
  }
  set({ error: null });
  try {
    const ev = await api.insertEvent(ttId, oneOffClassBody(title, date, start, end, status, room));
    const it = fromEvent(ev, ttId, state.appCalendarId ?? "", "시간표", ttId);
    if (it) put(it);
    await loadClasses();
  } catch (e) {
    fail(e);
  }
}

export async function deleteOneOff(e: ExtEvent): Promise<void> {
  remove(e.calendarId, e.id);
  try {
    await api.deleteEvent(e.calendarId, e.id);
    await loadClasses();
  } catch (err) {
    put(e);
    fail(err);
  }
}

// ---- 개발용 목 모드 (VITE_MOCK=1) ----
// 네트워크 없이 화면만 확인한다. api/index.ts가 가짜 구현을 내보내고, 여기서는 초기 상태만 심는다.
if (api.IS_MOCK) {
  const items: Record<string, Item> = {};
  for (const it of mockItems(MOCK_APP_ID)) items[key(it.calendarId, it.id)] = it;
  const today = todayKST();
  state = {
    ...state,
    signedIn: true,
    appCalendarId: MOCK_APP_ID,
    appCalendarName: "할 일",
    timetableCalendarId: MOCK_TT_ID,
    classes: [
      { id: "cls-oop", title: "객체지향프로그래밍", day: 2, start: "09:00", end: "10:15", room: "공학관 301" },
      { id: "cls-ai", title: "인공지능", day: 4, start: "11:00", end: "12:15", room: "IT관 204" },
      { id: "cls-jp", title: "기초일본어", day: 4, start: "15:30", end: "16:45", room: "인문관 110" },
      { id: "cls-hp", title: "행복의 심리", day: 5, start: "13:00", end: "14:15", room: "사회관 502" },
    ],
    exceptions: mockItems(MOCK_APP_ID).filter((i): i is ExtEvent => i.kind === "ext" && !!i.klass && i.klass.status !== "normal"),
    selectedCalendarIds: ["primary"],
    calendars: [
      { id: "primary", summary: "기본", primary: true, accessRole: "owner", backgroundColor: "#4285f4" },
      { id: "holidays", summary: "대한민국의 휴일", accessRole: "reader", backgroundColor: "#0b8043" },
      { id: MOCK_APP_ID, summary: "할 일", accessRole: "owner", backgroundColor: "#f6bf26" },
      { id: MOCK_TT_ID, summary: "시간표", accessRole: "owner", backgroundColor: "#7986cb" },
    ],
    items,
    window: { from: addDays(startOfWeek(today), -7), to: addDays(startOfWeek(today), 28) },
  };
}
