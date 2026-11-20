import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  ingestDeviceStatus,
  importStoredEvents,
  InvalidDeviceStatusError,
  readDeviceEvents
} from "../lib/analysisStore.mjs";

const originalFetch = globalThis.fetch;
const originalDateNow = Date.now;
const originalEnvironment = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  Date.now = originalDateNow;
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function configureSupabase() {
  process.env.SUPABASE_URL = "https://database.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only-test-key";
}

test("ingest deduplicates ESP event payloads and stores latest switch status", async () => {
  configureSupabase();
  Date.now = () => 1_700_000_010_000;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(null, { status: 204 });
  };

  await ingestDeviceStatus({
    boot: 44,
    up: 20,
    light: false,
    light2: true,
    fan: false,
    socket: true,
    events: [{ id: 8, t: 12, d: "light", s: 1 }]
  });

  assert.equal(requests.length, 2);
  assert.match(requests[0].url, /device_events\?on_conflict=boot,id$/);
  assert.deepEqual(JSON.parse(requests[0].options.body), [{
    boot: 44,
    id: 8,
    timestamp: 1_700_000_002,
    device: "light",
    state: 1
  }]);
  assert.match(requests[1].url, /device_status\?on_conflict=id$/);
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    id: "current",
    light: false,
    light2: true,
    fan: false,
    socket: true,
    up: 20,
    boot: 44,
    updated_at: new Date(1_700_000_010_000).toISOString()
  });
});

test("rejects malformed ESP status before making database requests", async () => {
  configureSupabase();
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response(null, { status: 204 });
  };

  await assert.rejects(ingestDeviceStatus({ events: [] }), InvalidDeviceStatusError);
  assert.equal(called, false);
});

test("imports historical events without changing their timestamps", async () => {
  configureSupabase();
  let inserted;
  globalThis.fetch = async (_url, options) => {
    inserted = JSON.parse(options.body);
    return new Response(null, { status: 204 });
  };

  await importStoredEvents([{
    boot: 44,
    id: 8,
    timestamp: 1_700_000_000,
    device: "light",
    state: 0
  }]);

  assert.deepEqual(inserted, [{
    boot: 44,
    id: 8,
    timestamp: 1_700_000_000,
    device: "light",
    state: 0
  }]);
});

test("reads every event in pages", async () => {
  configureSupabase();
  const offsets = [];
  globalThis.fetch = async (url) => {
    const offset = Number(new URL(url).searchParams.get("offset"));
    offsets.push(offset);
    const page = offsets.length === 1
      ? Array.from({ length: 1000 }, (_, index) => ({
          timestamp: index,
          device: "fan",
          state: 1,
          boot: 1,
          id: index
        }))
      : [{ timestamp: 1000, device: "light", state: 0, boot: 1, id: 1000 }];
    return new Response(JSON.stringify(page), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  const events = await readDeviceEvents();

  assert.deepEqual(offsets, [0, 1000]);
  assert.equal(events.length, 1001);
  assert.deepEqual(events[1000], { timestamp: 1000, device: "light", state: 0 });
});
