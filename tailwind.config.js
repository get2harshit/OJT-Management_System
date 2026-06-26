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
          DEFAULT: '#ffcc3f',
          hover: '#e6b636',
          dark: '#c99a2a',
        },
        zinc: {
          850: '#18181b',
          750: '#27272a',
        },
      },
      borderColor: {
        zinc: {
          750: '#27272a',
        },
      },
      backgroundColor: {
        zinc: {
          850: '#18181b',
          750: '#27272a',
        },
      },
    },
  },
  plugins: [],
};
