import { defineConfig } from 'vite';

export default defineConfig({
  // Relative assets keep the production build valid when GitHub Pages
  // serves the repository below /<repository>/.
  base: './'
});
