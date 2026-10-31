// Calendar API v3 래퍼 — 읽기 전용. calendarList와 events.list 둘뿐이다.
// 쓰기 함수는 일부러 없다. 앱이 만든 것은 model/local.ts로 기기에만 저장된다.

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

// ---- events ----

const EVENT_FIELDS = "nextPageToken,items(id,etag,summary,status,location,start,end,recurrence,recurringEventId,extendedProperties,organizer/displayName)";

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
