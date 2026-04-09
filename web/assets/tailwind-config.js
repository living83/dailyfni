/* Daily F&I — shared Tailwind theme config
 * Must load BEFORE the Tailwind CDN script. */
window.tailwind = window.tailwind || {};
window.tailwind.config = {
  theme: {
    extend: {
      fontFamily: {
        sans:    ['Pretendard', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        display: ['Pretendard', 'system-ui', 'sans-serif'],
      },
      colors: {
        /* Brand navy (base #262b4d) */
        ink: {
          950: '#262b4d',
          900: '#323862',
          800: '#3e4578',
          700: '#4a5290',
        },
        /* Brand blue accent (base #2777b0) */
        accent: {
          50:  '#e8f1f8',
          100: '#cadfee',
          200: '#9ec3df',
          300: '#6ca5ca',
          400: '#2777b0',
          500: '#206294',
          600: '#1a4e77',
          700: '#14395a',
        },
      },
      maxWidth: {
        '8xl': '88rem',
      },
      letterSpacing: {
        'tightest-ko': '-0.025em',
      },
      boxShadow: {
        'glass-edge': 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.4)',
        'brand-soft': '0 22px 60px -24px rgba(39, 119, 176, 0.45)',
      },
      animation: {
        'fade-up':    'fadeUp 0.9s cubic-bezier(0.16, 1, 0.3, 1) both',
        'float-slow': 'float 8s ease-in-out infinite',
        'marquee':    'marquee 40s linear infinite',
      },
      keyframes: {
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(1.5rem)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%':     { transform: 'translateY(-12px)' },
        },
        marquee: {
          '0%':   { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
    },
  },
};
