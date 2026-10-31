import { describe, expect, it } from "vitest";
import { addDays, daysBetween, startOfWeek, todayKST } from "./dates";
import { fromEvent, goalPercent } from "./items";
import type { CheckItem, Goal } from "./items";
import { DEFAULT_SETTINGS, dayCap, dayLoad, loadLevel, quota, rolloverCandidates } from "./plan";

const goal = (over: Partial<Goal> = {}): Goal => ({
  kind: "goal",
  id: "g1",
  title: "족보 풀기",
  start: "2026-10-29",
  due: "2026-11-02",
  target: 50,
  current: 0,
  unit: "문제",
  done: false,
  ...over,
});

describe("dates", () => {
  it("월말·연말을 넘겨도 날짜 산수가 맞는다", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-10-29", "2026-11-02")).toBe(4);
  });
  it("todayKST는 UTC 자정 직전에도 한국 날짜를 준다", () => {
    // 2026-10-29 15:30 UTC = 2026-10-30 00:30 KST
    expect(todayKST(Date.UTC(2026, 9, 29, 15, 30))).toBe("2026-10-30");
    expect(todayKST(Date.UTC(2026, 9, 29, 14, 30))).toBe("2026-10-29");
  });
  it("주의 시작은 월요일", () => {
    expect(startOfWeek("2026-10-29")).toBe("2026-10-26"); // 목 → 월
    expect(startOfWeek("2026-11-01")).toBe("2026-10-26"); // 일 → 지난 월
  });
});

describe("quota — 스펙 4절 예시 표", () => {
  it("10/29: 남은 날 5, 남은 양 50 → 10", () => {
    expect(quota(goal(), "2026-10-29")).toBe(10);
  });
  it("10/30: 29일에 6문제만 함 → 남은 44, 남은 날 4 → 11", () => {
    expect(quota(goal({ current: 6 }), "2026-10-30")).toBe(11);
  });
  it("10/31: 30일에 20문제 함 → 남은 24, 남은 날 3 → 8", () => {
    expect(quota(goal({ current: 26 }), "2026-10-31")).toBe(8);
  });
  it("11/01: 31일에 8문제 → 남은 16, 남은 날 2 → 8", () => {
    expect(quota(goal({ current: 34 }), "2026-11-01")).toBe(8);
  });
  it("11/02 (마감일): 남은 8, 남은 날 1 → 8", () => {
    expect(quota(goal({ current: 42 }), "2026-11-02")).toBe(8);
  });
  it("마감이 지나면 남은 양 전부가 몫이다", () => {
    expect(quota(goal({ current: 42 }), "2026-11-05")).toBe(8);
  });
  it("다 끝난 목표의 몫은 0", () => {
    expect(quota(goal({ current: 50 }), "2026-10-30")).toBe(0);
  });
});

describe("dayLoad / dayCap", () => {
  const checks: CheckItem[] = [
    { kind: "check", id: "c1", title: "a", date: "2026-10-29", done: false, rolled: 0 },
    { kind: "check", id: "c2", title: "b", date: "2026-10-29", done: true, rolled: 0 },
    { kind: "check", id: "c3", title: "c", date: "2026-10-30", done: false, rolled: 0 },
  ];
  it("체크 항목 수 + 목표 몫 합", () => {
    expect(dayLoad("2026-10-29", checks, [goal()], "2026-10-29")).toBe(2 + 10);
    // 미래 날짜는 "오늘까지의 진행이 멈춘다"는 보수적 가정: 남은 50을 4일로 → 13
    expect(dayLoad("2026-10-30", checks, [goal()], "2026-10-29")).toBe(1 + 13);
  });
  it("시작 전 날짜에는 목표가 부하에 안 들어간다", () => {
    expect(dayLoad("2026-10-28", checks, [goal()], "2026-10-29")).toBe(0);
  });
  it("마감 지난 미완 목표는 오늘에만 얹히고 미래 날짜에는 안 얹힌다", () => {
    const late = goal({ start: "2026-10-20", due: "2026-10-28", current: 42 });
    expect(dayLoad("2026-10-29", [], [late], "2026-10-29")).toBe(8);
    expect(dayLoad("2026-10-30", [], [late], "2026-10-29")).toBe(0);
  });
  it("평일 6 / 주말 10, 감산 규칙 꺼짐", () => {
    expect(dayCap("2026-10-29", DEFAULT_SETTINGS)).toBe(6);
    expect(dayCap("2026-10-31", DEFAULT_SETTINGS)).toBe(10);
  });
  it("감산 규칙: 시간 지정 이벤트 3개 이상이면 -2", () => {
    const s = { ...DEFAULT_SETTINGS, reduceFrom: 3, reduceBy: 2 };
    const ext = Array.from({ length: 3 }, (_, i) => ({
      kind: "ext" as const, id: `e${i}`, calendarId: "p", title: "x", date: "2026-10-29", allDay: false, done: false,
    }));
    expect(dayCap("2026-10-29", s, ext)).toBe(4);
    expect(dayCap("2026-10-29", s, ext.slice(0, 2))).toBe(6);
  });
  it("loadLevel 경계", () => {
    expect(loadLevel(4, 6)).toBe("ok");
    expect(loadLevel(5, 6)).toBe("warn"); // 0.83
    expect(loadLevel(6, 6)).toBe("over");
  });
});

describe("rollover", () => {
  it("오늘보다 앞선 미완 체크 항목만", () => {
    const checks: CheckItem[] = [
      { kind: "check", id: "c1", title: "a", date: "2026-10-28", done: false, rolled: 0 },
      { kind: "check", id: "c2", title: "b", date: "2026-10-28", done: true, rolled: 0 },
      { kind: "check", id: "c3", title: "c", date: "2026-10-29", done: false, rolled: 0 },
    ];
    expect(rolloverCandidates(checks, "2026-10-29").map((c) => c.id)).toEqual(["c1"]);
  });
});

describe("goalPercent", () => {
  it("비율", () => {
    expect(goalPercent({ target: 50, current: 23 })).toBe(46);
    expect(goalPercent({ target: 0, current: 0 })).toBe(0);
  });
});

describe("fromEvent", () => {
  it("외부 시간 지정 이벤트는 KST 날짜·시각으로, 완료 표시는 로컬 맵에서", () => {
    const e = fromEvent(
      { id: "e", summary: "수업", start: { dateTime: "2026-10-29T09:00:00+09:00" }, end: { dateTime: "2026-10-29T10:15:00+09:00" } },
      "primary", "기본", { "primary|e": true },
    );
    expect(e).toMatchObject({ kind: "ext", date: "2026-10-29", startTime: "09:00", endTime: "10:15", allDay: false, done: true });
  });
  it("종일 이벤트와 취소된 이벤트", () => {
    expect(fromEvent({ id: "a", summary: "x", start: { date: "2026-10-29" }, end: { date: "2026-10-30" } }, "p", undefined, {})).toMatchObject({ allDay: true, date: "2026-10-29", done: false });
    expect(fromEvent({ id: "b", status: "cancelled", start: { date: "2026-10-29" }, end: { date: "2026-10-30" } }, "p", undefined, {})).toBeNull();
  });
});
