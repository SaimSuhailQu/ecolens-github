/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./{src,components,services}/**/*.{js,ts,jsx,tsx}",
    "./{App,index,types}.{ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}