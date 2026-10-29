// 항목 모델 (스펙 2절·5절).
// 할 일 하나 = 구글 캘린더 이벤트 하나. 앱은 DB를 갖지 않으므로 여기서 하는 일은
// 이벤트 ↔ 항목 변환과 제목 포맷뿐이다. 파싱은 제목이 아니라 extendedProperties.private으로만 한다.
// (제목은 사용자가 위젯에서 고칠 수 있기 때문.)

import type { ISODate } from "./dates";
import { addDays } from "./dates";
import type { ClassStatus } from "./timetable";
import { classTitle, stripClassTitle } from "./timetable";

export interface CheckItem {
  kind: "check";
  id: string;
  calendarId: string;
  title: string;
  date: ISODate;
  done: boolean;
  parent?: string;
  rolled: number;
  etag?: string;
}

export interface Goal {
  kind: "goal";
  id: string;
  calendarId: string;
  title: string;
  start: ISODate;
  due: ISODate;
  target: number;
  current: number;
  unit: string;
  done: boolean;
  etag?: string;
}

export interface ClassInfo {
  masterId?: string; // 반복 수업의 master. 보강 같은 일회성이면 없음
  status: ClassStatus;
  room?: string;
}

export interface ExtEvent {
  kind: "ext";
  id: string;
  calendarId: string;
  calendarName?: string;
  title: string;
  date: ISODate;
  allDay: boolean;
  startTime?: string; // 'HH:MM' (KST)
  endTime?: string;
  done: boolean;
  etag?: string;
  /** 시간표 캘린더의 수업이면 채워진다 */
  klass?: ClassInfo;
}

export type Item = CheckItem | Goal | ExtEvent;

// ---- 구글 이벤트 (필요한 필드만) ----

