/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#182633',
        brand: {
          50: '#edfaf7',
          100: '#d1f1e9',
          500: '#0a9c80',
          600: '#087e68',
          700: '#086956',
          800: '#075444',
        },
      },
      boxShadow: {
        card: '0 12px 42px -28px rgba(17, 35, 48, .42)',
      },
    },
  },
  plugins: [],
};
