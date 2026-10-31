// 개발용 가짜 API. `VITE_MOCK=1 npm run dev` 일 때 api/index.ts가 이쪽을 내보낸다.
// 읽기 전용: 캘린더 목록과 외부 일정만 돌려준다. 앱 데이터(체크·목표·시간표)는 store의 목 시드가 넣는다.

import type { ISODate } from "../model/dates";
import { addDays, todayKST } from "../model/dates";
import type { GEvent } from "../model/items";
import type { CalendarEntry } from "./calendar";

export async function listCalendars(): Promise<CalendarEntry[]> {
  return [
    { id: "primary", summary: "기본", primary: true, accessRole: "owner", backgroundColor: "#4285f4" },
    { id: "holidays", summary: "대한민국의 휴일", accessRole: "reader", backgroundColor: "#0b8043" },
  ];
}

export async function listEvents(calendarId: string, _from: ISODate, _to: ISODate): Promise<GEvent[]> {
  if (calendarId !== "primary") return [];
  const t = todayKST();
  const ev = (id: string, summary: string, date: ISODate, start?: string, end?: string): GEvent =>
    start
      ? { id, summary, start: { dateTime: `${date}T${start}:00+09:00` }, end: { dateTime: `${date}T${end}:00+09:00` } }
      : { id, summary, start: { date }, end: { date: addDays(date, 1) } };
  return [
    ev("e1", "팀 미팅", t, "14:00", "15:00"),
    ev("e3", "도서관 반납", t),
    ev("e4", "동아리 모임", addDays(t, 1), "18:00", "19:00"),
    ev("e5", "치과", addDays(t, 3), "10:30", "11:00"),
  ];
}
