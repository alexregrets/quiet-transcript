import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createKeyStore, isPlausibleKey } from "../keystore";

let directory: string;
let filePath: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "keystore-test-"));
  filePath = join(directory, "keys.json");
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("isPlausibleKey", () => {
  it("accepts a realistic key", () => {
    expect(isPlausibleKey("a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe(true);
  });

  it("rejects junk", () => {
    expect(isPlausibleKey("short")).toBe(false);
    expect(isPlausibleKey("has spaces in it")).toBe(false);
    expect(isPlausibleKey("")).toBe(false);
    expect(isPlausibleKey("x".repeat(201))).toBe(false);
  });
});

describe("createKeyStore", () => {
  it("starts empty when there is no file yet", async () => {
    const store = await createKeyStore(filePath);
    expect(store.size()).toBe(0);
    expect(store.get(1)).toBeUndefined();
    expect(store.has(1)).toBe(false);
  });

  it("stores and reads back a key", async () => {
    const store = await createKeyStore(filePath);
    await store.set(42, "a1b2c3d4e5f6a7b8");

    expect(store.get(42)).toBe("a1b2c3d4e5f6a7b8");
    expect(store.has(42)).toBe(true);
  });

  it("keeps users separate", async () => {
    const store = await createKeyStore(filePath);
    await store.set(1, "key-for-user-one");
    await store.set(2, "key-for-user-two");

    expect(store.get(1)).toBe("key-for-user-one");
    expect(store.get(2)).toBe("key-for-user-two");
  });

  it("survives a restart", async () => {
    const first = await createKeyStore(filePath);
    await first.set(7, "persisted-key-value");

    const second = await createKeyStore(filePath);
    expect(second.get(7)).toBe("persisted-key-value");
  });

  it("trims surrounding whitespace from a pasted key", async () => {
    const store = await createKeyStore(filePath);
    await store.set(1, "  padded-key-value  ");
    expect(store.get(1)).toBe("padded-key-value");
  });

  it("refuses to store something that is not key-shaped", async () => {
    const store = await createKeyStore(filePath);
    await expect(store.set(1, "nope")).rejects.toThrow();
    expect(store.has(1)).toBe(false);
  });

  it("removes a key and reports whether there was one", async () => {
    const store = await createKeyStore(filePath);
    await store.set(1, "removable-key-value");

    await expect(store.remove(1)).resolves.toBe(true);
    await expect(store.remove(1)).resolves.toBe(false);
    expect(store.has(1)).toBe(false);
  });

  it("writes the file so only the owner can read it", async () => {
    const store = await createKeyStore(filePath);
    await store.set(1, "permission-check-key");

    const mode = (await stat(filePath)).mode & 0o777;
    // Windows does not implement POSIX permission bits.
    if (process.platform !== "win32") {
      expect(mode).toBe(0o600);
    }
  });

  it("keeps a corrupt file instead of overwriting it", async () => {
    await writeFile(filePath, "{ this is not json");

    const store = await createKeyStore(filePath);
    expect(store.size()).toBe(0);

    await store.set(1, "key-after-corruption");
    expect(await readFile(filePath, "utf8")).toContain("key-after-corruption");
  });

  it("ignores non-string values left in the file", async () => {
    await writeFile(filePath, JSON.stringify({ "1": "good-key-value-here", "2": 12345 }));

    const store = await createKeyStore(filePath);
    expect(store.get(1)).toBe("good-key-value-here");
    expect(store.get(2)).toBeUndefined();
  });
});
