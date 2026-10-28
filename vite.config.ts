import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works under a GitHub Pages project path.
  base: './',
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
