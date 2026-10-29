import { describe, expect, it } from "vitest";
import { classMasterBody, classTitle, firstOccurrence, formatTimetableText, parseTimetableText, stripClassTitle } from "./timetable";

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

describe("master body", () => {
  it("학기 시작일 이후 첫 해당 요일에서 시작, UNTIL은 KST 자정 → UTC", () => {
    expect(firstOccurrence("2026-09-01", 1)).toBe("2026-09-07"); // 9/1 화 → 다음 월
    expect(firstOccurrence("2026-09-01", 2)).toBe("2026-09-01");
    const b = classMasterBody({ title: "AI", day: 4, start: "11:00", end: "12:15" }, "2026-09-01", "2026-12-19");
    expect(b.start).toEqual({ dateTime: "2026-09-03T11:00:00", timeZone: "Asia/Seoul" });
    expect(b.recurrence).toEqual(["RRULE:FREQ=WEEKLY;BYDAY=TH;UNTIL=20261219T145959Z"]);
  });
});

describe("class title", () => {
  it("접두어 붙이고 떼기", () => {
    expect(classTitle("인공지능", "cancelled")).toBe("휴강 · 인공지능");
    expect(classTitle("인공지능", "normal")).toBe("인공지능");
    expect(stripClassTitle("시험 · 인공지능")).toBe("인공지능");
    expect(stripClassTitle("인공지능")).toBe("인공지능");
  });
});
