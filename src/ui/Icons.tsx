// 아이콘은 글리프가 아니라 그린다. 한 가지 선 굵기(1.75), 둥근 끝, 20px 그리드.
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size: number, p: P) => ({
  width: size,
  height: size,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...p,
});

export const ChevronLeft = ({ size = 20, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M12.5 4.5 7 10l5.5 5.5" />
  </svg>
);
export const ChevronRight = ({ size = 20, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M7.5 4.5 13 10l-5.5 5.5" />
  </svg>
);
export const Plus = ({ size = 20, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M10 4v12M4 10h12" />
  </svg>
);
export const Refresh = ({ size = 20, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M16 10a6 6 0 1 1-1.8-4.3" />
    <path d="M16 3.5V7h-3.5" />
  </svg>
);
export const Trash = ({ size = 20, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M4 6h12M8 6V4.5h4V6M6 6l.7 10h6.6L14 6M8.5 9v4M11.5 9v4" />
  </svg>
);
export const Minus = ({ size = 20, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M4 10h12" />
  </svg>
);
/** 탭: 오늘 */
export const TodayIcon = ({ size = 22, ...p }: P) => (
  <svg {...base(size, p)}>
    <rect x="3" y="4" width="14" height="13" rx="2.5" />
    <path d="M3 8h14M7 2.5V5M13 2.5V5" />
    <path d="M7.5 12.5 9.3 14.3 12.8 10.8" />
  </svg>
);
/** 탭: 주간 */
export const WeekIcon = ({ size = 22, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M4 16V9M8 16V5M12 16v-6M16 16V7" />
    <path d="M3 17h14" />
  </svg>
);
/** 탭: 월간 */
export const MonthIcon = ({ size = 22, ...p }: P) => (
  <svg {...base(size, p)}>
    <rect x="3" y="4" width="14" height="13" rx="2.5" />
    <path d="M3 8h14M7 2.5V5M13 2.5V5" />
    <path d="M6.5 11h1M9.5 11h1M12.5 11h1M6.5 14h1M9.5 14h1" />
  </svg>
);
/** 탭: 설정 */
export const SettingsIcon = ({ size = 22, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M3 6h9M15 6h2M3 14h2M8 14h9" />
    <circle cx="13" cy="6" r="2" />
    <circle cx="6" cy="14" r="2" />
  </svg>
);
/** 로그인 화면 마크 */
export const Mark = ({ size = 56, ...p }: P) => (
  <svg {...base(size, { strokeWidth: 1.5, ...p })}>
    <rect x="3" y="3.5" width="14" height="13" rx="2.5" />
    <path d="M3 7.5h14" />
    <path d="M7 12.2l2 2 4-4.2" strokeWidth="2" />
  </svg>
);
