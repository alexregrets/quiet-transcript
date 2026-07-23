import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Per-user Gladia API keys.
 *
 * These are other people's secrets, so the file is written with 0600 permissions and
 * key values are never logged or included in error messages.
 */
export interface KeyStore {
  get(userId: number): string | undefined;
  has(userId: number): boolean;
  set(userId: number, apiKey: string): Promise<void>;
  remove(userId: number): Promise<boolean>;
  size(): number;
}

const FILE_MODE = 0o600;

/** Rejects obvious junk before it reaches Gladia, without assuming a key format. */
export const isPlausibleKey = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length >= 8 && trimmed.length <= 200 && !/\s/.test(trimmed);
};

const readStore = async (filePath: string): Promise<Record<string, string>> => {
  let raw: string;

  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    // No file yet is the normal first-run case.
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }

    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string"
      )
    );
  } catch {
    // Preserve the unreadable file instead of overwriting it on the next save —
    // it is the only copy of these users' keys.
    const backup = `${filePath}.corrupt-${Date.now()}`;
    await rename(filePath, backup).catch(() => undefined);
    console.error(`[keystore] could not parse the key file; moved it to ${backup}`);
    return {};
  }
};

export const createKeyStore = async (filePath: string): Promise<KeyStore> => {
  const entries = await readStore(filePath);

  // Saves are chained so two concurrent writes cannot interleave and truncate the file.
  let pendingWrite: Promise<void> = Promise.resolve();

  const persist = () => {
    pendingWrite = pendingWrite.then(async () => {
      // Write then rename, so a crash mid-write cannot leave a half-written file.
      const temporaryPath = join(dirname(filePath), `.${Date.now()}.keystore.tmp`);
      await writeFile(temporaryPath, JSON.stringify(entries, null, 2), { mode: FILE_MODE });
      await rename(temporaryPath, filePath);
      await chmod(filePath, FILE_MODE).catch(() => undefined);
    });

    return pendingWrite;
  };

  return {
    get: (userId) => entries[String(userId)],
    has: (userId) => entries[String(userId)] !== undefined,
    size: () => Object.keys(entries).length,

    set: async (userId, apiKey) => {
      const trimmed = apiKey.trim();

      if (!isPlausibleKey(trimmed)) {
        throw new Error("That does not look like an API key.");
      }

      entries[String(userId)] = trimmed;
      await persist();
    },

    remove: async (userId) => {
      if (entries[String(userId)] === undefined) {
        return false;
      }

      delete entries[String(userId)];
      await persist();
      return true;
    }
  };
};
