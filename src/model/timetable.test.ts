import { describe, expect, it } from "vitest";
import { classInstances, defKey, formatTimetableText, parseTimetableText, statusKey } from "./timetable";

describe("parseTimetableText", () => {
  it("한 줄에 요일 여러 개 → 요일별 수업", () => {
    const { defs, errors } = parseTimetableText("객체지향프로그래밍 | 월 09:00-10:15, 수 9:00~10:15 | 공학관 301");
    expect(errors).toEqual([]);
    expect(defs).toEqual([
      { title: "객체지향프로그래밍", day: 1, start: "09:00", end: "10:15", room: "공학관 301" },
      { title: "객체지향프로그래밍", day: 3, start: "09:00", end: "10:15", room: "공학관 301" },
    ]);
  });
  it("강의실 없이도, 빈 줄·주석은 건너뛴다", () => {
    const { defs, errors } = parseTimetableText("# 2학기\n\n인공지능 | 화 11:00-12:15\n");
    expect(errors).toEqual([]);
    expect(defs).toHaveLength(1);
    expect(defs[0].room).toBeUndefined();
  });
  it("형식이 틀리면 행 번호로 알려 준다", () => {
    const { errors } = parseTimetableText("그냥 제목만\n수업 | 화요일 오전");
    expect(errors[0]).toMatch(/^1행/);
    expect(errors[1]).toMatch(/^2행/);
  });
  it("format → parse 왕복", () => {
    const text = "인공지능 | 화 11:00-12:15, 목 11:00-12:15 | IT관 204\n일본어 | 금 13:00-14:15";
    const { defs } = parseTimetableText(text);
    expect(formatTimetableText(defs)).toBe(text);
  });
});

describe("classInstances", () => {
  const defs = [{ title: "AI", day: 4, start: "11:00", end: "12:15", room: "IT관 204" }]; // 목
  const sem = { start: "2026-09-01", end: "2026-12-19" };
  it("범위 안의 해당 요일마다 회차가 생기고, 학기 밖은 제외", () => {
    const out = classInstances(defs, [], sem, "2026-10-26", "2026-11-09", {}, {});
    expect(out.map((e) => e.date)).toEqual(["2026-10-29", "2026-11-05"]);
    expect(out[0]).toMatchObject({ title: "AI", startTime: "11:00", endTime: "12:15", klass: { status: "normal", room: "IT관 204" } });
    expect(classInstances(defs, [], sem, "2026-12-21", "2026-12-28", {}, {})).toEqual([]);
  });
  it("상태와 완료 표시는 키로 붙는다", () => {
    const k = defKey(defs[0]);
    const out = classInstances(defs, [], sem, "2026-10-26", "2026-11-02", { [statusKey(k, "2026-10-29")]: "exam" }, { [`timetable|${k}|2026-10-29`]: true });
    expect(out[0].klass?.status).toBe("exam");
    expect(out[0].done).toBe(true);
  });
  it("보강(일회성)은 날짜가 맞으면 들어간다", () => {
    const out = classInstances([], [{ id: "o1", title: "AI 보강", date: "2026-10-30", start: "18:00", end: "19:00", status: "makeup" }], sem, "2026-10-26", "2026-11-02", {}, {});
    expect(out).toHaveLength(1);
    expect(out[0].klass).toMatchObject({ oneOffId: "o1", status: "makeup" });
  });
});
