import { useRef, useState } from "react";
import { exportBackup, importBackup, resetData, setSelectedCalendars, setSettings, signOut, useStore } from "../store";
import Checkbox from "../ui/Checkbox";
import Timetable from "./Timetable";

export default function Settings() {
  const s = useStore();
  const st = s.data.settings;
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const doExport = () => {
    const blob = new Blob([exportBackup()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `calcheck-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const doImport = async (f: File | undefined) => {
    if (!f) return;
    const ok = importBackup(await f.text());
    setMsg(ok ? "가져왔어요." : "백업 파일이 아니에요.");
    setTimeout(() => setMsg(null), 3000);
  };
  const num = (v: string) => Math.max(0, Math.floor(Number(v) || 0));

  const toggleCal = (id: string) => {
    const sel = s.data.selectedCalendarIds;
    const next = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
    void setSelectedCalendars(next);
  };

  return (
    <div className="settings">
      <header className="bar">
        <div className="title">
          <strong>설정</strong>
        </div>
      </header>

      <section>
        <h2>하루 회차 상한</h2>
        <p className="hint">시간이 아니라 "하루에 몇 회차까지"로 과부하를 판단해요. 체감으로 정한 값이 빈 시간 계산보다 정직해요.</p>
        <div className="row">
          <label className="field">
            <span>평일</span>
            <input type="number" inputMode="numeric" min={0} value={st.capWeekday} onChange={(e) => setSettings({ ...st, capWeekday: num(e.target.value) })} />
          </label>
          <label className="field">
            <span>주말</span>
            <input type="number" inputMode="numeric" min={0} value={st.capWeekend} onChange={(e) => setSettings({ ...st, capWeekend: num(e.target.value) })} />
          </label>
        </div>
      </section>

      <section>
        <h2>일정 많은 날 상한 줄이기</h2>
        <p className="hint">시간 지정 일정이 N개 이상인 날은 상한에서 M을 뺍니다. N을 0으로 두면 꺼져요.</p>
        <div className="row">
          <label className="field">
            <span>일정 N개 이상이면</span>
            <input type="number" inputMode="numeric" min={0} value={st.reduceFrom} onChange={(e) => setSettings({ ...st, reduceFrom: num(e.target.value) })} />
          </label>
          <label className="field">
            <span>M 회차 감산</span>
            <input type="number" inputMode="numeric" min={0} value={st.reduceBy} onChange={(e) => setSettings({ ...st, reduceBy: num(e.target.value) })} />
          </label>
        </div>
      </section>

      <Timetable />

      <section>
        <h2>읽을 캘린더</h2>
        <p className="hint">고른 캘린더의 일정이 오늘 뷰에 체크 대상으로 올라와요. 읽기만 해요 — 앱은 캘린더에 아무것도 쓰지 않아요.</p>
        <ul className="list">
          {s.calendars.map((c) => (
              <li key={c.id}>
                <label>
                  <Checkbox checked={s.data.selectedCalendarIds.includes(c.id)} onChange={() => toggleCal(c.id)} />
                  <span className="swatch" style={{ background: c.backgroundColor ?? "var(--ink-3)" }} />
                  <span className="text">
                    {c.summary}
                    {c.primary && <span className="tag">기본</span>}
                  </span>
                </label>
              </li>
            ))}
        </ul>
      </section>

      <section>
        <h2>데이터</h2>
        <p className="hint">할 일·목표·시간표·완료 표시는 이 기기에만 저장돼요. 폰을 바꾸거나 앱 데이터를 지우면 사라지니 가끔 백업해 두세요.</p>
        <div className="tt-actions">
          <button className="small" onClick={doExport}>
            백업 파일 내려받기
          </button>
          <button className="small" onClick={() => fileRef.current?.click()}>
            백업 가져오기
          </button>
          <input ref={fileRef} type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => void doImport(e.target.files?.[0])} />
          <span style={{ flex: 1 }} />
          <button
            className="small danger"
            onClick={() => {
              if (confirm("이 기기의 할 일·목표·시간표를 전부 지울까요? 구글 캘린더는 영향 없어요.")) resetData();
            }}
          >
            전부 지우기
          </button>
        </div>
        {msg && <p className="hint ok">{msg}</p>}
        <p className="idline">
          체크 {s.data.checks.length} · 목표 {s.data.goals.length} · 수업 {s.data.classes.length}
        </p>
      </section>

      <section>
        <h2>계정</h2>
        <p className="hint">한 번 로그인하면 다음부터 자동으로 들어와요. 다른 계정으로 바꾸려면 로그아웃 후 다시 로그인하세요.</p>
        <button className="ghost" onClick={() => void signOut()}>
          로그아웃
        </button>
      </section>
    </div>
  );
}
