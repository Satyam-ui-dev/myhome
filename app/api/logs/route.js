import { readDeviceEvents } from "../../../lib/analysisStore.mjs";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const events = await readDeviceEvents();
    return Response.json(
      { version: 1, events },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Could not read online device events:", error);
    return Response.json(
      { error: "Online analysis history unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
