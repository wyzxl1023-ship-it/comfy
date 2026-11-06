import { defineConfig } from 'vite';

// base './'：打包结果可以放在任意子路径下（静态托管 / 本机任意 http 服务）
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500 },
});
