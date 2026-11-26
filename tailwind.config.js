/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}', './lib/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    screens: {
      xs: '360px',
      sm: '600px',
      md: '900px',
      lg: '1100px',
      xl: '1500px',
    },
    extend: {
      colors: {
        bg: 'var(--bg)',
        panel: 'var(--panel)',
        ink: 'var(--ink)',
        mute: 'var(--mute)',
        line: 'var(--line)',
        acc: 'var(--acc)',
        accsoft: 'var(--accsoft)',
        warn: 'var(--warn)',
        warnsoft: 'var(--warnsoft)',
        bad: 'var(--bad)',
        badsoft: 'var(--badsoft)',
        whatsapp: 'var(--whatsapp)',
        whatsappDark: 'var(--whatsapp-dark)',
        whatsappInk: 'var(--whatsapp-ink)',
        on: 'var(--on)',
      },
      fontFamily: {
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        head: ['var(--font-head)', 'Fraunces', 'Georgia', 'serif'],
      },
      boxShadow: {
        panel: 'var(--shadow)',
        whatsapp: 'var(--whatsapp-shadow)',
      },
      backgroundImage: {
        marsandiis: 'var(--grad)',
        stockroom: 'var(--grad)',
      },
      keyframes: {
        fadeup: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'float-slow': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        'slide-down': {
          from: { opacity: '0', transform: 'translateY(-10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        live: {
          '0%': { boxShadow: '0 0 0 0 rgba(124,255,178,.7)' },
          '70%, 100%': { boxShadow: '0 0 0 8px rgba(124,255,178,0)' },
        },
      },
      animation: {
        fadeup: 'fadeup .45s ease both',
        'fade-up': 'fade-up .7s ease-out forwards',
        'float-slow': 'float-slow 6s ease-in-out infinite',
        'slide-down': 'slide-down .3s ease-out forwards',
        live: 'live 1.8s infinite',
      },
    },
  },
  plugins: [],
}
