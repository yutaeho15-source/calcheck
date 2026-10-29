import { useEffect, useState } from "react";
import type { SheetState } from "../App";
import type { ISODate } from "../model/dates";
import { addDays, daysBetween, todayKST } from "../model/dates";
import { createCheck, createGoal, deleteItem, updateCheck, updateGoal } from "../store";
import { Trash } from "../ui/Icons";

const UNITS = ["문제", "쪽", "회", "장", "개"];

export default function EditSheet({ state, onClose }: { state: NonNullable<SheetState>; onClose: () => void }) {
  const editing = state.mode === "edit" ? state.item : null;
  const [kind, setKind] = useState<"check" | "goal">(editing?.kind ?? "check");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [date, setDate] = useState<ISODate>(editing?.kind === "check" ? editing.date : state.mode === "new" ? state.date : todayKST());
  const [start, setStart] = useState<ISODate>(editing?.kind === "goal" ? editing.start : todayKST());
  const [due, setDue] = useState<ISODate>(editing?.kind === "goal" ? editing.due : addDays(todayKST(), 6));
  const [target, setTarget] = useState<number>(editing?.kind === "goal" ? editing.target : 10);
  const [unit, setUnit] = useState<string>(editing?.kind === "goal" ? editing.unit : "회");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const valid = title.trim().length > 0 && (kind === "check" || (target > 0 && due >= start));
  const span = kind === "goal" && due >= start ? daysBetween(start, due) + 1 : 0;
  const perDay = span > 0 ? Math.ceil(target / span) : 0;

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    const t = title.trim();
    if (editing) {
      if (editing.kind === "check") await updateCheck(editing, { title: t, date });
      else await updateGoal(editing, { title: t, start, due, target, unit });
    } else if (kind === "check") await createCheck(t, date);
    else await createGoal(t, start, due, target, unit);
    setBusy(false);
    onClose();
  };

  const del = async () => {
    if (!editing) return;
    if (!confirm("캘린더에서도 지워져요. 삭제할까요?")) return;
    setBusy(true);
    await deleteItem(editing);
    setBusy(false);
    onClose();
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={editing ? "항목 편집" : "항목 추가"} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        {!editing && (
          <div className="seg" role="tablist">
            <button role="tab" aria-selected={kind === "check"} className={kind === "check" ? "on" : ""} onClick={() => setKind("check")}>
              체크 항목
            </button>
            <button role="tab" aria-selected={kind === "goal"} className={kind === "goal" ? "on" : ""} onClick={() => setKind("goal")}>
              목표
            </button>
          </div>
        )}

        <label className="field">
          <span>제목</span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={kind === "check" ? "예: 보고서 초안" : "예: 족보 풀기"}
            onKeyDown={(e) => {
              if (e.key === "Enter" && valid) void save();
            }}
          />
        </label>

        {kind === "check" ? (
          <label className="field">
            <span>날짜</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        ) : (
          <>
            <div className="row">
              <label className="field">
                <span>시작</span>
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </label>
              <label className="field">
                <span>마감</span>
                <input type="date" value={due} min={start} onChange={(e) => setDue(e.target.value)} />
              </label>
            </div>
            <div className="row">
              <label className="field">
                <span>목표 회차</span>
                <input type="number" inputMode="numeric" min={1} value={target} onChange={(e) => setTarget(Number(e.target.value))} />
              </label>
              <label className="field">
                <span>단위</span>
                <input list="units" value={unit} onChange={(e) => setUnit(e.target.value)} />
                <datalist id="units">
                  {UNITS.map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
              </label>
            </div>
            <p className="hint">
              {span > 0 && target > 0 ? (
                <>
                  {span}일 동안 하루 <b>{perDay}</b>
                  {unit}꼴이에요. 덜 한 날이 있으면 다음 날 몫이 저절로 올라가요.
                </>
              ) : (
                "마감은 시작일과 같거나 뒤여야 해요."
              )}
              {editing?.kind === "goal" && (
                <>
                  {" "}
                  현재 {editing.current}/{editing.target}
                  {editing.unit}.
                </>
              )}
            </p>
          </>
        )}

        <div className="sheet-actions">
          {editing && (
            <button className="danger" onClick={() => void del()} disabled={busy}>
              <Trash size={18} /> 삭제
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button className="ghost" onClick={onClose} disabled={busy}>
            취소
          </button>
          <button className="primary" onClick={() => void save()} disabled={!valid || busy}>
            {busy ? "저장 중…" : editing ? "저장" : "추가"}
          </button>
        </div>
      </div>
    </div>
  );
}
