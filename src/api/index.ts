// 실제 API와 목 API를 빌드 시점 플래그로 고른다. 스토어는 이 모듈만 본다. 읽기 전용.
import * as real from "./calendar";
import * as mock from "./mock";

export const IS_MOCK = import.meta.env.VITE_MOCK === "1";
const impl = IS_MOCK ? mock : real;

export type { CalendarEntry } from "./calendar";
export const listCalendars: typeof real.listCalendars = impl.listCalendars;
export const listEvents: typeof real.listEvents = impl.listEvents;
