import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.granvia536.motohud',
  appName: 'MotoHUD',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
};

export default config;
