/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        sepia: {
          50: '#fbf0d9',
          100: '#f4e3c1',
          200: '#edd5a8',
          300: '#e5c78f',
          800: '#5f4b32',
          900: '#433422',
        },
        brand: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          500: '#14b8a6',
          800: '#115e59',
          900: '#134e4a',
        },
      },
      fontFamily: {
        sans: ['Figtree', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['Lora', 'Spectral', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};

