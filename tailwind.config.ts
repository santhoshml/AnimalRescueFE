import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0b1220',
        panel: '#121b2d',
        panelSoft: '#1a2640',
        accent: '#2f7cff',
        accentSoft: '#17386f',
        success: '#21c47b',
        warning: '#f59e0b',
        danger: '#ef4444',
      },
      boxShadow: {
        panel: '0 14px 40px rgba(5, 10, 28, 0.45)',
      },
      animation: {
        pulseSoft: 'pulseSoft 1.8s ease-in-out infinite',
        riseIn: 'riseIn 500ms ease-out both',
      },
      keyframes: {
        pulseSoft: {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
        riseIn: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config
