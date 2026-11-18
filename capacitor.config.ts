import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fr.pecheloisir.app',
  appName: 'Pêche France',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
