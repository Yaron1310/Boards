/** @type {import('tailwindcss').Config} */

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'brand': {
          'blue': '#004e89',
          'blue-dark': '#003f70',
          'blue-darker': '#003057',
          'blue-darkest': '#00213d',
          'blue-light': '#a8d5f2',
        }
      }
    },
  },
  safelist: [
    'border-gray-500',
    'border-gray-600',
  ],
}