import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CREDENTIAL_PATH_MESSAGE, credentialPathSchema, getCredentialDirectories } from "./schemas";

afterEach(() => {
  vi.unstubAllEnvs();
});

function reject(value: string) {
  const result = credentialPathSchema.safeParse(value);
  expect(result.success).toBe(false);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe("credentialPathSchema (CODE-AUDIT.md M19)", () => {
  it("defaults to the user's ~/.ssh and the DockLite credential directory", () => {
    // Asserted through the schema rather than by string equality: the returned
    // directories are realpath-resolved, so a symlinked home would not match a
    // literal ~/.ssh.
    expect(getCredentialDirectories()).toHaveLength(2);
    expect(credentialPathSchema.parse(join(homedir(), ".ssh", "id_ed25519"))).toBe(
      join(homedir(), ".ssh", "id_ed25519"),
    );
    expect(credentialPathSchema.parse(join(process.cwd(), "server", "data", "credentials", "ca.pem"))).toBe(
      join(process.cwd(), "server", "data", "credentials", "ca.pem"),
    );
  });

  it("rejects paths outside the allowlist with one uniform message", () => {
    // The same message for every rejection: a caller must not be able to tell
    // an existing-but-forbidden file from one that was never there.
    expect(reject("/etc/shadow")).toEqual([CREDENTIAL_PATH_MESSAGE]);
    expect(reject("/etc/definitely-not-a-real-file-9f3a")).toEqual([CREDENTIAL_PATH_MESSAGE]);
    expect(reject(join(homedir(), ".ssh-not-really", "id_ed25519"))).toEqual([CREDENTIAL_PATH_MESSAGE]);
  });

  it("rejects traversal out of an allowed directory", () => {
    expect(reject(join(homedir(), ".ssh", "..", "..", "..", "etc", "shadow"))).toEqual([CREDENTIAL_PATH_MESSAGE]);
    expect(reject(`${join(homedir(), ".ssh")}/../.bashrc`)).toEqual([CREDENTIAL_PATH_MESSAGE]);
  });

  it("rejects a relative path, which would resolve against the server's cwd", () => {
    expect(reject("credentials/ca.pem")).toEqual([CREDENTIAL_PATH_MESSAGE]);
    expect(reject("../../etc/shadow")).toEqual([CREDENTIAL_PATH_MESSAGE]);
  });

  it("rejects a symlink inside an allowed directory that points outside it", async () => {
    const root = await mkdtemp(join(tmpdir(), "docklite-creds-"));
    const allowed = join(root, "allowed");
    const outside = join(root, "outside");
    await mkdir(allowed);
    await mkdir(outside);
    await writeFile(join(outside, "secret.pem"), "not yours");
    await symlink(join(outside, "secret.pem"), join(allowed, "escape.pem"));
    await writeFile(join(allowed, "real.pem"), "fine");
    vi.stubEnv("DOCKLITE_CREDENTIAL_DIRS", allowed);

    expect(credentialPathSchema.parse(join(allowed, "real.pem"))).toBe(join(allowed, "real.pem"));
    expect(reject(join(allowed, "escape.pem"))).toEqual([CREDENTIAL_PATH_MESSAGE]);
  });

  it("takes its allowlist from DOCKLITE_CREDENTIAL_DIRS", () => {
    vi.stubEnv("DOCKLITE_CREDENTIAL_DIRS", ["/opt/docklite/certs", "/opt/docklite/keys"].join(delimiter));

    expect(getCredentialDirectories()).toEqual(["/opt/docklite/certs", "/opt/docklite/keys"]);
    expect(credentialPathSchema.parse("/opt/docklite/keys/client.key")).toBe("/opt/docklite/keys/client.key");
    // The defaults no longer apply once the override is set.
    expect(reject(join(homedir(), ".ssh", "id_ed25519"))).toEqual([CREDENTIAL_PATH_MESSAGE]);
  });
});
