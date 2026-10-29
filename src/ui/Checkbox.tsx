// 커스텀 체크박스. 네이티브 input은 접근성을 위해 그대로 두고 시각만 그린다.
// 체크 선이 그려지는 200ms가 이 앱의 "유일한 연출" — 하루에 수십 번 보는 동작이라 짧고 조용하게.
import type { InputHTMLAttributes } from "react";

export default function Checkbox(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <span className="cb">
      <input type="checkbox" {...props} />
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <rect className="cb-box" x="1" y="1" width="18" height="18" rx="5" />
        <path className="cb-mark" d="M5.5 10.3l3 3 6-6.3" pathLength="1" />
      </svg>
    </span>
  );
}
