import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "var(--color-void)",
        panel: "var(--color-panel)",
        panel2: "var(--color-panel2)",
        rule: "var(--color-rule)",
        brand: "var(--color-brand)",
        brand2: "var(--color-brand2)",
        ink: "var(--color-ink)",
        mute: "var(--color-mute)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 8px 24px -8px rgba(0,0,0,0.6)",
      },
    },
  },
  plugins: [],
};

export default config;
