import { defineConfig } from '@pandacss/dev';

export default defineConfig({
  preflight: false,

  include: ['./src/renderer/src/**/*.{js,jsx,ts,tsx}'],

  exclude: ['./dist/**/*', './out/**/*', './styled-system/**/*'],

  jsxFramework: 'react',

  theme: {
    extend: {
      tokens: {
        colors: {
          panelBg: { value: '#111116' },
          panelBgAlt: { value: '#171720' },
          panelBorder: { value: 'rgba(255, 255, 255, 0.08)' },
          panelBorderSoft: { value: 'rgba(255, 255, 255, 0.05)' },
          surface: { value: 'rgba(255, 255, 255, 0.04)' },
          surfaceHover: { value: 'rgba(255, 255, 255, 0.08)' },
          surfaceStrong: { value: 'rgba(255, 255, 255, 0.12)' },
          textPrimary: { value: 'rgba(255, 255, 245, 0.92)' },
          textSecondary: { value: 'rgba(235, 235, 245, 0.68)' },
          textMuted: { value: 'rgba(235, 235, 245, 0.42)' },
          accent: { value: '#00D4FF' },
          accentSoft: { value: 'rgba(0, 212, 255, 0.16)' },
          accentWeak: { value: 'rgba(0, 212, 255, 0.08)' },
          accentStrong: { value: '#9EEFFF' },
          warning: { value: '#FFD700' },
          danger: { value: '#FF4B4B' },
          success: { value: '#2AD07A' },
        },
        spacing: {
          0.5: { value: '2px' },
          1: { value: '4px' },
          1.5: { value: '6px' },
          2: { value: '8px' },
          2.5: { value: '10px' },
          3: { value: '12px' },
          4: { value: '16px' },
          5: { value: '20px' },
          6: { value: '24px' },
        },
        radii: {
          sm: { value: '4px' },
          md: { value: '8px' },
          lg: { value: '12px' },
        },
        fontSizes: {
          xs: { value: '10px' },
          sm: { value: '11px' },
          md: { value: '13px' },
        },
        fonts: {
          body: {
            value:
              'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
          },
          mono: { value: 'Menlo, "Lucida Console", monospace' },
        },
      },
    },
  },

  outdir: 'styled-system',
});
