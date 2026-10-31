import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

/** One HTML file per page (SPEC §3): the checker plus Method, Validation, Limitations, About. */
const PAGES = ['index', 'method', 'validation', 'limitations', 'about'];

export default defineConfig({
  // GitHub Pages project path (SPEC §8 M8). Page links are relative, so they work under it.
  base: '/footbridge-vibration/',
  build: {
    rolldownOptions: {
      input: Object.fromEntries(
        PAGES.map((name) => [name, fileURLToPath(new URL(`./${name}.html`, import.meta.url))]),
      ),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __GIT_COMMIT__: JSON.stringify(gitCommit()),
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
