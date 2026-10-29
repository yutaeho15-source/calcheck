import { useEffect, useState } from "react";
import { hasClientId } from "./auth";
import type { CheckItem, Goal } from "./model/items";
import type { ISODate } from "./model/dates";
import { todayKST } from "./model/dates";
import { clearError, refresh, signIn, useStore } from "./store";
import { Mark, MonthIcon, Plus, SettingsIcon, TodayIcon, WeekIcon } from "./ui/Icons";
import EditSheet from "./views/EditSheet";
import Month from "./views/Month";
import Settings from "./views/Settings";
import Today from "./views/Today";
import Week from "./views/Week";

type Tab = "today" | "week" | "month" | "settings";
export type SheetState = { mode: "new"; date: ISODate } | { mode: "edit"; item: CheckItem | Goal } | null;

export default function App() {
  const s = useStore();
  const [tab, setTab] = useState<Tab>("today");
  const [sheet, setSheet] = useState<SheetState>(null);

  // 포그라운드로 돌아올 때 다시 읽는다 — 위젯에서 바꾼 것이 여기서 반영된다 (스펙 6절 갱신 시점).
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && s.signedIn) void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [s.signedIn]);

  if (!s.signedIn) {
    return (
      <div className="screen center">
        <Mark className="mark" size={64} />
        <h1>CalCheck</h1>
        <p className="muted">구글 캘린더를 그대로 원본으로 쓰는 체크리스트. 오늘 일정을 체크하고, 쌓인 일을 회차로 나눠요.</p>
        {hasClientId() ? (
          <button className="primary" onClick={() => void signIn()} disabled={s.loading}>
            {s.loading ? "로그인 중…" : "Google로 로그인"}
          </button>
        ) : (
          <p className="error">
            <code>VITE_GOOGLE_CLIENT_ID</code>가 설정되지 않았습니다. <code>.env</code>를 만들고 다시 실행하세요.
          </p>
        )}
        {s.error && <p className="error">{s.error}</p>}
      </div>
    );
  }

  return (
    <div className="screen">
      <main className="content">
        {tab === "today" && <Today onOpenSheet={setSheet} />}
        {tab === "week" && <Week onOpenSheet={setSheet} />}
        {tab === "month" && <Month onOpenSheet={setSheet} />}
        {tab === "settings" && <Settings />}
      </main>

      {s.error && (
        <div className="toast" role="alert" onClick={clearError}>
          <b>오류</b>
          {s.error} — 눌러서 닫기
        </div>
      )}

      {tab !== "settings" && (
        <button className="fab" aria-label="항목 추가" onClick={() => setSheet({ mode: "new", date: todayKST() })}>
          <Plus size={26} />
        </button>
      )}

      <nav className="tabs" aria-label="화면">
        <button className={tab === "today" ? "on" : ""} onClick={() => setTab("today")} aria-current={tab === "today" ? "page" : undefined}>
          <TodayIcon />
          오늘
        </button>
        <button className={tab === "week" ? "on" : ""} onClick={() => setTab("week")} aria-current={tab === "week" ? "page" : undefined}>
          <WeekIcon />
          주간
        </button>
        <button className={tab === "month" ? "on" : ""} onClick={() => setTab("month")} aria-current={tab === "month" ? "page" : undefined}>
          <MonthIcon />
          월간
        </button>
        <button className={tab === "settings" ? "on" : ""} onClick={() => setTab("settings")} aria-current={tab === "settings" ? "page" : undefined}>
          <SettingsIcon />
          설정
        </button>
      </nav>

      {sheet && <EditSheet state={sheet} onClose={() => setSheet(null)} />}
    </div>
  );
}
