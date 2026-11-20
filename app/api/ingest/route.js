import { timingSafeEqual } from "node:crypto";
import { ingestDeviceStatus, InvalidDeviceStatusError } from "../../../lib/analysisStore.mjs";

export const dynamic = "force-dynamic";

function hasValidApiKey(suppliedKey, expectedKey) {
  const supplied = Buffer.from(suppliedKey || "");
  const expected = Buffer.from(expectedKey);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function POST(request) {
  const expectedKey = process.env.ANALYSIS_INGEST_API_KEY;
  if (!expectedKey) {
    return Response.json(
      { error: "Ingestion API key is not configured" },
      { status: 503 }
    );
  }
  if (!hasValidApiKey(request.headers.get("x-api-key"), expectedKey)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let status;
  try {
    status = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  try {
    await ingestDeviceStatus(status);
    return Response.json({ accepted: true }, { status: 200 });
  } catch (error) {
    if (error instanceof InvalidDeviceStatusError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("Could not save ESP32 status:", error);
    return Response.json({ error: "Could not save online device status" }, { status: 503 });
  }
}
