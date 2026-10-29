import { useEffect, useRef, useState } from "react";
import ClassSheet from "./ClassSheet";
import type { ExtEvent } from "../model/items";
import { STATUS_LABEL } from "../model/timetable";
import type { SheetState } from "../App";
import type { ISODate } from "../model/dates";
import { addDays, formatKoDate, todayKST } from "../model/dates";
import { goalPercent } from "../model/items";
import { dayCap, dayLoad, isGoalAlive, isGoalOverdue, loadLevel, quota } from "../model/plan";
import { loadAround, refresh, selectChecks, selectExt, selectGoals, setGoalCurrent, toggleCheck, toggleExt, useStore } from "../store";
import Checkbox from "../ui/Checkbox";
import { ChevronLeft, ChevronRight, Minus, Plus, Refresh } from "../ui/Icons";
import PipMeter from "../ui/PipMeter";

export default function Today({ onOpenSheet }: { onOpenSheet: (s: SheetState) => void }) {
  const s = useStore();
  const [date, setDate] = useState<ISODate>(todayKST());
  const [classSheet, setClassSheet] = useState<ExtEvent | null>(null);
  const today = todayKST();

  // 로드된 범위 밖으로 나가면 그 날짜 주변을 다시 읽는다.
  useEffect(() => {
    if (s.window && (date < s.window.from || date >= s.window.to) && !s.loading) void loadAround(date);
  }, [date, s.window, s.loading]);

  const checks = selectChecks(s).filter((c) => c.date === date);
  const goals = selectGoals(s)
    .filter((g) => isGoalAlive(g, date, today))
    .sort((a, b) => (a.due < b.due ? -1 : 1));
  const ext = selectExt(s)
    .filter((e) => e.date === date)
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || (a.startTime ?? "").localeCompare(b.startTime ?? ""));

  const load = dayLoad(date, selectChecks(s), selectGoals(s), today);
  const cap = dayCap(date, s.settings, selectExt(s));
  const level = loadLevel(load, cap);
  const total = ext.length + checks.length + goals.length;
  const doneCount = ext.filter((e) => e.done).length + checks.filter((c) => c.done).length + goals.filter((g) => quota(g, date) === 0).length;
  const isToday = date === today;
  const firstLoad = s.loading && Object.keys(s.items).length === 0;

  // 좌우 스와이프로 어제·내일
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY });
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 40) setDate(addDays(date, dx < 0 ? 1 : -1));
  };

  const relLabel = isToday ? "오늘" : date === addDays(today, 1) ? "내일" : date === addDays(today, -1) ? "어제" : null;

  return (
    <div className="today" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <header className="bar">
        <button className="ghost icon" onClick={() => setDate(addDays(date, -1))} aria-label="하루 전">
          <ChevronLeft />
        </button>
        <div className="title" onClick={() => setDate(today)} title="오늘로">
          <strong>{formatKoDate(date)}</strong>
          {relLabel ? <span className={`chip ${isToday ? "" : "ghost"}`}>{relLabel}</span> : <span className="chip ghost">오늘로</span>}
        </div>
        <button className="ghost icon" onClick={() => setDate(addDays(date, 1))} aria-label="하루 뒤">
          <ChevronRight />
        </button>
      </header>

      <div className={`stats ${level}`}>
        <span className="num">
          <b>{load}</b> / {cap}회차
        </span>
        <PipMeter load={load} cap={cap} level={level} />
        <span className="done">
          {doneCount}/{total} 완료
        </span>
        <button className="ghost icon" onClick={() => void refresh()} disabled={s.loading} aria-label="다시 읽기" title="다시 읽기">
          <Refresh size={18} />
        </button>
      </div>

      {firstLoad && (
        <section>
          <h2>일정</h2>
          <ul className="list" aria-busy="true">
            {[1, 2, 3].map((i) => (
              <li key={i} className="row">
                <span className={`skel w${i}`} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {ext.length > 0 && (
        <section>
          <h2>
            일정 <span className="count">{ext.filter((e) => e.done).length}/{ext.length}</span>
          </h2>
          <ul className="list">
            {ext.map((e) => {
              const st = e.klass?.status ?? "normal";
              const cancelled = st === "cancelled";
              return (
                <li key={e.calendarId + e.id} className={`${e.done ? "done" : ""} ${cancelled ? "cancelled" : ""}`}>
                  <label>
                    {cancelled ? <span className="cb-void" aria-hidden="true" /> : <Checkbox checked={e.done} onChange={() => void toggleExt(e)} />}
                    <span className="time">{e.allDay ? "종일" : `${e.startTime}–${e.endTime}`}</span>
                    <span
                      className="text"
                      onClick={
                        e.klass
                          ? (ev) => {
                              ev.preventDefault();
                              setClassSheet(e);
                            }
                          : undefined
                      }
                    >
                      <span className="strike">{e.title}</span>
                      {e.klass && st !== "normal" && <span className={`tag st-${st}`}>{STATUS_LABEL[st]}</span>}
                      {e.klass?.room && <span className="room">{e.klass.room}</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h2>
          할 일{" "}
          {checks.length + goals.length > 0 && (
            <span className="count">
              {checks.filter((c) => c.done).length + goals.filter((g) => quota(g, date) === 0).length}/{checks.length + goals.length}
            </span>
          )}
        </h2>
        {!firstLoad && checks.length === 0 && goals.length === 0 && (
          <p className="empty">
            {isToday ? (
              <>
                <strong>오늘 놓인 할 일이 없어요.</strong> 오른쪽 아래 + 로 체크 항목이나 며칠에 걸친 목표를 추가하면, 목표는 남은 날에 맞춰 오늘 몫이 계산돼요.
              </>
            ) : (
              <>
                <strong>이 날에 놓인 할 일이 없어요.</strong> 주간 탭에서 날짜별 부하를 보고 옮길 수 있어요.
              </>
            )}
          </p>
        )}
        <ul className="list">
          {checks.map((c) => (
            <li key={c.id} className={c.done ? "done" : ""}>
              <label>
                <Checkbox checked={c.done} onChange={() => void toggleCheck(c)} />
                <span
                  className="text"
                  onClick={(ev) => {
                    ev.preventDefault();
                    onOpenSheet({ mode: "edit", item: c });
                  }}
                >
                  <span className="strike">{c.title}</span>
                  {c.rolled > 0 && <span className="tag">이월 {c.rolled}</span>}
                </span>
              </label>
            </li>
          ))}
          {goals.map((g) => {
            const q = quota(g, date);
            const overdue = isGoalOverdue(g, date);
            const pct = goalPercent(g);
            // 오늘 몫을 다 채우면 닿는 지점 — 진행 바 위의 작은 눈금
            const targetPct = g.target > 0 ? Math.min(100, Math.round(((g.current + q) / g.target) * 100)) : 0;
            return (
              <li key={g.id} className={`goal ${q === 0 ? "done" : ""}`}>
                <div className="goal-head" onClick={() => onOpenSheet({ mode: "edit", item: g })}>
                  <span className="text">
                    {g.title}
                    {overdue && <span className="tag over">마감 지남</span>}
                    {!overdue && !isToday && <span className="tag">~{formatKoDate(g.due)}</span>}
                  </span>
                  <span className="count">
                    <b>{g.current}</b>/{g.target}
                    {g.unit} · {pct}%
                  </span>
                </div>
                <div className="progress" aria-hidden="true">
                  <i style={{ transform: `scaleX(${pct / 100})` }} />
                  {q > 0 && targetPct < 100 && <u style={{ left: `${targetPct}%` }} />}
                </div>
                <div className="goal-foot">
                  <span className="quota">
                    {q === 0 ? (
                      "오늘 몫 끝"
                    ) : (
                      <>
                        오늘 몫 <b>{q}</b>
                        {g.unit}
                        {!isToday && " · 오늘 기준 추정"}
                      </>
                    )}
                  </span>
                  {isToday && (
                    <span className="stepper">
                      <button onClick={() => void setGoalCurrent(g, g.current - 1)} disabled={g.current <= 0} aria-label="1 빼기">
                        <Minus size={16} />
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={g.target}
                        value={g.current}
                        onChange={(e) => void setGoalCurrent(g, Number(e.target.value))}
                        aria-label={`${g.title} 현재 ${g.unit}`}
                      />
                      <button className="primary" onClick={() => void setGoalCurrent(g, g.current + 1)} disabled={g.current >= g.target} aria-label="1 더하기">
                        <Plus size={16} />
                      </button>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      {classSheet && <ClassSheet event={classSheet} onClose={() => setClassSheet(null)} />}
    </div>
  );
}
