import { setSelectedCalendars, setSettings, signOut, useStore } from "../store";
import Checkbox from "../ui/Checkbox";
import Timetable from "./Timetable";

export default function Settings() {
  const s = useStore();
  const st = s.settings;
  const num = (v: string) => Math.max(0, Math.floor(Number(v) || 0));

  const toggleCal = (id: string) => {
    const next = s.selectedCalendarIds.includes(id) ? s.selectedCalendarIds.filter((x) => x !== id) : [...s.selectedCalendarIds, id];
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
        <p className="hint">고른 캘린더의 일정이 오늘 뷰에 체크 대상으로 올라와요. 생일·공휴일 캘린더는 빼는 게 좋아요.</p>
        <ul className="list">
          {s.calendars
            .filter((c) => c.id !== s.appCalendarId && c.id !== s.timetableCalendarId)
            .map((c) => (
              <li key={c.id}>
                <label>
                  <Checkbox checked={s.selectedCalendarIds.includes(c.id)} onChange={() => toggleCal(c.id)} />
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
        <h2>앱 전용 캘린더</h2>
        <p className="hint">
          할 일과 목표는 <strong>{s.appCalendarName}</strong> 캘린더에만 써요. 구글 캘린더 위젯에서 이 캘린더를 켜 두면 할 일이 보이고, 바쁠 땐 끌 수 있어요.
        </p>
        <p className="idline">{s.appCalendarId ?? "—"}</p>
      </section>

      <section>
        <h2>계정</h2>
        <button className="ghost" onClick={() => void signOut()}>
          로그아웃
        </button>
      </section>
    </div>
  );
}
