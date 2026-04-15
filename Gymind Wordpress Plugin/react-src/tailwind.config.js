/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'brand-primary': '#4f46e5',
        'brand-secondary': '#4338ca',
        'gray-dark': '#111827',
        'gray-medium': '#1f2937',
        'gray-light': '#9ca3af',
        'gray-extralight': '#d1d5db',
      }
    },
  },
  plugins: [],
}
