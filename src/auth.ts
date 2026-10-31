// Google Identity Services 토큰 클라이언트.
// 권한은 읽기 전용(calendar.readonly) — 앱이 만든 것은 전부 기기에 남고, 코드 버그로도 캘린더에 쓸 수 없다.
//
// 자동 로그인: 한 번 로그인하면 (토큰, 만료시각)을 기기에 저장한다. 다음에 열 때
//   1) 저장된 토큰이 아직 유효하면 그대로 쓰고,
//   2) 만료됐으면 prompt:'none'으로 조용히 새 토큰을 받는다 (크롬에 구글 세션이 살아 있으면 팝업 없이 성공).
//   3) 그것도 실패하면 로그인 버튼을 보여 준다.
// 로그아웃은 저장된 토큰을 지우고 구글에 revoke한다.

export const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const LS_AUTH = "calcheck.auth";

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken(opts?: { prompt?: string }): void;
  callback?: (r: TokenResponse) => void;
  error_callback?: (e: { type: string; message?: string }) => void;
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(cfg: {
            client_id: string;
            scope: string;
            callback: (r: TokenResponse) => void;
            error_callback?: (e: { type: string; message?: string }) => void;
          }): TokenClient;
          revoke(token: string, done: () => void): void;
        };
      };
    };
  }
}

let token: string | null = null;
let expiresAt = 0;
let client: TokenClient | null = null;
let gisLoading: Promise<void> | null = null;

// 저장된 토큰 복구
try {
  const raw = localStorage.getItem(LS_AUTH);
  if (raw) {
    const j = JSON.parse(raw) as { token?: string; expiresAt?: number };
    if (j.token && j.expiresAt && j.expiresAt > Date.now()) {
      token = j.token;
      expiresAt = j.expiresAt;
    }
  }
} catch {
  /* ignore */
}

function persist() {
  try {
    if (token) localStorage.setItem(LS_AUTH, JSON.stringify({ token, expiresAt }));
    else localStorage.removeItem(LS_AUTH);
  } catch {
    /* ignore */
  }
}

export function hasClientId(): boolean {
  return !!CLIENT_ID;
}

/** 전에 로그인한 적이 있는가 (자동 로그인 시도 여부). */
export function hasSession(): boolean {
  try {
    return localStorage.getItem(LS_AUTH) !== null;
  } catch {
    return false;
  }
}

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoading) return gisLoading;
  gisLoading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("GIS 스크립트를 불러오지 못했습니다"));
    document.head.appendChild(s);
  });
  return gisLoading;
}

async function ensureClient(): Promise<TokenClient> {
  if (client) return client;
  if (!CLIENT_ID) throw new Error("VITE_GOOGLE_CLIENT_ID가 없습니다 (.env 확인)");
  await loadGis();
  client = window.google!.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPE, callback: () => {} });
  return client;
}

/**
 * 토큰 요청. interactive=false면 prompt:'none' — 동의한 적 있고 구글 세션이 살아 있으면 팝업 없이 받는다.
 * 실패하면 reject (호출 쪽에서 interactive로 다시 시도하거나 로그인 버튼을 보여 준다).
 */
export function requestToken(interactive: boolean): Promise<string> {
  return ensureClient().then(
    (c) =>
      new Promise<string>((resolve, reject) => {
        let settled = false;
        const done = (fn: () => void) => {
          if (settled) return;
          settled = true;
          fn();
        };
        c.callback = (r) => {
          if (r.error || !r.access_token) {
            done(() => reject(new Error(r.error_description ?? r.error ?? "토큰 발급 실패")));
            return;
          }
          token = r.access_token;
          expiresAt = Date.now() + ((r.expires_in ?? 3600) - 60) * 1000;
          persist();
          done(() => resolve(token!));
        };
        c.error_callback = (e) => done(() => reject(new Error(e.message ?? e.type)));
        // 조용한 요청이 아무 응답 없이 끝나는 경우(팝업 차단 등)를 대비한 타임아웃
        if (!interactive) setTimeout(() => done(() => reject(new Error("silent_timeout"))), 8000);
        c.requestAccessToken({ prompt: interactive ? "" : "none" });
      }),
  );
}

/** 유효한 토큰이 있으면 그대로, 없으면 조용히 갱신, 그것도 안 되면 팝업. */
export async function getToken(): Promise<string> {
  if (token && Date.now() < expiresAt) return token;
  try {
    return await requestToken(false);
  } catch {
    return requestToken(true);
  }
}

export function isSignedIn(): boolean {
  return !!token && Date.now() < expiresAt;
}

export function dropToken(): void {
  token = null;
  expiresAt = 0;
  persist();
}

export async function signOut(): Promise<void> {
  const t = token;
  dropToken();
  if (t && window.google?.accounts?.oauth2) {
    await new Promise<void>((res) => window.google!.accounts.oauth2.revoke(t, res));
  }
}
