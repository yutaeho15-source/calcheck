// 앱 상태.
// 구글 캘린더는 읽기 전용 입력이다. 앱이 만드는 것(체크·목표·시간표·수업 상태·완료 표시)은 전부 기기(localStorage)에 저장된다.
// 외부 의존 없이 useSyncExternalStore로 만든 작은 스토어.

import { useSyncExternalStore } from "react";
import * as api from "./api";
import type { CalendarEntry } from "./api";
import * as auth from "./auth";
import type { ISODate } from "./model/dates";
import { addDays, startOfWeek, todayKST } from "./model/dates";
import type { CheckItem, ExtEvent, Goal } from "./model/items";
import { TIMETABLE_CAL, extKey, fromEvent } from "./model/items";
import type { LocalData, OneOffClass } from "./model/local";
import { emptyData, exportJson, importJson, loadData, newId, saveData } from "./model/local";
import type { Settings } from "./model/plan";
import { DEFAULT_SETTINGS, rolloverCandidates } from "./model/plan";
import type { ClassDef, ClassStatus } from "./model/timetable";
import { classInstances, statusKey } from "./model/timetable";

export interface State {
  signedIn: boolean;
  booting: boolean; // 자동 로그인 시도 중
  loading: boolean;
  error: string | null;
  calendars: CalendarEntry[];
  data: LocalData;
  /** 구글에서 읽어 온 외부 일정 (캐시). key = `${calendarId}|${id}` */
  ext: Record<string, ExtEvent>;
  window: { from: ISODate; to: ISODate } | null;
}

function defaultSemester(): { start: ISODate; end: ISODate } {
  const t = todayKST();
  const y = Number(t.slice(0, 4));
  const m = Number(t.slice(5, 7));
  return m >= 3 && m <= 8 ? { start: `${y}-03-01`, end: `${y}-06-30` } : m >= 9 ? { start: `${y}-09-01`, end: `${y}-12-31` } : { start: `${y - 1}-09-01`, end: `${y}-02-28` };
}

let state: State = {
  signedIn: auth.isSignedIn(),
  booting: auth.hasSession() && !auth.isSignedIn(),
  loading: false,
  error: null,
  calendars: [],
  data: loadData(emptyData(DEFAULT_SETTINGS, defaultSemester())),
  ext: {},
  window: null,
};

