// 시간표 모델. 수업 하나 = "시간표" 캘린더의 주간 반복 이벤트(master) 하나.
// 휴강·시험 같은 상태는 그날 인스턴스의 private 속성과 제목 접두어로만 표시한다 — 원본은 여전히 캘린더다.

import type { ISODate } from "./dates";
import { addDays, weekday } from "./dates";

export const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;
const DAY_RRULE = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

export interface ClassDef {
  /** master 이벤트 ID. 아직 캘린더에 없으면 undefined */
  id?: string;
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
/** 인스턴스 제목 접두어. 위젯에서 바로 읽히도록 */
const STATUS_PREFIX: Partial<Record<ClassStatus, string>> = {
  cancelled: "휴강",
  exam: "시험",
  online: "온라인",
  assignment: "과제",
  makeup: "보강",
};
const PREFIX_RE = /^(휴강|시험|온라인|과제|보강)\s*·\s*/;

export function classTitle(base: string, status: ClassStatus): string {
  const p = STATUS_PREFIX[status];
  return p ? `${p} · ${base}` : base;
}
export function stripClassTitle(summary: string): string {
  return summary.replace(PREFIX_RE, "").trim();
}

/** 같은 수업인지 판단하는 키. 제목+요일+시작시각. */
export function defKey(d: Pick<ClassDef, "title" | "day" | "start">): string {
  return `${d.title.trim()}|${d.day}|${d.start}`;
}

/** 학기 시작일 이후 첫 해당 요일 */
export function firstOccurrence(semStart: ISODate, day: number): ISODate {
  const w = weekday(semStart);
  return addDays(semStart, (day - w + 7) % 7);
}

/** 학기 끝(포함)을 UNTIL로. KST 23:59:59 → UTC 14:59:59 */
function untilUtc(semEnd: ISODate): string {
  return `${semEnd.replace(/-/g, "")}T145959Z`;
}

export function classMasterBody(d: ClassDef, semStart: ISODate, semEnd: ISODate) {
  const first = firstOccurrence(semStart, d.day);
  return {
    summary: d.title.trim(),
    location: d.room?.trim() || undefined,
    start: { dateTime: `${first}T${d.start}:00`, timeZone: "Asia/Seoul" },
    end: { dateTime: `${first}T${d.end}:00`, timeZone: "Asia/Seoul" },
    recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${DAY_RRULE[d.day]};UNTIL=${untilUtc(semEnd)}`],
    extendedProperties: { private: { app: "cc", v: "1", kind: "class", key: defKey(d) } },
    reminders: { useDefault: false },
  };
}

/** 보강처럼 하루짜리 수업 이벤트 */
export function oneOffClassBody(title: string, date: ISODate, start: string, end: string, status: ClassStatus, room?: string) {
  return {
    summary: classTitle(title, status),
    location: room || undefined,
    start: { dateTime: `${date}T${start}:00`, timeZone: "Asia/Seoul" },
    end: { dateTime: `${date}T${end}:00`, timeZone: "Asia/Seoul" },
    extendedProperties: { private: { app: "cc", v: "1", kind: "class", status, flag: status === "normal" ? "0" : "1", oneoff: "1" } },
    reminders: { useDefault: false },
  };
}

// ---- 텍스트 ↔ 시간표 ----
// 한 줄에 수업 하나:  과목명 | 월 09:00-10:15, 수 09:00-10:15 | 강의실
// 요일이 여러 개면 수업도 여러 개(요일별 master)로 만든다.

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
  // 같은 과목·강의실은 한 줄로 묶는다
  const groups = new Map<string, { title: string; room?: string; times: string[] }>();
  for (const d of [...defs].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start))) {
    const k = `${d.title}|${d.room ?? ""}`;
    const g = groups.get(k) ?? { title: d.title, room: d.room, times: [] };
    g.times.push(`${DAY_KO[d.day]} ${d.start}-${d.end}`);
    groups.set(k, g);
  }
  return [...groups.values()].map((g) => `${g.title} | ${g.times.join(", ")}${g.room ? ` | ${g.room}` : ""}`).join("\n");
}
