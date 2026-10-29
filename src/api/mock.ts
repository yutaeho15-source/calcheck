// 개발용 가짜 API. `VITE_MOCK=1 npm run dev` 일 때 api/index.ts가 이쪽을 내보낸다.
// 네트워크·로그인 없이 화면과 상태 흐름만 확인하기 위한 것. 쓰기는 전부 성공한 척한다.

import type { ISODate } from "../model/dates";
import { addDays, todayKST } from "../model/dates";
import type { GEvent, Item } from "../model/items";
import type { CalendarEntry } from "./calendar";

export const MOCK_APP_ID = "mock-app-calendar";
export const MOCK_TT_ID = "mock-timetable-calendar";

export function mockItems(appId: string): Item[] {
  const t = todayKST();
  return [
    { kind: "ext", id: "e1", calendarId: "primary", calendarName: "기본", title: "객체지향프로그래밍", date: t, allDay: false, startTime: "09:00", endTime: "10:15", done: true },
    { kind: "ext", id: "e2", calendarId: "primary", calendarName: "기본", title: "팀 미팅", date: t, allDay: false, startTime: "14:00", endTime: "15:00", done: false },
    { kind: "ext", id: "e3", calendarId: "primary", calendarName: "기본", title: "도서관 반납", date: t, allDay: true, done: false },
    { kind: "ext", id: "e4", calendarId: "primary", calendarName: "기본", title: "동아리 모임", date: addDays(t, 1), allDay: false, startTime: "18:00", endTime: "19:00", done: false },
    { kind: "ext", id: "k1", calendarId: MOCK_TT_ID, calendarName: "시간표", title: "인공지능", date: t, allDay: false, startTime: "11:00", endTime: "12:15", done: false, klass: { masterId: "cls-ai", status: "exam", room: "IT관 204" } },
    { kind: "ext", id: "k2", calendarId: MOCK_TT_ID, calendarName: "시간표", title: "기초일본어", date: t, allDay: false, startTime: "15:30", endTime: "16:45", done: false, klass: { masterId: "cls-jp", status: "cancelled", room: "인문관 110" } },
    { kind: "ext", id: "k3", calendarId: MOCK_TT_ID, calendarName: "시간표", title: "행복의 심리", date: addDays(t, 1), allDay: false, startTime: "13:00", endTime: "14:15", done: false, klass: { masterId: "cls-hp", status: "normal", room: "사회관 502" } },
    { kind: "check", id: "c1", calendarId: appId, title: "보고서 초안", date: t, done: false, rolled: 1 },
    { kind: "check", id: "c2", calendarId: appId, title: "교수님 메일 답장", date: t, done: true, rolled: 0 },
    { kind: "check", id: "c3", calendarId: appId, title: "동아리 장부 정리", date: addDays(t, 2), done: false, rolled: 0 },
    { kind: "check", id: "c4", calendarId: appId, title: "발표 자료 검토", date: addDays(t, 2), done: false, rolled: 0 },
    { kind: "check", id: "c5", calendarId: appId, title: "실습 제출", date: addDays(t, 2), done: false, rolled: 0 },
    { kind: "goal", id: "g1", calendarId: appId, title: "족보 풀기", start: t, due: addDays(t, 4), target: 50, current: 23, unit: "문제", done: false },
    { kind: "goal", id: "g2", calendarId: appId, title: "일본어 교재 읽기", start: addDays(t, -3), due: addDays(t, 2), target: 30, current: 9, unit: "쪽", done: false },
    { kind: "goal", id: "g3", calendarId: appId, title: "지난 주 밀린 정리", start: addDays(t, -7), due: addDays(t, -1), target: 5, current: 3, unit: "회", done: false },
  ];
}

let seq = 100;

export async function listCalendars(): Promise<CalendarEntry[]> {
  return [
    { id: "primary", summary: "기본", primary: true, accessRole: "owner", backgroundColor: "#4285f4" },
    { id: "holidays", summary: "대한민국의 휴일", accessRole: "reader", backgroundColor: "#0b8043" },
    { id: MOCK_APP_ID, summary: "할 일", accessRole: "owner", backgroundColor: "#f6bf26" },
    { id: MOCK_TT_ID, summary: "시간표", accessRole: "owner", backgroundColor: "#7986cb" },
  ];
}
export async function insertCalendar(summary: string): Promise<CalendarEntry> {
  return { id: MOCK_APP_ID, summary, accessRole: "owner" };
}
export async function listEvents(): Promise<GEvent[]> {
  return [];
}
export async function insertEvent(_c: string, body: unknown): Promise<GEvent> {
  return { id: `m${seq++}`, etag: "mock", start: { date: todayKST() }, end: { date: todayKST() }, ...(body as object) } as GEvent;
}
export async function patchEvent(_c: string, id: string, body: unknown): Promise<GEvent> {
  return { id, etag: "mock", start: { date: todayKST() }, end: { date: todayKST() }, ...(body as object) } as GEvent;
}
export async function deleteEvent(): Promise<void> {}
export async function listMasters(): Promise<GEvent[]> {
  return [
    { id: "cls-oop", summary: "객체지향프로그래밍", location: "공학관 301", start: { dateTime: "2026-09-01T09:00:00+09:00" }, end: { dateTime: "2026-09-01T10:15:00+09:00" }, recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=TU"], extendedProperties: { private: { app: "cc", kind: "class", key: "객체지향프로그래밍|2|09:00" } } },
    { id: "cls-ai", summary: "인공지능", location: "IT관 204", start: { dateTime: "2026-09-03T11:00:00+09:00" }, end: { dateTime: "2026-09-03T12:15:00+09:00" }, recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=TH"], extendedProperties: { private: { app: "cc", kind: "class", key: "인공지능|4|11:00" } } },
  ];
}
export async function listInstances(_c: string, masterId: string, from: ISODate): Promise<GEvent[]> {
  return [{ id: `${masterId}_${from.replace(/-/g, "")}T000000Z`, etag: "mock", summary: "x", recurringEventId: masterId, start: { dateTime: `${from}T09:00:00+09:00` }, end: { dateTime: `${from}T10:15:00+09:00` } }];
}