const listeners = new Set<() => void>();
function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  if (patch.data) saveData(state.data);
  listeners.forEach((l) => l());
}
function setData(patch: Partial<LocalData>) {
  set({ data: { ...state.data, ...patch } });
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

// ---- selectors ----

export const selectChecks = (s: State): CheckItem[] => s.data.checks;
export const selectGoals = (s: State): Goal[] => s.data.goals;
/** 외부 일정 + 로컬 시간표 회차. 시간표는 로드된 범위 안에서 그때그때 생성한다. */
export function selectExt(s: State): ExtEvent[] {
  const google = Object.values(s.ext);
  if (!s.window) return google;
  const classes = classInstances(s.data.classes, s.data.oneOffs, s.data.semester, s.window.from, s.window.to, s.data.classStatus, s.data.extDone);
  return google.concat(classes);
}

// ---- auth ----

function fail(e: unknown) {
  set({ error: e instanceof Error ? e.message : String(e), loading: false, booting: false });
}

/** 앱 시작: 저장된 세션이 있으면 조용히 토큰을 받아 본다. */
export async function boot(): Promise<void> {
  if (state.signedIn) {
    set({ booting: false });
    await bootstrap();
    return;
  }
  if (!auth.hasSession()) {
    set({ booting: false });
    return;
  }
  try {
    await auth.requestToken(false);
    set({ signedIn: true, booting: false });
    await bootstrap();
  } catch {
    // 조용한 갱신 실패 — 로그인 버튼을 보여 준다
    auth.dropToken();
    set({ signedIn: false, booting: false });
  }
}

export async function signIn(): Promise<void> {
  set({ error: null, loading: true });
  try {
    await auth.requestToken(true);
    set({ signedIn: true, loading: false });
    await bootstrap();
  } catch (e) {
    fail(e);
  }
}

export async function signOut(): Promise<void> {
  await auth.signOut();
  set({ signedIn: false, ext: {}, window: null, calendars: [] });
}

async function bootstrap(): Promise<void> {
  set({ loading: true, error: null });
  try {
    const calendars = await api.listCalendars();
    let selected = state.data.selectedCalendarIds.filter((id) => calendars.some((c) => c.id === id));
    if (selected.length === 0) {
      const primary = calendars.find((c) => c.primary);
      if (primary) selected = [primary.id];
    }
    set({ calendars });
    setData({ selectedCalendarIds: selected });
    rollover();
    await loadAround(todayKST());
  } catch (e) {
    fail(e);
  }
}

// ---- 외부 일정 읽기 ----

export async function loadAround(anchor: ISODate): Promise<void> {
  const from = addDays(startOfWeek(anchor), -7);
  await loadRange(from, addDays(from, 35));
}

export async function loadRange(from: ISODate, to: ISODate): Promise<void> {
  if (!state.signedIn) {
    set({ window: { from, to } });
    return;
  }
  set({ loading: true, error: null });
  try {
    const nameOf = new Map(state.calendars.map((c) => [c.id, c.summary]));
    const ids = state.data.selectedCalendarIds;
    const results = await Promise.all(ids.map((id) => api.listEvents(id, from, to)));
    const ext: Record<string, ExtEvent> = {};
    ids.forEach((calId, i) => {
      for (const ev of results[i]) {
        const it = fromEvent(ev, calId, nameOf.get(calId), state.data.extDone);
        if (it) ext[extKey(calId, it.id)] = it;
      }
    });
    set({ ext, window: { from, to }, loading: false });
  } catch (e) {
    fail(e);
  }
}

export async function refresh(): Promise<void> {
  rollover();
  if (state.window) await loadRange(state.window.from, state.window.to);
  else await loadAround(todayKST());
}

/** 이월: 오늘보다 앞선 미완 체크 항목을 오늘로 옮긴다. 앱을 열 때·새로고침 때. */
function rollover(): void {
  const today = todayKST();
  const cands = new Set(rolloverCandidates(state.data.checks, today).map((c) => c.id));
  if (cands.size === 0) return;
  setData({ checks: state.data.checks.map((c) => (cands.has(c.id) ? { ...c, date: today, rolled: c.rolled + 1 } : c)) });
}

// ---- 체크 항목 ----

export function createCheck(title: string, date: ISODate): void {
  setData({ checks: [...state.data.checks, { kind: "check", id: newId(), title: title.trim(), date, done: false, rolled: 0 }] });
}
export function toggleCheck(c: CheckItem): void {
  setData({ checks: state.data.checks.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)) });
}
export function updateCheck(c: CheckItem, patch: { title?: string; date?: ISODate }): void {
  setData({ checks: state.data.checks.map((x) => (x.id === c.id ? { ...x, ...patch } : x)) });
}

// ---- 목표 ----

export function createGoal(title: string, start: ISODate, due: ISODate, target: number, unit: string): void {
  setData({ goals: [...state.data.goals, { kind: "goal", id: newId(), title: title.trim(), start, due, target, current: 0, unit, done: false }] });
}
export function setGoalCurrent(g: Goal, current: number): void {
  const n = Math.max(0, Math.min(g.target, Math.round(current)));
  setData({ goals: state.data.goals.map((x) => (x.id === g.id ? { ...x, current: n, done: x.target > 0 && n >= x.target } : x)) });
}
export function updateGoal(g: Goal, patch: { title?: string; start?: ISODate; due?: ISODate; target?: number; unit?: string }): void {
  setData({
    goals: state.data.goals.map((x) => {
      if (x.id !== g.id) return x;
      const m = { ...x, ...patch };
      const current = Math.min(m.current, m.target);
      return { ...m, current, done: m.target > 0 && current >= m.target };
    }),
  });
}
export function deleteItem(item: CheckItem | Goal): void {
  if (item.kind === "check") setData({ checks: state.data.checks.filter((x) => x.id !== item.id) });
  else setData({ goals: state.data.goals.filter((x) => x.id !== item.id) });
}

// ---- 외부 일정 완료 표시 (로컬) ----

export function toggleExt(e: ExtEvent): void {
  const k = extKey(e.calendarId, e.id);
  const extDone = { ...state.data.extDone };
  if (extDone[k]) delete extDone[k];
  else extDone[k] = true;
  setData({ extDone });
  if (e.calendarId !== TIMETABLE_CAL) {
    set({ ext: { ...state.ext, [k]: { ...e, done: !e.done } } });
  }
}

// ---- 설정 ----

export function setSettings(settings: Settings): void {
  setData({ settings });
}
export async function setSelectedCalendars(ids: string[]): Promise<void> {
  setData({ selectedCalendarIds: ids });
  await refresh();
}
export function setSemester(sem: { start: ISODate; end: ISODate }): void {
  setData({ semester: sem });
}
export function clearError(): void {
  set({ error: null });
}

// ---- 시간표 (로컬) ----

