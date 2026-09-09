/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        funnel: ["'Funnel Sans'", "system-ui", "sans-serif"],
        mono:   ["'Geist Mono'", "system-ui", "monospace"],
        sans:   ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
