/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: '#f8f9f9',
        'surface-container-low': '#f1f4f4',
        'surface-container-lowest': '#ffffff',
        'surface-container-highest': '#dbe4e5',
        primary: '#466649',
        'primary-dim': '#3a5a3e',
        'primary-container': '#c4e8c2',
        'on-primary': '#e4ffe2',
        'secondary-container': '#dfe3e7',
        'on-secondary-container': '#2c3435',
        'on-surface': '#2c3435',
        'outline-variant': '#abb4b5',
        error: '#9e422c',
      },
      fontFamily: {
        display: ['Manrope', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 4px 40px rgba(44, 52, 53, 0.06)',
        'soft-lg': '0 8px 40px rgba(44, 52, 53, 0.10)',
      },
    },
  },
  plugins: [],
}

