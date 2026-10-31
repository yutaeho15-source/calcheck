// 로컬 저장소 (v2). 앱이 만드는 모든 것은 여기에만 있다 — 캘린더에는 절대 쓰지 않는다.
// 구글 캘린더는 읽기 전용 입력이고, 체크·목표·시간표·수업 상태·완료 표시는 전부 이 파일의 구조로 기기에 남는다.

import type { ISODate } from "./dates";
import type { CheckItem, Goal } from "./items";
import type { Settings } from "./plan";
import type { ClassDef, ClassStatus } from "./timetable";

export const LS_KEY = "calcheck.v2";
export const SCHEMA = 2;

export interface OneOffClass {
  id: string;
  title: string;
  date: ISODate;
  start: string;
  end: string;
  status: ClassStatus;
  room?: string;
}

export interface LocalData {
  schema: number;
  settings: Settings;
  selectedCalendarIds: string[];
  semester: { start: ISODate; end: ISODate };
  checks: CheckItem[];
  goals: Goal[];
  /** 외부 일정(구글 캘린더 이벤트)의 완료 표시. key = `${calendarId}|${eventId}` (반복 이벤트는 인스턴스 ID라 날짜별로 구분됨) */
  extDone: Record<string, true>;
  classes: ClassDef[];
  /** 수업 회차 상태. key = `${defKey}|${date}` */
  classStatus: Record<string, ClassStatus>;
  oneOffs: OneOffClass[];
}

export function emptyData(settings: Settings, semester: { start: ISODate; end: ISODate }): LocalData {
  return { schema: SCHEMA, settings, selectedCalendarIds: [], semester, checks: [], goals: [], extDone: {}, classes: [], classStatus: {}, oneOffs: [] };
}

export function loadData(fallback: LocalData): LocalData {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Partial<LocalData>;
    return {
      ...fallback,
      ...p,
      schema: SCHEMA,
      settings: { ...fallback.settings, ...(p.settings ?? {}) },
      semester: p.semester ?? fallback.semester,
      checks: p.checks ?? [],
      goals: p.goals ?? [],
      extDone: p.extDone ?? {},
      classes: p.classes ?? [],
      classStatus: p.classStatus ?? {},
      oneOffs: p.oneOffs ?? [],
      selectedCalendarIds: p.selectedCalendarIds ?? [],
    };
  } catch {
    return fallback;
  }
}

export function saveData(d: LocalData): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(d));
  } catch {
    /* 저장 실패는 조용히 — 다음 변경 때 다시 시도 */
  }
}

/** 백업 파일로 내보내기 (설정 → 데이터). */
export function exportJson(d: LocalData): string {
  return JSON.stringify({ app: "calcheck", exportedAt: new Date().toISOString(), data: d }, null, 2);
}

export function importJson(text: string): LocalData | null {
  try {
    const j = JSON.parse(text) as { app?: string; data?: Partial<LocalData> };
    if (j.app !== "calcheck" || !j.data) return null;
    return loadDataFrom(j.data);
  } catch {
    return null;
  }
}

function loadDataFrom(p: Partial<LocalData>): LocalData {
  const base = emptyData(p.settings as Settings, p.semester as { start: ISODate; end: ISODate });
  return { ...base, ...p, schema: SCHEMA } as LocalData;
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
