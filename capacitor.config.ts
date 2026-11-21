import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "ru.moismety.app",
  appName: "MoiSmety",
  webDir: "dist",
  plugins: { CapacitorSQLite: { androidIsEncryption: true } },
};
export default config;
