import { test } from "node:test";
import assert from "node:assert/strict";
import { createPinia, setActivePinia, disposePinia } from "pinia";
import { useAccountStore } from "../src/renderer/src/stores/account";

test("QR polling survives a temporary outage, resumes and remains cancellable", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1000 });
  const pinia = createPinia();
  setActivePinia(pinia);
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  let calls = 0;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { desktop: { auth: {
    createQr: async () => ({ ok: true, data: { image: "fixture", expiresAt: 181000 } }),
    checkQr: async () => ++calls === 1 ? { ok: false, error: "network" } : { ok: true, data: { status: "waiting" } },
    cancelQr: async () => ({ ok: true }),
  } } } });
  t.after(() => {
    disposePinia(pinia);
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  });
  const store = useAccountStore();
  await store.createQr();
  t.mock.timers.tick(2000);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(store.qrPhase, "waiting");
  assert.match(store.error, /重新检查/);
  t.mock.timers.tick(2000);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(calls, 2);
  assert.equal(store.error, "");
  store.cancelQr();
  t.mock.timers.tick(20000);
  assert.equal(calls, 2);
});
