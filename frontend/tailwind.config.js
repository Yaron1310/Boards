/** @type {import('tailwindcss').Config} */
import plugin from 'tailwindcss/plugin';

// RTL auto-flip plugin: when dir="rtl" is on <html>, directional margin/padding
// classes are swapped so layouts mirror correctly without touching each component.
const rtlFlipPlugin = plugin(function ({ addBase, theme }) {
  const spacing = theme('spacing');
  const base = {};

  Object.entries(spacing).forEach(([key, value]) => {
    // Escape dots in Tailwind class names (e.g. "0.5" → "0\.5")
    const k = key.replace('.', '\\.');

    base[`[dir="rtl"] .ml-${k}`] = { 'margin-left': '0', 'margin-right': value };
    base[`[dir="rtl"] .mr-${k}`] = { 'margin-right': '0', 'margin-left': value };
    base[`[dir="rtl"] .pl-${k}`] = { 'padding-left': '0', 'padding-right': value };
    base[`[dir="rtl"] .pr-${k}`] = { 'padding-right': '0', 'padding-left': value };
  });

  // Auto margins
  base[`[dir="rtl"] .ml-auto`] = { 'margin-left': '0', 'margin-right': 'auto' };
  base[`[dir="rtl"] .mr-auto`] = { 'margin-right': '0', 'margin-left': 'auto' };

  // Text alignment
  base[`[dir="rtl"] .text-left`] = { 'text-align': 'right' };
  base[`[dir="rtl"] .text-right`] = { 'text-align': 'left' };

  addBase(base);
});

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
  plugins: [rtlFlipPlugin],
}