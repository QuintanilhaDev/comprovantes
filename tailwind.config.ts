import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        onyx: {
          DEFAULT: "#0a0a0b",
          soft: "#131315",
          elevated: "#1a1a1d",
          border: "#26262a",
        },
        orange: {
          DEFAULT: "#ff7a1a",
          dim: "#c2570a",
          soft: "#ffb073",
        },
        paper: "#f2ede3",
        muted: "#9a9aa2",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        sans: ["'Inter'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      boxShadow: {
        glow: "0 0 40px rgba(255, 122, 26, 0.25)",
      },
    },
  },
  plugins: [],
};
export default config;
