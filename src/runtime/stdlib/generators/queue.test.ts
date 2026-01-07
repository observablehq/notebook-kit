import {describe, it, expect} from "vitest";
import {queue} from "./queue.js";

describe("queue", () => {
  it("yields values in FIFO order", async () => {
    const o = queue((change) => {
      change(1);
      change(2);
    });
    expect((await o.next()).value).toBe(1);
    expect((await o.next()).value).toBe(2);
  });

  it("rejects pending promise on return", async () => {
    // Needed semantic for serialized variable reevaluation
    const o = queue<number>(() => {});
    const pending = o.next();
    await o.return();
    await expect(pending).rejects.toThrow(/Generator returned/);
  });

  it("does not reject if no pending promise on return", async () => {
    const o = queue((change) => {
      change(1);
    });
    expect((await o.next()).value).toBe(1);
    const result = await o.return();
    expect(result.done).toBe(true);
  });
});
