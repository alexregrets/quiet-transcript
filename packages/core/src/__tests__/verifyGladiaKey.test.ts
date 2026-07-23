import { describe, expect, it, vi } from "vitest";
import { verifyGladiaKey } from "../providers/gladia";

const respondWith = (status: number) =>
  vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("{}", { status }));

describe("verifyGladiaKey", () => {
  it("reports a key Gladia accepts as valid", async () => {
    await expect(verifyGladiaKey("good-key", respondWith(200))).resolves.toBe("valid");
  });

  it("sends the key in the Gladia auth header", async () => {
    const fetchImpl = respondWith(200);
    await verifyGladiaKey("  spaced-key  ", fetchImpl);

    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toMatchObject({ "x-gladia-key": "spaced-key" });
  });

  it("rejects a key Gladia refuses", async () => {
    await expect(verifyGladiaKey("bad-key", respondWith(401))).rejects.toThrow(/rejected/i);
    await expect(verifyGladiaKey("bad-key", respondWith(403))).rejects.toThrow(/rejected/i);
  });

  it("does not call a working key invalid when Gladia is having a bad day", async () => {
    for (const status of [404, 429, 500, 503]) {
      await expect(verifyGladiaKey("good-key", respondWith(status))).resolves.toBe("unverified");
    }
  });

  it("refuses an empty key without hitting the network", async () => {
    const fetchImpl = respondWith(200);
    await expect(verifyGladiaKey("   ", fetchImpl)).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
