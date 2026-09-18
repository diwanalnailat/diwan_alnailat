import { greenRequest } from "../lib/green-api.js";
try {
  const state = await greenRequest(process.env, "getStateInstance");
  if (state.stateInstance !== "authorized")
    throw new Error("Green API is not authorized");
  const settings = await greenRequest(process.env, "getSettings");
  const phone = String(settings.wid || "").split("@")[0];
  if (!process.env.GREEN_API_PHONE || phone !== process.env.GREEN_API_PHONE.replace(/^\+/, ""))
    throw new Error(
      "Green API linked phone does not match the requested account",
    );
  console.log(
    JSON.stringify({
      provider: "green_api",
      authorized: true,
      phoneMatches: true,
    }),
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
