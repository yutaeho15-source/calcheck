// 날짜는 전부 'YYYY-MM-DD' 문자열(ISODate)로 다루고, 산수는 UTC 자정 기준으로 한다.
// 이유: 종일 이벤트에는 시각이 없다. Date 객체의 로컬 시간대가 끼어들면
// 자정 근처에서 하루가 어긋나는 버그가 생기므로 시간대를 아예 배제한다.
// "오늘"만 KST 기준으로 뽑는다 (스펙 5절: 모든 날짜 계산은 Asia/Seoul).

export type ISODate = string;

const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 3_600_000;

export function toUtcMs(d: ISODate): number {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}

export function fromUtcMs(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  return fromUtcMs(toUtcMs(d) + n * DAY_MS);
}

/** b - a (일 수). a < b 이면 양수. */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / DAY_MS);
}

/** 한국 시간 기준 오늘. 실행 환경의 로컬 시간대와 무관하게 KST로 고정한다. */
export function todayKST(now: number = Date.now()): ISODate {
  return fromUtcMs(now + KST_OFFSET_MS);
}

/** 0 = 일요일 … 6 = 토요일 */
export function weekday(d: ISODate): number {
  return new Date(toUtcMs(d)).getUTCDay();
}

export function isWeekend(d: ISODate): boolean {
  const w = weekday(d);
  return w === 0 || w === 6;
}

/** 그 날짜가 속한 주의 월요일. */
export function startOfWeek(d: ISODate): ISODate {
  const w = weekday(d);
  const back = w === 0 ? 6 : w - 1;
  return addDays(d, -back);
}

export function formatKoDate(d: ISODate): string {
  const [, m, day] = d.split("-").map(Number);
  const names = ["일", "월", "화", "수", "목", "금", "토"];
  return `${m}/${day} (${names[weekday(d)]})`;
}

/** 'YYYY-MM-DD' → RFC3339 (KST 자정). events.list의 timeMin/timeMax용. */
export function kstMidnightRfc3339(d: ISODate): string {
  return `${d}T00:00:00+09:00`;
}
