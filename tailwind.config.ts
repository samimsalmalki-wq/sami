import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

// Colors are CSS variables holding RGB channels (see app/globals.css) so the
// same classes work in light and dark mode and support opacity modifiers.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1240px" } },
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "var(--font-body)", "system-ui", "sans-serif"],
        sans: ["var(--font-body)", "system-ui", "Segoe UI", "Tahoma", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "Menlo", "Consolas", "monospace"],
      },
      colors: {
        border: token("line"),
        input: token("line"),
        ring: token("brand"),
        background: token("bg"),
        foreground: token("ink"),
        surface: token("surface"),
        sunk: token("sunk"),
        line: token("line"),
        ink: token("ink"),
        primary: { DEFAULT: token("brand"), foreground: token("brand-ink") },
        brand: { DEFAULT: token("brand"), ink: token("brand-ink"), soft: token("brand-soft") },
        secondary: { DEFAULT: token("sunk"), foreground: token("ink") },
        muted: { DEFAULT: token("sunk"), foreground: token("muted") },
        accent: { DEFAULT: token("brand-soft"), foreground: token("ink") },
        destructive: { DEFAULT: token("crit"), foreground: token("surface") },
        card: { DEFAULT: token("surface"), foreground: token("ink") },
        popover: { DEFAULT: token("surface"), foreground: token("ink") },
        signal: { DEFAULT: token("signal"), soft: token("signal-soft"), ink: token("signal-ink") },
        ok: { DEFAULT: token("ok"), soft: token("ok-soft"), ink: token("ok-ink") },
        warn: { DEFAULT: token("warn"), soft: token("warn-soft"), ink: token("warn-ink") },
        crit: { DEFAULT: token("crit"), soft: token("crit-soft"), ink: token("crit-ink") },
        stale: { DEFAULT: token("stale"), soft: token("stale-soft"), ink: token("stale-ink") },
      },
      borderRadius: {
        lg: "12px",
        md: "8px",
        sm: "6px",
      },
      boxShadow: {
        panel: "var(--shadow)",
      },
      keyframes: {
        flash: {
          "0%": { backgroundColor: "rgb(var(--signal-soft))" },
          "100%": { backgroundColor: "var(--flash-to, transparent)" },
        },
        wave: {
          "0%": { transform: "scale(.4)", opacity: ".9" },
          "100%": { transform: "scale(1.5)", opacity: "0" },
        },
        beat: {
          "0%": { boxShadow: "0 0 0 0 rgb(var(--ok) / .6)" },
          "70%": { boxShadow: "0 0 0 8px rgb(var(--ok) / 0)" },
          "100%": { boxShadow: "0 0 0 0 rgb(var(--ok) / 0)" },
        },
      },
      animation: {
        flash: "flash 1.6s ease-out",
        wave: "wave .9s ease-out",
        beat: "beat 2s infinite",
      },
    },
  },
  plugins: [animate],
};

export default config;
