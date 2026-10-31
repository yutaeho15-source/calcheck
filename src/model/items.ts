// 항목 모델.
// 체크 항목·목표는 앱이 소유하고 기기에 저장된다(model/local.ts).
// 외부 이벤트는 구글 캘린더에서 읽기만 하며, 완료 표시는 로컬 맵(extDone)에 남는다.
// 수업은 시간표(ClassDef)에서 로컬로 생성되는 ExtEvent다 — 캘린더에는 존재하지 않는다.

import type { ISODate } from "./dates";
import type { ClassStatus } from "./timetable";

export interface CheckItem {
  kind: "check";
  id: string;
  title: string;
  date: ISODate;
  done: boolean;
  rolled: number;
}

export interface Goal {
  kind: "goal";
  id: string;
  title: string;
  start: ISODate;
  due: ISODate;
  target: number;
  current: number;
  unit: string;
  done: boolean;
}

export interface ClassInfo {
  /** 시간표 수업의 키(제목|요일|시작). 보강 같은 일회성이면 없음 */
  defKey?: string;
  oneOffId?: string;
  status: ClassStatus;
  room?: string;
}

export interface ExtEvent {
  kind: "ext";
  id: string;
  calendarId: string; // 수업이면 "timetable"
  calendarName?: string;
  title: string;
  date: ISODate;
  allDay: boolean;
  startTime?: string; // 'HH:MM' (KST)
  endTime?: string;
  done: boolean;
  klass?: ClassInfo;
}

export type Item = CheckItem | Goal | ExtEvent;

export const TIMETABLE_CAL = "timetable";

// ---- 구글 이벤트 (읽기에 필요한 필드만) ----

export interface GEventDate {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

export interface GEvent {
  id: string;
  summary?: string;
  status?: string;
  location?: string;
  start: GEventDate;
  end: GEventDate;
  recurringEventId?: string;
}

export function goalPercent(g: Pick<Goal, "target" | "current">): number {
  if (g.target <= 0) return 0;
  return Math.min(100, Math.round((g.current / g.target) * 100));
}

// ---- 이벤트 → 외부 항목 ----

function kstDateOf(d: GEventDate): ISODate {
  if (d.date) return d.date;
  const ms = Date.parse(d.dateTime!) + 9 * 3_600_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function kstTimeOf(d: GEventDate): string | undefined {
  if (!d.dateTime) return undefined;
  const ms = Date.parse(d.dateTime) + 9 * 3_600_000;
  return new Date(ms).toISOString().slice(11, 16);
}

export const extKey = (calendarId: string, id: string) => `${calendarId}|${id}`;

export function fromEvent(ev: GEvent, calendarId: string, calendarName: string | undefined, extDone: Record<string, true>): ExtEvent | null {
  if (ev.status === "cancelled") return null;
  return {
    kind: "ext",
    id: ev.id,
    calendarId,
    calendarName,
    title: ev.summary || "(제목 없음)",
    date: kstDateOf(ev.start),
    allDay: !!ev.start.date,
    startTime: kstTimeOf(ev.start),
    endTime: kstTimeOf(ev.end),
    done: !!extDone[extKey(calendarId, ev.id)],
  };
}
