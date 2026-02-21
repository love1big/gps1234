import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'react-native': 'react-native-web',
      '@react-native/assets-registry/registry': 'react-native-web/dist/modules/AssetsRegistry',
      'invariant': '/src/shims/invariant.ts',
    },
    extensions: ['.web.js', '.js', '.web.ts', '.ts', '.web.tsx', '.tsx', '.json'],
  },
  optimizeDeps: {
    include: [
      'react-native-web',
      'expo-modules-core',
    ],
    exclude: [
      'expo-location',
      'expo-battery',
      'expo-device',
      'expo-haptics',
      'expo-sensors',
      'expo-status-bar',
      'expo-linear-gradient'
    ],
    esbuildOptions: {
      resolveExtensions: ['.web.js', '.js', '.web.ts', '.ts', '.web.tsx', '.tsx', '.json'],
      loader: {
        '.js': 'jsx',
      },
    },
  },
  define: {
    global: 'window',
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
});
