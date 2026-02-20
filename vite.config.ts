import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'react-native': 'react-native-web',
      '@react-native/assets-registry/registry': 'react-native-web/dist/modules/AssetsRegistry',
    },
    extensions: ['.web.js', '.js', '.ts', '.tsx', '.json'],
  },
  optimizeDeps: {
    esbuildOptions: {
      resolveExtensions: ['.web.js', '.js', '.ts', '.tsx', '.json'],
      loader: {
        '.js': 'jsx',
      },
    },
  },
  define: {
    global: 'window',
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
});
