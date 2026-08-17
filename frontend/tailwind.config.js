/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        monte: {
          verde: '#08454c',
          azul: '#163b52',
          terracota: '#c65f54',
          areia: '#eae4da',
          areiaSecao: '#f5f2eb',
          sereno: '#809ba6',
        },
      },
      fontFamily: {
        display: ['Outfit', 'Manrope', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2.5rem',
      },
    },
  },
  plugins: [],
};
