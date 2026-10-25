import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.VITE_BASE_PATH || (env.GITHUB_REPOSITORY && !env.GITHUB_REPOSITORY.endsWith('.github.io') ? `/${env.GITHUB_REPOSITORY.split('/')[1]}/` : '/');
  return { base, plugins: [react()], server: { port: 5173 }, build: { sourcemap: false } };
});