export function saveTimetable(defs: ClassDef[]): void {
  setData({ classes: defs.map((d) => ({ ...d, title: d.title.trim() })) });
}
export function setClassStatus(e: ExtEvent, status: ClassStatus): void {
  if (!e.klass) return;
  if (e.klass.oneOffId) {
    setData({ oneOffs: state.data.oneOffs.map((o) => (o.id === e.klass!.oneOffId ? { ...o, status } : o)) });
    return;
  }
  if (e.klass.defKey) setClassStatusOn(e.klass.defKey, e.date, status);
}
export function setClassStatusOn(key: string, date: ISODate, status: ClassStatus): void {
  const classStatus = { ...state.data.classStatus };
  const sk = statusKey(key, date);
  if (status === "normal") delete classStatus[sk];
  else classStatus[sk] = status;
  setData({ classStatus });
}
export function addOneOffClass(title: string, date: ISODate, start: string, end: string, status: ClassStatus, room?: string): void {
  const o: OneOffClass = { id: newId(), title: title.trim() || "보강", date, start, end, status, room };
  setData({ oneOffs: [...state.data.oneOffs, o] });
}
export function deleteOneOff(e: ExtEvent): void {
  if (!e.klass?.oneOffId) return;
  setData({ oneOffs: state.data.oneOffs.filter((o) => o.id !== e.klass!.oneOffId) });
}
/** 이번 학기의 정상이 아닌 회차 목록 (설정 화면). */
export function selectExceptions(s: State): ExtEvent[] {
  const all = classInstances(s.data.classes, s.data.oneOffs, s.data.semester, s.data.semester.start, addDays(s.data.semester.end, 1), s.data.classStatus, s.data.extDone);
  return all.filter((e) => e.klass && e.klass.status !== "normal").sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.startTime ?? "").localeCompare(b.startTime ?? "")));
}

// ---- 백업 ----

export function exportBackup(): string {
  return exportJson(state.data);
}
export function importBackup(text: string): boolean {
  const d = importJson(text);
  if (!d) return false;
  set({ data: d });
  void refresh();
  return true;
}
export function resetData(): void {
  set({ data: emptyData(DEFAULT_SETTINGS, defaultSemester()) });
}

// ---- 개발용 목 모드 (VITE_MOCK=1) ----
// 저장된 데이터가 없을 때만 시드를 넣는다 — 그래야 로컬 저장이 실제로 되는지 볼 수 있다.
if (api.IS_MOCK && state.data.checks.length === 0 && state.data.classes.length === 0) {
  const t = todayKST();
  const sem = defaultSemester();
  const d = emptyData(DEFAULT_SETTINGS, sem);
  d.selectedCalendarIds = ["primary"];
  d.checks = [
    { kind: "check", id: "c1", title: "보고서 초안", date: t, done: false, rolled: 1 },
    { kind: "check", id: "c2", title: "교수님 메일 답장", date: t, done: true, rolled: 0 },
    { kind: "check", id: "c3", title: "동아리 장부 정리", date: addDays(t, 2), done: false, rolled: 0 },
    { kind: "check", id: "c4", title: "발표 자료 검토", date: addDays(t, 2), done: false, rolled: 0 },
  ];
  d.goals = [
    { kind: "goal", id: "g1", title: "족보 풀기", start: t, due: addDays(t, 4), target: 50, current: 23, unit: "문제", done: false },
    { kind: "goal", id: "g2", title: "일본어 교재 읽기", start: addDays(t, -3), due: addDays(t, 2), target: 30, current: 9, unit: "쪽", done: false },
    { kind: "goal", id: "g3", title: "지난 주 밀린 정리", start: addDays(t, -7), due: addDays(t, -1), target: 5, current: 3, unit: "회", done: false },
  ];
  d.classes = [
    { title: "기초일본어", day: 1, start: "09:00", end: "12:00", room: "AI미래관 901" },
    { title: "인공지능", day: 2, start: "13:00", end: "16:00", room: "제3공학관 702" },
    { title: "행복의심리", day: 3, start: "09:00", end: "12:00", room: "AI미래관 202" },
    { title: "객체지향프로그래밍", day: 3, start: "13:00", end: "16:00", room: "제1공학관 403" },
    { title: "문학과영상", day: 4, start: "18:00", end: "20:20", room: "AI미래관 106" },
  ];
  const w = new Date(t + "T00:00:00Z").getUTCDay();
  const todayDef = d.classes.find((c) => c.day === w);
  if (todayDef) d.classStatus[statusKey(`${todayDef.title}|${todayDef.day}|${todayDef.start}`, t)] = "exam";
  state = { ...state, signedIn: true, booting: false, data: d };
} else if (api.IS_MOCK) {
  state = { ...state, signedIn: true, booting: false };
}
