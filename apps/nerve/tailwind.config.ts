import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "SF Mono",
          "ui-monospace",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      colors: {
        bg: {
          DEFAULT: "#09090b",
          panel: "#0c0c0e",
          raised: "#111114",
          hover: "#18181b",
        },
        border: {
          DEFAULT: "#1f1f23",
          strong: "#2a2a2f",
        },
        fg: {
          DEFAULT: "#e4e4e7",
          muted: "#a1a1aa",
          dim: "#71717a",
          faint: "#52525b",
        },
        accent: {
          DEFAULT: "#7c7cf0",
          muted: "#5b5bc4",
        },
        status: {
          closed: "#4ade80",
          rejected: "#f87171",
          followup: "#fbbf24",
          pending: "#94a3b8",
        },
        phase: {
          one: "#60a5fa",
          two: "#a78bfa",
          three: "#34d399",
        },
      },
      fontSize: {
        "2xs": ["0.6875rem", "1rem"],
      },
      letterSpacing: {
        wider: "0.05em",
      },
    },
  },
  plugins: [],
};

export default config;
