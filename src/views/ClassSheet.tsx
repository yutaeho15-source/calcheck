// 수업 한 회차의 상태를 바꾸는 작은 시트. 오늘 뷰에서 수업을 탭하면 뜬다.
import { useEffect } from "react";
import { formatKoDate } from "../model/dates";
import type { ExtEvent } from "../model/items";
import type { ClassStatus } from "../model/timetable";
import { STATUS_LABEL } from "../model/timetable";
import { deleteOneOff, setClassStatus } from "../store";
import { Trash } from "../ui/Icons";

const ORDER: ClassStatus[] = ["normal", "cancelled", "exam", "online", "assignment", "makeup"];

export default function ClassSheet({ event, onClose }: { event: ExtEvent; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const k = event.klass!;
  const isOneOff = !k.masterId;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="수업 상태" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <p className="sheet-title">
          <strong>{event.title}</strong>
          <span className="muted">
            {" "}
            · {formatKoDate(event.date)} {event.startTime}–{event.endTime}
            {k.room ? ` · ${k.room}` : ""}
          </span>
        </p>
        <div className="status-grid" role="radiogroup" aria-label="이 회차의 상태">
          {ORDER.map((st) => (
            <button
              key={st}
              role="radio"
              aria-checked={k.status === st}
              className={`status-opt ${st} ${k.status === st ? "on" : ""}`}
              onClick={() => {
                void setClassStatus(event, st);
                onClose();
              }}
            >
              {STATUS_LABEL[st]}
            </button>
          ))}
        </div>
        <p className="hint">이 날 한 회차에만 적용돼요. 캘린더 위젯에는 "휴강 · 과목명"처럼 제목 앞에 붙어서 보여요.</p>
        <div className="sheet-actions">
          {isOneOff && (
            <button
              className="danger"
              onClick={() => {
                void deleteOneOff(event);
                onClose();
              }}
            >
              <Trash size={18} /> 이 회차 삭제
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button className="ghost" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
