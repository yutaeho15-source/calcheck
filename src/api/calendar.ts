// Calendar API v3 래퍼 (스펙 6절). 클라이언트 라이브러리 없이 fetch로 8개 호출만.
// 모든 호출은 "읽고 → 바꾸고 → patch". 앱은 캐시를 원본으로 삼지 않는다.

import { dropToken, getToken, requestToken } from "../auth";
import type { ISODate } from "../model/dates";
import { kstMidnightRfc3339 } from "../model/dates";
import type { GEvent } from "../model/items";

const BASE = "https://www.googleapis.com/calendar/v3";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit & { query?: Record<string, string | string[]> } = {}, retry = true): Promise<T> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(init.query ?? {})) {
    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x));
    else url.searchParams.set(k, v);
  }
  const token = await getToken();
  const res = await fetch(url.toString(), {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    body: init.body,
  });
  if (res.status === 401 && retry) {
    // 토큰 만료 — 한 번만 새로 받아 재시도.
    dropToken();
    await requestToken(true);
    return call<T>(path, init, false);
  }
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = await res.json();
      msg = j?.error?.message ?? msg;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---- calendars ----

export interface CalendarEntry {
  id: string;
  summary: string;
  primary?: boolean;
  accessRole: "owner" | "writer" | "reader" | "freeBusyReader";
  backgroundColor?: string;
  selected?: boolean;
}

export async function listCalendars(): Promise<CalendarEntry[]> {
  const r = await call<{ items: CalendarEntry[] }>("/users/me/calendarList", {
    query: { minAccessRole: "reader", fields: "items(id,summary,primary,accessRole,backgroundColor,selected)" },
  });
  return r.items ?? [];
}

export async function insertCalendar(summary: string): Promise<CalendarEntry> {
  const r = await call<{ id: string; summary: string }>("/calendars", {
    method: "POST",
    body: JSON.stringify({ summary, timeZone: "Asia/Seoul" }),
  });
  return { id: r.id, summary: r.summary, accessRole: "owner" };
}

// ---- events ----

const EVENT_FIELDS = "nextPageToken,items(id,etag,summary,status,location,start,end,recurrence,recurringEventId,extendedProperties,organizer/displayName)";
const ONE_FIELDS = "id,etag,summary,status,location,start,end,recurrence,recurringEventId,extendedProperties";

/** [from, to) 날짜 범위의 이벤트. 반복 이벤트는 인스턴스로 펼친다(singleEvents). 페이지는 전부 따라간다. */
export async function listEvents(
  calendarId: string,
  from: ISODate,
  to: ISODate,
  extra: Record<string, string | string[]> = {},
): Promise<GEvent[]> {
  const out: GEvent[] = [];
  let pageToken: string | undefined;
  do {
    const r = await call<{ items?: GEvent[]; nextPageToken?: string }>(`/calendars/${encodeURIComponent(calendarId)}/events`, {
      query: {
        timeMin: kstMidnightRfc3339(from),
        timeMax: kstMidnightRfc3339(to),
        singleEvents: "true",
        orderBy: "startTime",
        timeZone: "Asia/Seoul",
        maxResults: "250",
        fields: EVENT_FIELDS,
        ...extra,
        ...(pageToken ? { pageToken } : {}),
      },
    });
    out.push(...(r.items ?? []));
    pageToken = r.nextPageToken;
  } while (pageToken);
  return out;
}

export function insertEvent(calendarId: string, body: unknown): Promise<GEvent> {
  return call<GEvent>(`/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    body: JSON.stringify(body),
    query: { fields: ONE_FIELDS },
  });
}

/** patch는 보낸 필드만 바꾼다. extendedProperties.private도 보낸 키만 갱신되고 나머지는 유지된다. */
export function patchEvent(calendarId: string, eventId: string, body: unknown): Promise<GEvent> {
  return call<GEvent>(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    query: { fields: ONE_FIELDS },
  });
}

/** 반복 이벤트의 master들만 (singleEvents=false). 시간표 편집기가 쓴다. */
export async function listMasters(calendarId: string, extra: Record<string, string | string[]> = {}): Promise<GEvent[]> {
  const out: GEvent[] = [];
  let pageToken: string | undefined;
  do {
    const r = await call<{ items?: GEvent[]; nextPageToken?: string }>(`/calendars/${encodeURIComponent(calendarId)}/events`, {
      query: { singleEvents: "false", maxResults: "250", fields: EVENT_FIELDS, showDeleted: "false", ...extra, ...(pageToken ? { pageToken } : {}) },
    });
    out.push(...(r.items ?? []).filter((e) => e.status !== "cancelled"));
    pageToken = r.nextPageToken;
  } while (pageToken);
  return out;
}

/** 특정 반복 이벤트의 [from, to) 인스턴스. 예외 인스턴스도 포함된다. */
export async function listInstances(calendarId: string, masterId: string, from: ISODate, to: ISODate): Promise<GEvent[]> {
  const r = await call<{ items?: GEvent[] }>(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(masterId)}/instances`, {
    query: { timeMin: kstMidnightRfc3339(from), timeMax: kstMidnightRfc3339(to), timeZone: "Asia/Seoul", fields: EVENT_FIELDS },
  });
  return (r.items ?? []).filter((e) => e.status !== "cancelled");
}

export function deleteEvent(calendarId: string, eventId: string): Promise<void> {
  return call<void>(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
}
