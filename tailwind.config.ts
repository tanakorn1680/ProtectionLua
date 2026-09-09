import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['IBM Plex Sans Thai', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        surface: {
          DEFAULT: '#0f1117',
          card: '#181c27',
          border: '#252a38',
          hover: '#1e2332',
        },
        accent: {
          DEFAULT: '#4f8ef7',
          hover: '#6ba0f9',
          dim: 'rgba(79,142,247,0.12)',
        },
        status: {
          active: '#22c55e',
          disabled: '#6b7280',
          banned: '#ef4444',
          expired: '#f59e0b',
        },
      },
    },
  },
  plugins: [],
}
export default config
