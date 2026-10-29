import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages는 https://<user>.github.io/<repo>/ 아래에 올라가므로 base가 필요하다.
// 로컬 dev·Vercel 같은 루트 배포에서는 VITE_BASE를 비워 두면 "/"가 된다.
const base = process.env.VITE_BASE || "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "CalCheck",
        short_name: "CalCheck",
        description: "구글 캘린더 연동 체크리스트",
        lang: "ko",
        start_url: base,
        scope: base,
        display: "standalone",
        background_color: "#f3eee4",
        theme_color: "#1f3a5f",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        // 구글 API 응답은 캐시하지 않는다. 캘린더가 유일한 원본이라는 원칙의 코드 표현.
        navigateFallbackDenylist: [/^\/api/],
        navigateFallback: `${base}index.html`,
        runtimeCaching: [],
      },
    }),
  ],
  server: { port: 5173 },
});
