import { config as loadEnv } from "dotenv";
import { AuthConfigStore, DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_USERNAME } from "./auth/config";

loadEnv({ path: "server/.env" });

export async function ensureDockLiteRuntimeBootstrap() {
  const authConfigStore = new AuthConfigStore();
  return authConfigStore.read();
}

async function main() {
  const config = await ensureDockLiteRuntimeBootstrap();

  if (config.defaultCredentialsActive) {
    console.log(
      `Default admin credentials are active: ${DEFAULT_ADMIN_USERNAME} / ${DEFAULT_ADMIN_PASSWORD}. Change them after signing in.`,
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
