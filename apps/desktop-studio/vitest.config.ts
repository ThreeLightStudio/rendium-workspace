import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const packageDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve(packageDir, 'src/renderer/src'),
      '@styled-system': resolve(packageDir, 'styled-system'),
    },
  },
});
