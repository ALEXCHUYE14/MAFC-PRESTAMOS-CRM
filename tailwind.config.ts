import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#F8F7F4",
        surface: "#FFFFFF",
        sand: { DEFAULT: "#EFECE6", border: "#E2DFD7" },
        ink: { DEFAULT: "#181B19", muted: "#575E59", faint: "#8A908B" },
        brand: { DEFAULT: "#1E3F32", hover: "#163026", soft: "#E6EDE9" },
        ok: { DEFAULT: "#2B6A3E", bg: "#EAF4ED" },
        warn: { DEFAULT: "#9A5B13", bg: "#FDF3E3" },
        danger: { DEFAULT: "#9E2A2B", bg: "#FBEAEA" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "ui-serif", "Georgia", "serif"],
      },
      borderRadius: { lg: "10px", md: "8px", sm: "6px" },
      boxShadow: { card: "0 1px 0 rgba(24,27,25,0.04), 0 1px 2px rgba(24,27,25,0.04)" },
    },
  },
  plugins: [],
} satisfies Config;
