// 회차 계기판. 상한만큼 칸을 그리고 부하만큼 채운다. 넘치면 넘친 칸을 따로 그린다.
// "17 / 6" 같은 숫자보다, 칸 6개가 꽉 차고 11개가 밖으로 삐져나온 그림이 과부하를 한눈에 보여 준다.
import type { LoadLevel } from "../model/plan";

export default function PipMeter({ load, cap, level, max = 10 }: { load: number; cap: number; level: LoadLevel; max?: number }) {
  const capPips = Math.min(cap, max);
  const filled = Math.min(load, capPips);
  const over = Math.max(0, load - cap);
  const overPips = Math.min(over, Math.max(0, max - capPips));
  const hidden = over - overPips;
  return (
    <div className={`pips ${level}`} role="img" aria-label={`부하 ${load}회차, 상한 ${cap}회차`}>
      {Array.from({ length: capPips }, (_, i) => (
        <span key={`c${i}`} className={`pip ${i < filled ? "on" : ""}`} />
      ))}
      {overPips > 0 && <span className="pip-gap" />}
      {Array.from({ length: overPips }, (_, i) => (
        <span key={`o${i}`} className="pip over" />
      ))}
      {hidden > 0 && <span className="pip-more">+{hidden}</span>}
    </div>
  );
}
