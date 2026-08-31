import type { Config } from "tailwindcss";

/** rgb(var(--x) / <alpha-value>) para poder usar opacidad con los tokens. */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      colors: {
        bg: token("bg"),
        surface: token("surface"),
        "surface-raised": token("surface-raised"),
        border: token("border"),
        text: token("text"),
        muted: token("text-muted"),
        accent: token("accent"),
        "accent-pressed": token("accent-pressed"),
        "accent-fg": token("accent-fg"),
        "accent-weak": token("accent-weak"),
        danger: token("danger"),
        "danger-fg": token("danger-fg"),
        warning: token("warning"),
      },
      borderColor: {
        DEFAULT: token("border"),
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
      spacing: {
        "safe-b": "env(safe-area-inset-bottom)",
      },
      maxWidth: {
        app: "480px",
      },
      minHeight: {
        touch: "44px",
      },
      minWidth: {
        touch: "44px",
      },
    },
  },
  plugins: [],
};

export default config;
