/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Surface colors
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        'surface-3': 'var(--surface-3)',
        'surface-4': 'var(--surface-4)',
        
        // Background colors with opacity
        toolbar: {
          DEFAULT: 'var(--toolbar)',
          opaque: 'var(--toolbar-opaque)'
        },
        
        // Text colors
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-tertiary': 'var(--text-tertiary)',
        'text-brand': 'var(--text-brand)',
        
        // Brand colors
        brand: {
          DEFAULT: 'var(--brand)',
          hover: 'var(--brand-hover)',
          active: 'var(--brand-active)',
          surface: 'var(--brand-surface)'
        },
        
        // Accent colors
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          active: 'var(--accent-active)',
          surface: 'var(--accent-surface)'
        }
      },
      
      // Typography
      fontFamily: {
        sans: ['Inter var', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      },
      
      // Shadows
      boxShadow: {
        'elevation-1': 'var(--shadow-elevation-1)',
        'elevation-2': 'var(--shadow-elevation-2)',
        'elevation-3': 'var(--shadow-elevation-3)'
      }
    }
  },
  plugins: []
};
