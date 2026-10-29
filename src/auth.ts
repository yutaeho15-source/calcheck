// Google Identity Services 토큰 클라이언트 (스펙 6절).
// 서버 없이 브라우저에서 1시간짜리 access token만 받는다. refresh token은 쓰지 않는다 —
// 그래서 동의 화면이 "테스트" 상태여도 7일 만료 문제가 없고, 저장할 비밀도 없다.
// 토큰은 메모리에만 둔다. localStorage에 남기면 그것이 또 하나의 "원본"이 된다.

export const SCOPE = "https://www.googleapis.com/auth/calendar";
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken(opts?: { prompt?: string }): void;
  callback?: (r: TokenResponse) => void;
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

export function hasClientId(): boolean {
  return !!CLIENT_ID;
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
  client = window.google!.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: () => {},
  });
  return client;
}

/**
 * 토큰을 요청한다. prompt=''는 이미 동의한 사용자에게 팝업을 최소화한다.
 * 첫 로그인은 prompt='consent' 대신 기본값(빈 문자열)으로 두면 구글이 알아서 동의 화면을 띄운다.
 */
export function requestToken(interactive = true): Promise<string> {
  return ensureClient().then(
    (c) =>
      new Promise<string>((resolve, reject) => {
        c.callback = (r) => {
          if (r.error || !r.access_token) {
            reject(new Error(r.error_description ?? r.error ?? "토큰 발급 실패"));
            return;
          }
          token = r.access_token;
          // 만료 60초 전부터 갱신 대상으로 본다.
          expiresAt = Date.now() + ((r.expires_in ?? 3600) - 60) * 1000;
          resolve(token);
        };
        c.requestAccessToken({ prompt: interactive ? "" : "none" });
      }),
  );
}

/** 유효한 토큰이 있으면 그대로, 없으면 새로 요청. */
export async function getToken(): Promise<string> {
  if (token && Date.now() < expiresAt) return token;
  return requestToken(true);
}

export function isSignedIn(): boolean {
  return !!token && Date.now() < expiresAt;
}

export function dropToken(): void {
  token = null;
  expiresAt = 0;
}

export async function signOut(): Promise<void> {
  const t = token;
  dropToken();
  if (t && window.google?.accounts?.oauth2) {
    await new Promise<void>((res) => window.google!.accounts.oauth2.revoke(t, res));
  }
}
