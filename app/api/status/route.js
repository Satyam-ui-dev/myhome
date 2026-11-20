import { readDeviceStatus } from "../../../lib/analysisStore.mjs";

export const dynamic = "force-dynamic";
const STALE_AFTER_MS = 15_000;

export async function GET() {
  try {
    const savedStatus = await readDeviceStatus();
    if (!savedStatus) {
      return Response.json(
        { connected: false, error: "Waiting for collector" },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const stale = Date.now() - Date.parse(savedStatus.updated_at) > STALE_AFTER_MS;
    return Response.json({
      connected: !stale,
      error: stale ? "Collector data is stale" : "",
      light: savedStatus.light,
      light2: savedStatus.light2,
      fan: savedStatus.fan,
      socket: savedStatus.socket,
      up: savedStatus.up,
      boot: savedStatus.boot
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Could not read online device status:", error);
    return Response.json(
      { connected: false, error: "Online status service unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
