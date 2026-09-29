/** Tailwind v3 config. Colours point at the CSS variables in src/input.css,
    so light and dark mode switch in one place. */
export default {
  content: ['./index.html', './js/**/*.js'],
  theme: {
    extend: {
      colors: {
        page: 'var(--page)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        muted: 'var(--muted)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        accent: 'var(--accent)',
        'accent-ink': 'var(--accent-ink)',
        'accent-soft': 'var(--accent-soft)',
        good: 'var(--good)',
        'good-ink': 'var(--good-ink)',
        'good-soft': 'var(--good-soft)',
        bad: 'var(--bad)',
        'bad-ink': 'var(--bad-ink)',
        'bad-soft': 'var(--bad-soft)',
        insight: 'var(--insight-bg)',
        'insight-border': 'var(--insight-border)',
        'insight-ink': 'var(--insight-ink)',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', '"Noto Sans"', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
