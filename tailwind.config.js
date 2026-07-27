const plugin = require('tailwindcss/plugin');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './App.{js,jsx,ts,tsx}',
    './index.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter-Regular', 'sans-serif'],
        'inter-regular': ['Inter-Regular'],
        'inter-medium': ['Inter-Medium'],
        'inter-semibold': ['Inter-SemiBold'],
        'inter-bold': ['Inter-Bold'],
      },
      colors: {
        m3: {
          surface: '#111318',
          'surface-container-lowest': '#0c0e13',
          'surface-container-low': '#191c20',
          'surface-container': '#1d2024',
          'surface-container-high': '#282a2f',
          'surface-container-highest': '#33353a',
          'on-surface': '#e2e2e9',
          'on-surface-variant': '#c4c6d0',
          outline: '#44474f',
          'outline-variant': '#2b2d35',
          primary: '#ffffff',
          'on-primary': '#0f1117',
          'primary-container': '#282a31',
          'on-primary-container': '#ffffff',
          secondary: '#bfc6dc',
          'on-secondary': '#293042',
          'secondary-container': '#3f4759',
          'on-secondary-container': '#dbe2f9',
          tertiary: '#debcdf',
          'on-tertiary': '#402843',
          'tertiary-container': '#573e5c',
          'on-tertiary-container': '#fbd7fc',
          error: '#ffb4ab',
          'error-container': '#93000a',
          'on-error-container': '#ffdad6',
          protein: '#f2b7c6',
          'protein-container': '#4f2532',
          carbs: '#b5e3c4',
          'carbs-container': '#1a3827',
          fat: '#e5c36c',
          'fat-container': '#453812',
          calories: '#a0cafd',
          expenditure: '#d0bcff',
        },
      },
    },
  },
  plugins: [
    plugin(({ addUtilities }) => {
      addUtilities({
        '.num-tabular': { fontVariant: ['tabular-nums'] },
      });
    }),
  ],
};
