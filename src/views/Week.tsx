import { useEffect, useState } from "react";
import type { SheetState } from "../App";
import type { ISODate } from "../model/dates";
import { addDays, formatKoDate, startOfWeek, todayKST, weekday } from "../model/dates";
import { dayCap, dayLoad, isGoalAlive, loadLevel, quota } from "../model/plan";
import { loadAround, selectChecks, selectExt, selectGoals, useStore } from "../store";
import { ChevronLeft, ChevronRight } from "../ui/Icons";

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

export default function Week({ onOpenSheet }: { onOpenSheet: (s: SheetState) => void }) {
  const s = useStore();
  const today = todayKST();
  const [weekStart, setWeekStart] = useState<ISODate>(startOfWeek(today));
  const [picked, setPicked] = useState<ISODate>(today);

  const weekEnd = addDays(weekStart, 7);
  useEffect(() => {
    if (s.window && (weekStart < s.window.from || weekEnd > s.window.to) && !s.loading) void loadAround(weekStart);
  }, [weekStart, weekEnd, s.window, s.loading]);

  const checks = selectChecks(s);
  const goals = selectGoals(s);
  const ext = selectExt(s);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const rows = days.map((d) => {
    const load = dayLoad(d, checks, goals, today);
    const cap = dayCap(d, s.data.settings, ext);
    return { d, load, cap, level: loadLevel(load, cap) };
  });
  const maxV = Math.max(1, ...rows.map((r) => Math.max(r.load, r.cap)));

  // SVG 좌표계: 7칸, 막대 높이 110, 위 여백 22(숫자), 아래 여백 22(요일)
  const W = 340, colW = W / 7, barW = 22, top = 24, H = 110, bottom = 22;
  const y = (v: number) => top + H - (v / maxV) * H;

  const pickedChecks = checks.filter((c) => c.date === picked);
  const pickedGoals = goals.filter((g) => isGoalAlive(g, picked, today)).sort((a, b) => (a.due < b.due ? -1 : 1));
  const isThisWeek = weekStart === startOfWeek(today);

  return (
    <div className="week">
      <header className="bar">
        <button className="ghost icon" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="지난 주">
          <ChevronLeft />
        </button>
        <div
          className="title"
          onClick={() => {
            setWeekStart(startOfWeek(today));
            setPicked(today);
          }}
          title="이번 주로"
        >
          <strong>{formatKoDate(weekStart).replace(/ \(.\)$/, "")} – {formatKoDate(addDays(weekStart, 6)).replace(/ \(.\)$/, "")}</strong>
          {isThisWeek ? <span className="chip">이번 주</span> : <span className="chip ghost">이번 주로</span>}
        </div>
        <button className="ghost icon" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="다음 주">
          <ChevronRight />
        </button>
      </header>

      <svg className="weekchart" viewBox={`0 0 ${W} ${top + H + bottom}`} role="img" aria-label="요일별 부하와 상한">
        {rows.map((r, i) => {
          const cx = colW * i + colW / 2;
          const fillH = Math.max(0, (Math.min(r.load, maxV) / maxV) * H);
          const isPicked = r.d === picked;
          const isToday = r.d === today;
          return (
            <g key={r.d} className="col" onClick={() => setPicked(r.d)}>
              {isPicked && <rect className="pick" x={colW * i + 3} y={4} width={colW - 6} height={top + H + bottom - 8} />}
              <rect className="track" x={cx - barW / 2} y={top} width={barW} height={H} rx={5} />
              {r.load > 0 && <rect className={`fill ${r.level}`} x={cx - barW / 2} y={top + H - fillH} width={barW} height={fillH} rx={5} />}
              <line className="capline" x1={cx - barW / 2 - 5} x2={cx + barW / 2 + 5} y1={y(r.cap)} y2={y(r.cap)} />
              <text className="num" x={cx} y={top - 8}>
                {r.load}
                <tspan>/{r.cap}</tspan>
              </text>
              <text className={`day ${isToday ? "today" : ""}`} x={cx} y={top + H + 16}>
                {DAY_NAMES[weekday(r.d)]} {Number(r.d.slice(8))}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="legend">
        <span>
          <s style={{ background: "var(--ink)" }} />
          부하(회차)
        </span>
        <span>
          <i />
          상한
        </span>
        <span>
          <s style={{ background: "var(--warn)" }} />
          80% 이상
        </span>
        <span>
          <s style={{ background: "var(--over)" }} />
          초과
        </span>
      </p>

      <section>
        <h2>
          {formatKoDate(picked)}
          {picked === today && <span className="count">오늘</span>}
        </h2>
        {pickedChecks.length === 0 && pickedGoals.length === 0 && (
          <p className="empty">
            <strong>이 날엔 놓인 할 일이 없어요.</strong> 막대를 눌러 다른 날을 보거나, 항목을 눌러 날짜를 옮겨 오세요.
          </p>
        )}
        <ul className="list">
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
                <span className="tag">~{formatKoDate(g.due)}</span>
              </span>
              <span className="muted small">
                몫 {quota(g, picked)}
                {g.unit}
              </span>
            </li>
          ))}
        </ul>
        {(pickedChecks.length > 0 || pickedGoals.length > 0) && (
          <p className="hint">항목을 누르면 날짜·기간을 바꿀 수 있어요. 목표는 시작일을 당기거나 마감을 미는 것만으로 분배가 바뀌어요.</p>
        )}
      </section>
    </div>
  );
}
