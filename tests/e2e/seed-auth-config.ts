import { realpathSync } from "node:fs";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { hashSeedPassword } from "../../server/src/auth/password";

/**
 * Seeds the auth config the e2e server boots against.
 *
 * The suite signs in through the real login form, but a server that seeds
 * itself writes `loginRequired: false` (DockLite ships as a loopback desktop
 * app and skips the login wall by default). On a loopback bind that disables
 * auth entirely, so `/login` sees an already-authenticated session and
 * redirects to `/` before the form can render — every spec then failed on a
 * missing "Admin user" field.
 *
 * Seeding the file ourselves with `loginRequired: true` puts the suite in the
 * mode it was written for, without giving production a test-only switch.
 *
 * `hashSeedPassword` deliberately skips the password policy, which is what lets
 * the built-in "admin" survive MIN_PASSWORD_LENGTH.
 */

/**
 * realpath() of the deepest existing ancestor with the not-yet-existing tail
 * appended, so a symlink cannot aim the write outside the temp directory while
 * still looking like it is inside one. Same approach as the credential-path
 * check in server/src/engine-targets/schemas.ts.
 */
function resolveSymlinks(target: string): string {
  const tail: string[] = [];
  let head = target;

  for (;;) {
    try {
      return join(realpathSync(head), ...tail);
    } catch {
      const parent = dirname(head);
      if (parent === head) {
        return target;
      }
      tail.unshift(basename(head));
      head = parent;
    }
  }
}

async function main() {
  const requestedPath = process.env.DOCKLITE_AUTH_CONFIG_PATH;

  if (!requestedPath) {
    throw new Error("DOCKLITE_AUTH_CONFIG_PATH must be set when seeding the e2e auth config");
  }

  // This writes a publicly known JWT secret and the built-in admin password.
  // Pointed at a real install it would hand out forgeable tokens, so refuse to
  // write anywhere but the throwaway temp directory the suite uses.
  // Both sides go through realpath: a lexical check would be fooled by a
  // symlinked /tmp/docklite-playwright pointing at a real data directory, and
  // the write (and Playwright's rm -rf) would follow it.
  const filePath = resolveSymlinks(resolve(requestedPath));
  const temporaryRoot = resolveSymlinks(resolve(tmpdir()));
  const relativeToTemp = relative(temporaryRoot, filePath);

  if (relativeToTemp.startsWith("..") || relativeToTemp.split(sep).includes("..") || filePath === temporaryRoot) {
    throw new Error(
      `Refusing to seed test credentials at ${filePath}: it is outside ${temporaryRoot}. ` +
        "This script writes a known secret and is only ever for the e2e server.",
    );
  }

  const config = {
    adminUsername: "admin",
    adminPasswordHash: await hashSeedPassword("admin"),
    authVersion: 1,
    // Fixed so a token stays valid across a restart within one run. Test-only,
    // and well past the 16-character minimum the config schema enforces.
    jwtSecret: "docklite-e2e-jwt-secret-not-for-real-use",
    // auth.spec.ts asserts the "Default credentials are active." notice, which
    // only renders while this is true and nobody is signed in.
    defaultCredentialsActive: true,
    loginRequired: true,
    updatedAt: new Date().toISOString(),
  };

  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
  await chmod(dirname(filePath), 0o700);
  await writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await chmod(filePath, 0o600);

  console.log(`Seeded e2e auth config at ${filePath} (login required)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
