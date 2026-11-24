import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Literal values (not CSS variables) so opacity modifiers such as
        // bg-ink/50 work. Keep in sync with the tokens in globals.css.
        ink: '#1d2125',
        'ink-2': '#353b42',
        muted: '#5c636d',
        line: '#d9dcd8',
        'line-strong': '#b9beb8',
        concrete: '#eceeea',
        surface: '#ffffff',
        sunk: '#f5f6f3',
        hivis: '#ffd100',
        'hivis-deep': '#f0c200',
        'hivis-soft': '#fff6c7',
        go: '#0f7b45',
        'go-soft': '#e2f1e8',
        caution: '#94600a',
        'caution-soft': '#fff0d4',
        stop: '#c3261c',
        'stop-soft': '#fbe6e3',
        you: '#2563eb',
        // Vendor terminal (dark kiosk) palette.
        pitstop: {
          background: '#15181b',
          surface: '#1d2125',
          border: '#353b42',
          text: '#ffffff',
          'text-secondary': '#c3c8cd',
          brand: '#ffd100',
          urgent: '#ff5a4e',
          success: '#3ccf7f',
          location: '#5b8cff',
          price: '#ffd100',
        },
      },
      fontFamily: {
        display: ['var(--font-archivo)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-archivo)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'screen-title': ['32px', { lineHeight: '1.1', fontWeight: '800' }],
        'section-title': ['24px', { lineHeight: '1.2', fontWeight: '800' }],
        'card-title': ['20px', { lineHeight: '1.2', fontWeight: '800' }],
        'compact-title': ['18px', { lineHeight: '1.25', fontWeight: '800' }],
        'body-large': ['16px', { lineHeight: '1.4' }],
        body: ['14px', { lineHeight: '1.4' }],
        label: ['12px', { lineHeight: '1.3', fontWeight: '700' }],
        'label-compact': ['10px', { lineHeight: '1.3', fontWeight: '900' }],
      },
      spacing: {
        micro: '4px',
        compact: '8px',
        small: '12px',
        standard: '16px',
        screen: '20px',
        section: '24px',
      },
      borderRadius: {
        tiny: '4px',
        small: '8px',
        card: '12px',
        large: '16px',
        icon: '30px',
        full: '9999px',
      },
      boxShadow: {
        card: '0 8px 16px rgba(0, 0, 0, 0.50)',
        raised: '0 8px 24px rgba(0, 0, 0, 0.50)',
      },
      minWidth: {
        tap: '44px',
      },
      minHeight: {
        tap: '44px',
      },
    },
  },
  plugins: [],
};

export default config;
