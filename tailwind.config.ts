import type { Config } from "tailwindcss";

/** rgb(var(--x) / <alpha-value>) para poder usar opacidad con los tokens. */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Archivo", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: [
          "Space Grotesk",
          "Archivo",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
      },
      colors: {
        bg: token("bg"),
        surface: token("surface"),
        "surface-raised": token("surface-raised"),
        border: token("border"),
        "border-strong": token("border-strong"),
        text: token("text"),
        muted: token("muted"),
        faint: token("faint"),
        accent: token("accent"),
        "accent-strong": token("accent-strong"),
        "accent-fg": token("accent-fg"),
        "accent-weak": token("accent-weak"),
        warm: token("warm"),
        "warm-strong": token("warm-strong"),
        "warm-fg": token("warm-fg"),
        "warm-weak": token("warm-weak"),
        positive: token("positive"),
        danger: token("danger"),
        "danger-fg": token("danger-fg"),
      },
      borderColor: {
        DEFAULT: token("border"),
      },
      borderWidth: {
        // Estilo flat: los bordes son de 2 px por defecto.
        DEFAULT: "2px",
      },
      divideWidth: {
        DEFAULT: "2px",
      },
      borderRadius: {
        none: "0",
        sm: "0",
        DEFAULT: "0",
        md: "0",
        lg: "0",
        xl: "0",
        // sólo lo redondo de verdad (spinner, puntos, píldoras) mantiene radio
        full: "9999px",
      },
      letterSpacing: {
        caps: "0.12em",
        tightest: "-0.03em",
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
