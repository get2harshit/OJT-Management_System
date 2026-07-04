/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Montserrat', 'system-ui', '-apple-system', 'Roboto', 'Arial', 'sans-serif'],
      },
      colors: {
        gold: {
          DEFAULT: 'rgb(var(--color-gold) / <alpha-value>)',
          hover: 'rgb(var(--color-gold-hover) / <alpha-value>)',
          dark: 'rgb(var(--color-gold-dark) / <alpha-value>)',
        },
        zinc: {
          850: 'rgb(var(--color-zinc-850) / <alpha-value>)',
          750: 'rgb(var(--color-zinc-750) / <alpha-value>)',
        },
      },
      borderColor: {
        zinc: {
          750: 'rgb(var(--color-zinc-750) / <alpha-value>)',
        },
      },
      backgroundColor: {
        zinc: {
          850: 'rgb(var(--color-zinc-850) / <alpha-value>)',
          750: 'rgb(var(--color-zinc-750) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
};
