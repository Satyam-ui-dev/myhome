const DEVICES = new Set(["light", "light2", "fan", "socket"]);
const DEVICE_FIELDS = ["light", "light2", "fan", "socket"];
const EVENT_PAGE_SIZE = 1000;

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured");
  }
  return { url, serviceKey };
}

async function supabaseRequest(resource, { method = "GET", headers = {}, body } = {}) {
  const { url, serviceKey } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/${resource}`, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store"
  });
  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase request failed (${response.status}): ${responseBody}`);
  }
  return responseBody ? JSON.parse(responseBody) : null;
}

export class InvalidDeviceStatusError extends Error {}

export async function ingestDeviceStatus(status) {
  if (!status || typeof status !== "object" || Array.isArray(status)
      || !Number.isSafeInteger(status.boot) || !Number.isSafeInteger(status.up)
      || !Array.isArray(status.events)) {
    throw new InvalidDeviceStatusError("ESP32 status must include integer boot/up and an events array");
  }

  const nowMilliseconds = Date.now();
  const nowSeconds = Math.floor(nowMilliseconds / 1000);
  const events = status.events.flatMap((event) => {
    if (!event || typeof event !== "object" || Array.isArray(event)
        || !Number.isSafeInteger(event.id) || !Number.isSafeInteger(event.t)
        || !DEVICES.has(event.d) || (event.s !== 0 && event.s !== 1)) {
      return [];
    }
    return [{
      boot: status.boot,
      id: event.id,
      timestamp: Math.max(0, nowSeconds - status.up + event.t),
      device: event.d,
      state: event.s
    }];
  });

  if (events.length) {
    await supabaseRequest("device_events?on_conflict=boot,id", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=minimal"
      },
      body: events
    });
  }

  const deviceStatus = Object.fromEntries(
    DEVICE_FIELDS.map((field) => [
      field,
      typeof status[field] === "boolean" ? status[field] : null
    ])
  );
  await supabaseRequest("device_status?on_conflict=id", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: {
      id: "current",
      ...deviceStatus,
      up: status.up,
      boot: status.boot,
      updated_at: new Date(nowMilliseconds).toISOString()
    }
  });
}

export async function importStoredEvents(events) {
  if (!Array.isArray(events)) {
    throw new InvalidDeviceStatusError("Stored events must be an array");
  }
  const rows = events.flatMap((event) => {
    if (!event || typeof event !== "object" || Array.isArray(event)
        || !Number.isSafeInteger(event.boot) || !Number.isSafeInteger(event.id)
        || !Number.isSafeInteger(event.timestamp) || !DEVICES.has(event.device)
        || (event.state !== 0 && event.state !== 1)) {
      return [];
    }
    return [{
      boot: event.boot,
      id: event.id,
      timestamp: event.timestamp,
      device: event.device,
      state: event.state
    }];
  });

  if (!rows.length) return;
  await supabaseRequest("device_events?on_conflict=boot,id", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=minimal"
    },
    body: rows
  });
}

export async function readDeviceStatus() {
  const rows = await supabaseRequest(
    "device_status?id=eq.current&select=id,light,light2,fan,socket,up,boot,updated_at"
  );
  return rows?.[0] ?? null;
}

export async function readDeviceEvents() {
  const events = [];
  for (let offset = 0; ; offset += EVENT_PAGE_SIZE) {
    const page = await supabaseRequest(
      `device_events?select=timestamp,device,state,boot,id&order=timestamp.asc,boot.asc,id.asc&limit=${EVENT_PAGE_SIZE}&offset=${offset}`
    );
    if (!Array.isArray(page)) throw new Error("Supabase returned an invalid events response");
    events.push(...page.map(({ timestamp, device, state }) => ({ timestamp, device, state })));
    if (page.length < EVENT_PAGE_SIZE) return events;
  }
}
