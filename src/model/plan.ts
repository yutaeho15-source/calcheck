// 분배 계산 (스펙 4절). 순수 함수만 둔다 — 캘린더도 React도 모른다.
// 분배는 저장하지 않고 화면을 열 때마다 계산한다. 그래서 하루가 어긋나도 다시 짤 계획이 없다.

import type { ISODate } from "./dates";
import { daysBetween, isWeekend } from "./dates";
import type { CheckItem, ExtEvent, Goal } from "./items";

export interface Settings {
  capWeekday: number;
  capWeekend: number;
  /** 선택 규칙: 그날 시간 지정 외부 이벤트가 reduceFrom개 이상이면 상한에서 reduceBy를 뺀다. 0이면 끔. */
  reduceFrom: number;
  reduceBy: number;
}

export const DEFAULT_SETTINGS: Settings = {
  capWeekday: 6,
  capWeekend: 10,
  reduceFrom: 0,
  reduceBy: 0,
};

/** 목표 g의 날짜 d 몫: ⌈(N − n) ÷ max(1, due − d + 1)⌉. 마감이 지났으면 남은 양 전부. */
export function quota(g: Pick<Goal, "target" | "current" | "due">, d: ISODate): number {
  const remaining = Math.max(0, g.target - g.current);
  if (remaining === 0) return 0;
  const days = Math.max(1, daysBetween(d, g.due) + 1);
  return Math.ceil(remaining / days);
}

/**
 * 목표가 날짜 d의 리스트에 올라오는가.
 * 마감 안이면 당연히 올라오고, 마감이 지난 미완 목표는 "오늘"에만 올라온다 —
 * 내일·모레에도 전부 얹으면 미래 부하가 남은 양만큼 날마다 중복 계산되기 때문이다.
 */
export function isGoalAlive(g: Goal, d: ISODate, today: ISODate): boolean {
  if (g.done) return false;
  if (d < g.start) return false;
  return d <= g.due || d === today;
}

export function isGoalOverdue(g: Goal, d: ISODate): boolean {
  return !g.done && d > g.due;
}

/** 하루 부하 L(d) = 그날 체크 항목 수 + 그날 살아 있는 목표들의 몫 합. */
export function dayLoad(d: ISODate, checks: CheckItem[], goals: Goal[], today: ISODate): number {
  const c = checks.filter((x) => x.date === d).length;
  const g = goals.filter((x) => isGoalAlive(x, d, today)).reduce((s, x) => s + quota(x, d), 0);
  return c + g;
}

/** 그날의 회차 상한. 요일별 값에서 외부 이벤트 수에 따른 감산을 적용. */
export function dayCap(d: ISODate, settings: Settings, extEvents: ExtEvent[] = []): number {
  const base = isWeekend(d) ? settings.capWeekend : settings.capWeekday;
  if (settings.reduceFrom <= 0) return base;
  const timed = extEvents.filter((e) => e.date === d && !e.allDay).length;
  return timed >= settings.reduceFrom ? Math.max(0, base - settings.reduceBy) : base;
}

export type LoadLevel = "ok" | "warn" | "over";

export function loadLevel(load: number, cap: number): LoadLevel {
  if (cap <= 0) return load > 0 ? "over" : "ok";
  const r = load / cap;
  if (r >= 1) return "over";
  if (r >= 0.8) return "warn";
  return "ok";
}

/** 이월 대상: 오늘보다 앞 날짜의 미완 체크 항목. 앱을 열 때 오늘로 patch한다 (스펙 7절). */
export function rolloverCandidates(checks: CheckItem[], today: ISODate): CheckItem[] {
  return checks.filter((c) => !c.done && c.date < today);
}
