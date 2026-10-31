import { describe, expect, it } from "vitest";
import * as api from "./calendar";
import { SCOPE } from "../auth";

// 설계 보장: 앱은 구글 캘린더에 아무것도 쓰지 않는다.
describe("read-only guarantee", () => {
  it("API 모듈에 쓰기 함수가 없다", () => {
    const names = Object.keys(api);
    for (const n of names) expect(n).not.toMatch(/insert|patch|update|delete|create|remove/i);
    expect(names).toEqual(expect.arrayContaining(["listCalendars", "listEvents"]));
  });
  it("OAuth 범위가 읽기 전용이다", () => {
    expect(SCOPE).toBe("https://www.googleapis.com/auth/calendar.readonly");
  });
});
