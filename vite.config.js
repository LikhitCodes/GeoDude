import { defineConfig } from 'vite';

export default defineConfig({
  // Set base path for deployment.
  // Change to '/GeoDude/' if deploying to GitHub Pages at username.github.io/GeoDude/
  base: '/',

  build: {
    // Generate source maps for debugging in production
    sourcemap: false,
    // Target modern browsers
    target: 'es2020',
  },

  server: {
    // Allow access from local network (useful for testing on phone with ESP32)
    host: true,
  },
});
