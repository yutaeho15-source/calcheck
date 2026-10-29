import { useEffect, useState } from "react";
import type { SheetState } from "../App";
import type { ISODate } from "../model/dates";
import { addDays, daysBetween, formatKoDate, startOfWeek, todayKST } from "../model/dates";
import { dayCap, dayLoad, isGoalAlive, loadLevel, quota } from "../model/plan";
import { loadRange, selectChecks, selectExt, selectGoals, useStore } from "../store";
import { ChevronLeft, ChevronRight } from "../ui/Icons";

const DAY_HEAD = ["월", "화", "수", "목", "금", "토", "일"];

function monthStart(d: ISODate): ISODate {
  return d.slice(0, 8) + "01";
}
function addMonths(d: ISODate, n: number): ISODate {
  const [y, m] = d.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

export default function Month({ onOpenSheet }: { onOpenSheet: (s: SheetState) => void }) {
  const s = useStore();
  const today = todayKST();
  const [month, setMonth] = useState<ISODate>(monthStart(today));
  const [picked, setPicked] = useState<ISODate>(today);

  // 달력 그리드: 그 달 1일이 속한 주의 월요일부터 6주(42일). 항상 6줄이라 달이 바뀌어도 높이가 안 흔들린다.
  const gridStart = startOfWeek(month);
  const gridEnd = addDays(gridStart, 42);
  const nextMonth = addMonths(month, 1);

  useEffect(() => {
    if (!s.window || gridStart < s.window.from || gridEnd > s.window.to) {
      if (!s.loading) void loadRange(gridStart, gridEnd);
    }
  }, [gridStart, gridEnd, s.window, s.loading]);

  const checks = selectChecks(s);
  const goals = selectGoals(s);
  const ext = selectExt(s);

  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = addDays(gridStart, i);
    const inMonth = d >= month && d < nextMonth;
    const load = dayLoad(d, checks, goals, today);
    const cap = dayCap(d, s.settings, ext);
    const level = loadLevel(load, cap);
    const nChecks = checks.filter((c) => c.date === d).length;
    const nGoals = goals.filter((g) => isGoalAlive(g, d, today)).length;
    const nExt = ext.filter((e) => e.date === d).length;
    return { d, inMonth, load, cap, level, ratio: cap > 0 ? Math.min(1, load / cap) : load > 0 ? 1 : 0, items: nChecks + nGoals, nExt };
  });

  // 목표를 주 단위 가로줄로 — 달력 위에서 "며칠에 걸친 일"이 보인다.
  const weeks = Array.from({ length: 6 }, (_, w) => {
    const ws = addDays(gridStart, w * 7);
    const we = addDays(ws, 6);
    const spans = goals
      .filter((g) => !g.done && g.start <= we && g.due >= ws)
      .sort((a, b) => (a.start < b.start ? -1 : 1))
      .slice(0, 3)
      .map((g) => {
        const from = g.start < ws ? 0 : daysBetween(ws, g.start);
        const to = g.due > we ? 6 : daysBetween(ws, g.due);
        return { g, from, to, openL: g.start < ws, openR: g.due > we };
      });
    return { ws, spans };
  });

  const pickedChecks = checks.filter((c) => c.date === picked);
  const pickedGoals = goals.filter((g) => isGoalAlive(g, picked, today)).sort((a, b) => (a.due < b.due ? -1 : 1));
  const pickedExt = ext.filter((e) => e.date === picked).sort((a, b) => Number(b.allDay) - Number(a.allDay) || (a.startTime ?? "").localeCompare(b.startTime ?? ""));
  const isThisMonth = month === monthStart(today);
  const [y, m] = month.split("-").map(Number);

  return (
    <div className="month">
      <header className="bar">
        <button className="ghost icon" onClick={() => setMonth(addMonths(month, -1))} aria-label="지난 달">
          <ChevronLeft />
        </button>
        <div
          className="title"
          onClick={() => {
            setMonth(monthStart(today));
            setPicked(today);
          }}
          title="이번 달로"
        >
          <strong>
            {y}년 {m}월
          </strong>
          {isThisMonth ? <span className="chip">이번 달</span> : <span className="chip ghost">이번 달로</span>}
        </div>
        <button className="ghost icon" onClick={() => setMonth(addMonths(month, 1))} aria-label="다음 달">
          <ChevronRight />
        </button>
      </header>

      <div className="cal-head">
        {DAY_HEAD.map((h, i) => (
          <span key={h} className={i >= 5 ? "wk" : ""}>
            {h}
          </span>
        ))}
      </div>

      <div className="cal" role="grid" aria-label={`${y}년 ${m}월`}>
        {weeks.map((wk, w) => (
          <div key={wk.ws} className="cal-week" role="row">
            {cells.slice(w * 7, w * 7 + 7).map((c) => (
              <button
                key={c.d}
                role="gridcell"
                className={`cal-cell ${c.inMonth ? "" : "out"} ${c.d === today ? "today" : ""} ${c.d === picked ? "picked" : ""} ${c.level}`}
                onClick={() => setPicked(c.d)}
                aria-label={`${formatKoDate(c.d)} 부하 ${c.load}/${c.cap}`}
              >
                <span className="cal-num">{Number(c.d.slice(8))}</span>
                {c.nExt > 0 && <span className="cal-ext" aria-hidden="true">{Array.from({ length: Math.min(c.nExt, 3) }, (_, i) => <i key={i} />)}</span>}
                {c.items > 0 && <span className="cal-count">{c.items}</span>}
                <span className="cal-bar" aria-hidden="true">
                  <i style={{ transform: `scaleX(${c.ratio})` }} />
                </span>
              </button>
            ))}
            {wk.spans.length > 0 && (
              <div className="cal-spans" aria-hidden="true">
                {wk.spans.map(({ g, from, to, openL, openR }, i) => (
                  <span
                    key={g.id}
                    className={`cal-span ${openL ? "open-l" : ""} ${openR ? "open-r" : ""}`}
                    style={{ gridColumn: `${from + 1} / ${to + 2}`, gridRow: i + 1 }}
                    title={g.title}
                  >
                    {!openL && <b>{g.title}</b>}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="legend">
        <span>
          <s style={{ background: "var(--ink)" }} />
          칸 아래 막대 = 부하/상한
        </span>
        <span>
          <s style={{ background: "var(--accent)", height: 3 }} />
          목표 기간
        </span>
      </p>

      <section>
        <h2>
          {formatKoDate(picked)}
          {picked === today && <span className="count">오늘</span>}
        </h2>
        {pickedExt.length === 0 && pickedChecks.length === 0 && pickedGoals.length === 0 && (
          <p className="empty">
            <strong>이 날엔 아무것도 없어요.</strong> 다른 날을 누르거나, + 로 이 날에 할 일을 놓을 수 있어요.
          </p>
        )}
        <ul className="list">
          {pickedExt.map((e) => (
            <li key={e.calendarId + e.id} className={`row static ${e.done ? "done" : ""}`}>
              <span className="time">{e.allDay ? "종일" : `${e.startTime}–${e.endTime}`}</span>
              <span className="text">
                <span className="strike">{e.title}</span>
              </span>
            </li>
          ))}
          {pickedChecks.map((c) => (
            <li key={c.id} className={`row ${c.done ? "done" : ""}`} onClick={() => onOpenSheet({ mode: "edit", item: c })}>
              <span className="text">
                <span className="strike">{c.title}</span>
                {c.rolled > 0 && <span className="tag">이월 {c.rolled}</span>}
              </span>
              <span className="muted small">1회차</span>
            </li>
          ))}
          {pickedGoals.map((g) => (
            <li key={g.id} className="row" onClick={() => onOpenSheet({ mode: "edit", item: g })}>
              <span className="text">
                {g.title}
                <span className="tag">
                  {formatKoDate(g.start)} ~ {formatKoDate(g.due)}
                </span>
              </span>
              <span className="muted small">
                몫 {quota(g, picked)}
                {g.unit}
              </span>
            </li>
          ))}
        </ul>
        {pickedChecks.length + pickedGoals.length === 0 && pickedExt.length + pickedChecks.length + pickedGoals.length > 0 ? null : (
          <p className="hint" style={{ marginTop: 10 }}>
            <button className="small" onClick={() => onOpenSheet({ mode: "new", date: picked })}>
              이 날에 할 일 추가
            </button>
          </p>
        )}
      </section>
    </div>
  );
}
