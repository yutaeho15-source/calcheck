// 설정 → 시간표. 수업 목록 편집, 텍스트 붙여넣기, 캘린더 반영, 회차 상태 조절.
import { useEffect, useMemo, useState } from "react";
import type { ISODate } from "../model/dates";
import { formatKoDate, todayKST } from "../model/dates";
import type { ClassDef, ClassStatus } from "../model/timetable";
import { DAY_KO, STATUS_LABEL, defKey, formatTimetableText, parseTimetableText } from "../model/timetable";
import { addOneOffClass, deleteOneOff, setClassStatusOn, setSemester, syncTimetable, useStore } from "../store";
import { Plus, Trash } from "../ui/Icons";

const EXAMPLE = `객체지향프로그래밍 | 월 09:00-10:15, 수 09:00-10:15 | 공학관 301
인공지능 | 화 11:00-12:15 | IT관 204`;

const STATUSES: ClassStatus[] = ["cancelled", "exam", "online", "assignment", "normal"];

export default function Timetable() {
  const s = useStore();
  const [defs, setDefs] = useState<ClassDef[]>(s.classes);
  const [dirty, setDirty] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteErrors, setPasteErrors] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);

  // 캘린더에서 다시 읽어 오면 편집 중이 아닐 때만 덮어쓴다
  useEffect(() => {
    if (!dirty) setDefs(s.classes);
  }, [s.classes, dirty]);

  const sorted = useMemo(() => [...defs].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start)), [defs]);

  const edit = (i: number, patch: Partial<ClassDef>) => {
    setDefs((d) => d.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    setDirty(true);
  };
  const removeAt = (i: number) => {
    setDefs((d) => d.filter((_, j) => j !== i));
    setDirty(true);
  };
  const addRow = () => {
    setDefs((d) => [...d, { title: "", day: 1, start: "09:00", end: "10:15" }]);
    setDirty(true);
  };
  const applyPaste = () => {
    const { defs: parsed, errors } = parseTimetableText(pasteText);
    setPasteErrors(errors);
    if (parsed.length > 0 && errors.length === 0) {
      // 같은 키는 기존 ID를 이어받아 "변경 없음"으로 인식되게
      const byKey = new Map(defs.map((d) => [defKey(d), d]));
      setDefs(parsed.map((d) => ({ ...d, id: byKey.get(defKey(d))?.id })));
      setDirty(true);
      setPasteOpen(false);
      setPasteText("");
    }
  };
  const save = async () => {
    const clean = defs.filter((d) => d.title.trim() && d.start < d.end);
    const r = await syncTimetable(clean);
    if (r) {
      setDirty(false);
      setResult(`반영 완료 — 추가 ${r.added}, 유지 ${r.kept}, 삭제 ${r.removed}`);
      setTimeout(() => setResult(null), 4000);
    }
  };

  // ---- 회차 상태 폼 ----
  const [fDef, setFDef] = useState<string>("");
  const [fDate, setFDate] = useState<ISODate>(todayKST());
  const [fStatus, setFStatus] = useState<ClassStatus>("cancelled");
  const [mkTitle, setMkTitle] = useState("");
  const [mkStart, setMkStart] = useState("09:00");
  const [mkEnd, setMkEnd] = useState("10:15");
  const [mkRoom, setMkRoom] = useState("");
  const [busy, setBusy] = useState(false);
  const classesById = useMemo(() => new Map(s.classes.filter((c) => c.id).map((c) => [c.id!, c])), [s.classes]);

  const applyStatus = async () => {
    setBusy(true);
    if (fStatus === "makeup") {
      await addOneOffClass(mkTitle.trim() || "보강", fDate, mkStart, mkEnd, "makeup", mkRoom.trim() || undefined);
    } else {
      const def = classesById.get(fDef);
      if (def) await setClassStatusOn(def, fDate, fStatus);
    }
    setBusy(false);
  };

  // 선택한 날짜의 요일에 있는 수업만 고를 수 있게
  const dayOf = new Date(fDate + "T00:00:00Z").getUTCDay();
  const candidates = s.classes.filter((c) => c.id && c.day === dayOf);
  useEffect(() => {
    if (!candidates.some((c) => c.id === fDef)) setFDef(candidates[0]?.id ?? "");
  }, [fDate, s.classes]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <section>
        <h2>학기 기간</h2>
        <p className="hint">수업은 이 기간 안에서만 매주 반복돼요. 기간을 바꾼 뒤엔 "캘린더에 반영"을 다시 눌러야 해요.</p>
        <div className="row">
          <label className="field">
            <span>시작</span>
            <input type="date" value={s.semester.start} onChange={(e) => setSemester({ ...s.semester, start: e.target.value })} />
          </label>
          <label className="field">
            <span>끝</span>
            <input type="date" value={s.semester.end} min={s.semester.start} onChange={(e) => setSemester({ ...s.semester, end: e.target.value })} />
          </label>
        </div>
      </section>

      <section>
        <h2>
          시간표 <span className="count">{sorted.length}개 수업</span>
        </h2>
        <p className="hint">
          에브리타임 시간표 캡처를 Claude에게 보내면 아래 형식의 텍스트로 바꿔 줘요. 그걸 "텍스트로 붙여넣기"에 넣으면 끝. 직접 한 줄씩 고쳐도 돼요.
        </p>

        {sorted.length === 0 && !pasteOpen && (
          <p className="empty">
            <strong>아직 수업이 없어요.</strong> 붙여넣기나 + 로 추가하세요.
          </p>
        )}

        <ul className="list tt">
          {sorted.map((d) => {
            const i = defs.indexOf(d);
            return (
              <li key={d.id ?? `new-${i}`} className="tt-row">
                <input className="tt-title" value={d.title} placeholder="과목명" onChange={(e) => edit(i, { title: e.target.value })} aria-label="과목명" />
                <select value={d.day} onChange={(e) => edit(i, { day: Number(e.target.value) })} aria-label="요일">
                  {[1, 2, 3, 4, 5, 6, 0].map((w) => (
                    <option key={w} value={w}>
                      {DAY_KO[w]}
                    </option>
                  ))}
                </select>
                <input type="time" value={d.start} onChange={(e) => edit(i, { start: e.target.value })} aria-label="시작" />
                <span className="muted">–</span>
                <input type="time" value={d.end} onChange={(e) => edit(i, { end: e.target.value })} aria-label="끝" />
                <input className="tt-room" value={d.room ?? ""} placeholder="강의실" onChange={(e) => edit(i, { room: e.target.value })} aria-label="강의실" />
                <button className="ghost icon small" onClick={() => removeAt(i)} aria-label="이 수업 삭제">
                  <Trash size={16} />
                </button>
              </li>
            );
          })}
        </ul>

        <div className="tt-actions">
          <button className="small" onClick={addRow}>
            <Plus size={14} /> 수업 추가
          </button>
          <button className="small ghost" onClick={() => { setPasteText(formatTimetableText(defs)); setPasteOpen((v) => !v); }}>
            텍스트로 붙여넣기
          </button>
          <span style={{ flex: 1 }} />
          <button className="small primary" onClick={() => void save()} disabled={!dirty || s.loading}>
            {s.loading ? "반영 중…" : "캘린더에 반영"}
          </button>
        </div>
        {result && <p className="hint ok">{result}</p>}

        {pasteOpen && (
          <div className="paste">
            <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={6} placeholder={EXAMPLE} spellCheck={false} />
            {pasteErrors.length > 0 && (
              <ul className="errors">
                {pasteErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            <div className="tt-actions">
              <span className="hint" style={{ margin: 0 }}>
                한 줄에 수업 하나: <code>과목명 | 월 09:00-10:15, 수 09:00-10:15 | 강의실</code>
              </span>
              <span style={{ flex: 1 }} />
              <button className="small ghost" onClick={() => setPasteOpen(false)}>
                취소
              </button>
              <button className="small primary" onClick={applyPaste} disabled={!pasteText.trim()}>
                목록으로 가져오기
              </button>
            </div>
          </div>
        )}
        {dirty && <p className="hint warn">아직 캘린더에 반영 안 된 변경이 있어요.</p>}
      </section>

      <section>
        <h2>수업 상태 조절</h2>
        <p className="hint">특정 날짜의 한 회차에 휴강·시험 같은 상태를 붙여요. 오늘 뷰에서 수업을 눌러도 같은 걸 할 수 있어요.</p>
        <div className="row">
          <label className="field">
            <span>날짜</span>
            <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} />
          </label>
          <label className="field">
            <span>상태</span>
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value as ClassStatus)}>
              {STATUSES.map((st) => (
                <option key={st} value={st}>
                  {STATUS_LABEL[st]}
                </option>
              ))}
              <option value="makeup">보강 (일회 추가)</option>
            </select>
          </label>
        </div>
        {fStatus === "makeup" ? (
          <>
            <label className="field">
              <span>과목명</span>
              <input value={mkTitle} onChange={(e) => setMkTitle(e.target.value)} placeholder="보강할 과목" list="class-names" />
              <datalist id="class-names">
                {[...new Set(s.classes.map((c) => c.title))].map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>
            <div className="row">
              <label className="field">
                <span>시작</span>
                <input type="time" value={mkStart} onChange={(e) => setMkStart(e.target.value)} />
              </label>
              <label className="field">
                <span>끝</span>
                <input type="time" value={mkEnd} onChange={(e) => setMkEnd(e.target.value)} />
              </label>
              <label className="field">
                <span>강의실</span>
                <input value={mkRoom} onChange={(e) => setMkRoom(e.target.value)} placeholder="선택" />
              </label>
            </div>
          </>
        ) : (
          <label className="field">
            <span>수업 ({DAY_KO[dayOf]}요일)</span>
            {candidates.length > 0 ? (
              <select value={fDef} onChange={(e) => setFDef(e.target.value)}>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.start} {c.title}
                  </option>
                ))}
              </select>
            ) : (
              <p className="hint" style={{ margin: "4px 0 0" }}>
                이 요일엔 반영된 수업이 없어요.
              </p>
            )}
          </label>
        )}
        <div className="tt-actions">
          <span style={{ flex: 1 }} />
          <button className="small primary" onClick={() => void applyStatus()} disabled={busy || (fStatus !== "makeup" && !fDef) || (fStatus === "makeup" && mkStart >= mkEnd)}>
            {busy ? "적용 중…" : "적용"}
          </button>
        </div>

        <h3 className="sub">
          이번 학기 예외 <span className="count">{s.exceptions.length}</span>
        </h3>
        {s.exceptions.length === 0 ? (
          <p className="empty">정상이 아닌 회차가 없어요.</p>
        ) : (
          <ul className="list">
            {s.exceptions.map((e) => (
              <li key={e.id} className="row static">
                <span className="time">{formatKoDate(e.date)}</span>
                <span className="text">
                  {e.title}
                  <span className={`tag st-${e.klass!.status}`}>{STATUS_LABEL[e.klass!.status]}</span>
                  <span className="muted small"> {e.startTime}–{e.endTime}</span>
                </span>
                {e.klass!.masterId ? (
                  <button
                    className="small ghost"
                    onClick={() => {
                      const def = classesById.get(e.klass!.masterId!);
                      if (def) void setClassStatusOn(def, e.date, "normal");
                    }}
                  >
                    정상으로
                  </button>
                ) : (
                  <button className="small ghost" onClick={() => void deleteOneOff(e)} aria-label="삭제">
                    <Trash size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
