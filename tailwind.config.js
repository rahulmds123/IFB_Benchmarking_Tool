/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // IFB brand red — primary actions, active nav state, progress/
        // coverage bars. Everything else leans on Tailwind's stock
        // slate/green/red palette rather than a bespoke token system —
        // this design doesn't need one the way the old dark
        // engineering-blueprint theme did.
        brand: {
          DEFAULT: '#DC2626',
          hover: '#B91C1C',
          light: '#FEE2E2',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}