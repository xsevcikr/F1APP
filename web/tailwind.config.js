import cq from "@tailwindcss/container-queries";
/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        panel: v("panel"),
        raised: v("raised"),
        line: v("line"),
        fg: v("fg"),
        muted: v("muted"),
        faint: v("faint"),
        accent: v("accent"),
        ok: v("ok"),
        warn: v("warn"),
        danger: v("danger"),
        best: v("best"),
        info: v("info"),
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["'Titillium Web'", "Inter", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      borderRadius: { panel: "14px" },
      boxShadow: {
        glow: "0 0 0 1px rgb(var(--accent) / 0.35), 0 0 18px rgb(var(--accent) / 0.25)",
      },
      keyframes: {
        flash: { "0%": { backgroundColor: "rgb(var(--best) / 0.35)" }, "100%": { backgroundColor: "transparent" } },
        pulse2: { "0%,100%": { opacity: 1 }, "50%": { opacity: 0.35 } },
      },
      animation: { flash: "flash 1.8s ease-out", pulse2: "pulse2 1.6s ease-in-out infinite" },
    },
  },
  plugins: [cq],
};
