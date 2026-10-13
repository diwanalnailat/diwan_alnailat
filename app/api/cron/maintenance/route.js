import { maintenanceCron } from "../../../../lib/maintenance-cron.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function GET(request) {
  return maintenanceCron(request, process.env.CRON_SECRET, async () => {
    const { serverEnvironment } =
      await import("../../../../lib/server-runtime.js");
    const { maintain } = await import("../../../../lib/operations.js");
    const { dispatchNotifications } = await import("../../../../worker.js");
    const env = await serverEnvironment();
    const maintenance = await maintain(env);
    // The existing lease and daily reminder IDs protect duplicate cron delivery.
    const delivery = maintenance.skipped
      ? { skipped: true }
      : await dispatchNotifications(env);
    return { maintenance, delivery };
  });
}

// Next would otherwise call GET for HEAD; a health probe must never run jobs.
export function HEAD(request) {
  return maintenanceCron(request, process.env.CRON_SECRET, async () => ({}));
}
