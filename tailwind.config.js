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
        sans: ['Onest_400Regular', 'sans-serif'],
      },
      fontSize: {
        compact: ['11px', { lineHeight: '14px', letterSpacing: '0.15px' }],
        xs: ['12px', { lineHeight: '16px', letterSpacing: '0.1px' }],
        sm: ['14px', { lineHeight: '20px', letterSpacing: '0.1px' }],
        base: ['16px', { lineHeight: '22px' }],
        lg: ['18px', { lineHeight: '24px', letterSpacing: '-0.1px' }],
        xl: ['20px', { lineHeight: '26px', letterSpacing: '-0.2px' }],
        '2xl': ['24px', { lineHeight: '30px', letterSpacing: '-0.3px' }],
        '3xl': ['30px', { lineHeight: '36px', letterSpacing: '-0.45px' }],
        '4xl': ['36px', { lineHeight: '40px', letterSpacing: '-0.65px' }],
        '5xl': ['48px', { lineHeight: '52px', letterSpacing: '-0.9px' }],
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
        // Route weight classes to real bundled files so Android never
        // synthesizes faux weights from the regular face.
        '.font-medium': { fontFamily: 'Onest_500Medium' },
        '.font-semibold': { fontFamily: 'Onest_600SemiBold' },
        '.font-bold': { fontFamily: 'Onest_700Bold' },
      });
    }),
  ],
};
