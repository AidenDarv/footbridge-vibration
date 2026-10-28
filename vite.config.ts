import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

/** Short commit hash for the calc sheet header (SPEC §7), "-dirty" if there are local changes. */
function gitCommit(): string {
  try {
    const hash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim() !== '';
    return dirty ? `${hash}-dirty` : hash;
  } catch {
    return 'unknown';
  }
}

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig({
  // Relative base so the build works under a GitHub Pages project path.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __GIT_COMMIT__: JSON.stringify(gitCommit()),
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
