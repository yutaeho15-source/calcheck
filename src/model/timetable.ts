// 시간표 모델. 수업은 캘린더가 아니라 기기에 저장되고, 날짜 범위를 달라고 하면 그 자리에서 회차를 만들어 낸다.
// 휴강·시험 같은 상태는 `${defKey}|${date}` 키로 따로 저장된다.

import type { ISODate } from "./dates";
import { addDays, daysBetween, weekday } from "./dates";
import type { ExtEvent } from "./items";
import { TIMETABLE_CAL } from "./items";
import type { OneOffClass } from "./local";

export const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

export interface ClassDef {
  title: string;
  day: number; // 0=일 … 6=토
  start: string; // 'HH:MM'
  end: string;
  room?: string;
}

export type ClassStatus = "normal" | "cancelled" | "exam" | "online" | "assignment" | "makeup";

export const STATUS_LABEL: Record<ClassStatus, string> = {
  normal: "정상",
  cancelled: "휴강",
  exam: "시험",
  online: "온라인",
  assignment: "과제 마감",
  makeup: "보강",
};

/** 같은 수업인지 판단하는 키. 제목+요일+시작시각. */
export function defKey(d: Pick<ClassDef, "title" | "day" | "start">): string {
  return `${d.title.trim()}|${d.day}|${d.start}`;
}

export const statusKey = (k: string, date: ISODate) => `${k}|${date}`;

/** [from, to) 범위의 수업 회차를 만든다. 학기 밖은 제외. */
export function classInstances(
  defs: ClassDef[],
  oneOffs: OneOffClass[],
  semester: { start: ISODate; end: ISODate },
  from: ISODate,
  to: ISODate,
  classStatus: Record<string, ClassStatus>,
  extDone: Record<string, true>,
): ExtEvent[] {
  const out: ExtEvent[] = [];
  const lo = from > semester.start ? from : semester.start;
  const hi = addDays(semester.end, 1) < to ? addDays(semester.end, 1) : to;
  const n = daysBetween(lo, hi);
  for (let i = 0; i < n; i++) {
    const d = addDays(lo, i);
    const w = weekday(d);
    for (const def of defs) {
      if (def.day !== w) continue;
      const k = defKey(def);
      const id = `${k}|${d}`;
      out.push({
        kind: "ext",
        id,
        calendarId: TIMETABLE_CAL,
        calendarName: "시간표",
        title: def.title,
        date: d,
        allDay: false,
        startTime: def.start,
        endTime: def.end,
        done: !!extDone[`${TIMETABLE_CAL}|${id}`],
        klass: { defKey: k, status: classStatus[statusKey(k, d)] ?? "normal", room: def.room },
      });
    }
  }
  for (const o of oneOffs) {
    if (o.date < from || o.date >= to) continue;
    out.push({
      kind: "ext",
      id: `oneoff|${o.id}`,
      calendarId: TIMETABLE_CAL,
      calendarName: "시간표",
      title: o.title,
      date: o.date,
      allDay: false,
      startTime: o.start,
      endTime: o.end,
      done: !!extDone[`${TIMETABLE_CAL}|oneoff|${o.id}`],
      klass: { oneOffId: o.id, status: o.status, room: o.room },
    });
  }
  return out;
}

// ---- 텍스트 ↔ 시간표 ----
// 한 줄에 수업 하나:  과목명 | 월 09:00-10:15, 수 09:00-10:15 | 강의실

const TIME_RE = /([월화수목금토일])\s*(\d{1,2}):(\d{2})\s*[-~–]\s*(\d{1,2}):(\d{2})/g;

export function parseTimetableText(text: string): { defs: ClassDef[]; errors: string[] } {
  const defs: ClassDef[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const parts = line.split("|").map((p) => p.trim());
    const title = parts[0];
    const times = parts[1] ?? "";
    const room = parts[2] || undefined;
    if (!title || !times) {
      errors.push(`${i + 1}행: "과목명 | 요일 시작-끝 | 강의실" 형식이어야 해요`);
      return;
    }
    let found = false;
    for (const m of times.matchAll(TIME_RE)) {
      found = true;
      const day = DAY_KO.indexOf(m[1] as (typeof DAY_KO)[number]);
      const pad = (h: string, mm: string) => `${h.padStart(2, "0")}:${mm}`;
      defs.push({ title, day, start: pad(m[2], m[3]), end: pad(m[4], m[5]), room });
    }
    if (!found) errors.push(`${i + 1}행: 시간을 읽지 못했어요 — "월 09:00-10:15" 처럼 써 주세요`);
  });
  return { defs, errors };
}

export function formatTimetableText(defs: ClassDef[]): string {
  const groups = new Map<string, { title: string; room?: string; times: string[] }>();
  for (const d of [...defs].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start))) {
    const k = `${d.title}|${d.room ?? ""}`;
    const g = groups.get(k) ?? { title: d.title, room: d.room, times: [] };
    g.times.push(`${DAY_KO[d.day]} ${d.start}-${d.end}`);
    groups.set(k, g);
  }
  return [...groups.values()].map((g) => `${g.title} | ${g.times.join(", ")}${g.room ? ` | ${g.room}` : ""}`).join("\n");
}