export interface GEventDate {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

export interface GEvent {
  id: string;
  etag?: string;
  summary?: string;
  status?: string;
  location?: string;
  start: GEventDate;
  end: GEventDate;
  recurrence?: string[];
  recurringEventId?: string;
  extendedProperties?: { private?: Record<string, string> };
  organizer?: { displayName?: string };
}

export const APP_MARK = "cc";
export const SCHEMA_V = "1";

// ---- 제목 포맷 (스펙 5절) ----

const PREFIX_RE = /^(☐|☑|◐!|◐|●)\s*/;
const GOAL_TAIL_RE = /\s*\d+\/\d+(\s*·\s*\d+%)?\s*$/;

/** 접두어·꼬리를 떼고 사용자가 쓴 제목만 남긴다. */
export function stripTitle(summary: string): string {
  return summary.replace(PREFIX_RE, "").replace(GOAL_TAIL_RE, "").trim();
}

export function goalPercent(g: Pick<Goal, "target" | "current">): number {
  if (g.target <= 0) return 0;
  return Math.min(100, Math.round((g.current / g.target) * 100));
}

export function formatTitle(item: CheckItem | Goal, today?: ISODate): string {
  if (item.kind === "check") return `${item.done ? "☑" : "☐"} ${item.title}`;
  if (item.done) return `● ${item.title} ${item.target}/${item.target}`;
  const overdue = today !== undefined && today > item.due;
  return `${overdue ? "◐!" : "◐"} ${item.title} ${item.current}/${item.target} · ${goalPercent(item)}%`;
}

// ---- 이벤트 → 항목 ----

function kstDateOf(d: GEventDate): ISODate {
  if (d.date) return d.date;
  // dateTime은 이미 timeZone=Asia/Seoul로 요청했으므로 오프셋이 +09:00으로 온다.
  // 그래도 안전하게 UTC ms에 +9h를 더해 날짜를 뽑는다.
  const ms = Date.parse(d.dateTime!) + 9 * 3_600_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function kstTimeOf(d: GEventDate): string | undefined {
  if (!d.dateTime) return undefined;
  const ms = Date.parse(d.dateTime) + 9 * 3_600_000;
  return new Date(ms).toISOString().slice(11, 16);
}

export function fromEvent(
  ev: GEvent,
  calendarId: string,
  appCalendarId: string,
  calendarName?: string,
  timetableCalendarId?: string | null,
): Item | null {
  if (ev.status === "cancelled") return null;
  const p = ev.extendedProperties?.private ?? {};
  const summary = ev.summary ?? "";
  const isApp = calendarId === appCalendarId;

  if (timetableCalendarId && calendarId === timetableCalendarId) {
    // 시간표 캘린더: 전부 수업. 상태는 private.status, 제목 접두어는 표시용일 뿐.
    const status = ((p.status as ClassStatus | undefined) ?? "normal") as ClassStatus;
    return {
      kind: "ext",
      id: ev.id,
      calendarId,
      calendarName: "시간표",
      title: stripClassTitle(summary) || "(수업)",
      date: kstDateOf(ev.start),
      allDay: !!ev.start.date,
      startTime: kstTimeOf(ev.start),
      endTime: kstTimeOf(ev.end),
      done: p.done === "1",
      etag: ev.etag,
      klass: { masterId: ev.recurringEventId, status, room: ev.location },
    };
  }

  if (isApp) {
    // 앱 캘린더에 있으면 전부 앱 소유. kind가 없으면 사용자가 위젯에서 직접 만든 것 → 체크 항목으로.
    if (p.kind === "goal") {
      const start = ev.start.date ?? kstDateOf(ev.start);
      const endExclusive = ev.end.date ?? kstDateOf(ev.end);
      const due = addDays(endExclusive, -1);
      const target = Math.max(0, Number(p.target ?? "0"));
      const current = Math.min(target, Math.max(0, Number(p.current ?? "0")));
      return {
        kind: "goal",
        id: ev.id,
        calendarId,
        title: stripTitle(summary),
        start,
        due: due < start ? start : due,
        target,
        current,
        unit: p.unit ?? "회",
        done: p.done === "1" || (target > 0 && current >= target),
        etag: ev.etag,
      };
    }
    return {
      kind: "check",
      id: ev.id,
      calendarId,
      title: stripTitle(summary),
      date: ev.start.date ?? kstDateOf(ev.start),
      done: p.done === "1",
      parent: p.parent,
      rolled: Number(p.rolled ?? "0"),
      etag: ev.etag,
    };
  }

  return {
    kind: "ext",
    id: ev.id,
    calendarId,
    calendarName,
    title: summary || "(제목 없음)",
    date: kstDateOf(ev.start),
    allDay: !!ev.start.date,
    startTime: kstTimeOf(ev.start),
    endTime: kstTimeOf(ev.end),
    done: p.done === "1",
    etag: ev.etag,
  };
}

// ---- 항목 → 이벤트 본문 (insert / patch) ----

export function checkEventBody(c: Omit<CheckItem, "id" | "calendarId" | "etag">) {
  const priv: Record<string, string> = {
    app: APP_MARK,
    v: SCHEMA_V,
    kind: "check",
    done: c.done ? "1" : "0",
    rolled: String(c.rolled),
  };
  if (c.parent) priv.parent = c.parent;
  return {
    summary: formatTitle({ ...c, kind: "check", id: "", calendarId: "" }),
    start: { date: c.date },
    end: { date: addDays(c.date, 1) },
    extendedProperties: { private: priv },
  };
}

export function goalEventBody(g: Omit<Goal, "id" | "calendarId" | "etag">, today?: ISODate) {
  const done = g.done || (g.target > 0 && g.current >= g.target);
  return {
    summary: formatTitle({ ...g, kind: "goal", id: "", calendarId: "", done }, today),
    start: { date: g.start },
    end: { date: addDays(g.due, 1) },
    extendedProperties: {
      private: {
        app: APP_MARK,
        v: SCHEMA_V,
        kind: "goal",
        done: done ? "1" : "0",
        target: String(g.target),
        current: String(g.current),
        unit: g.unit,
      },
    },
  };
}

/** 수업 인스턴스의 상태 변경. 시간표 캘린더는 앱 소유라 제목도 함께 바꾼다. */
export function classStatusBody(baseTitle: string, status: ClassStatus) {
  return {
    summary: classTitle(baseTitle, status),
    extendedProperties: { private: { app: APP_MARK, v: SCHEMA_V, kind: "class", status, flag: status === "normal" ? "0" : "1" } },
  };
}

/** 외부 이벤트의 체크. private 속성만 보낸다 — 사용자 캘린더의 보이는 필드는 절대 건드리지 않는다. */
export function extDoneBody(done: boolean) {
  return { extendedProperties: { private: { app: APP_MARK, v: SCHEMA_V, kind: "ext", done: done ? "1" : "0" } } };
}
