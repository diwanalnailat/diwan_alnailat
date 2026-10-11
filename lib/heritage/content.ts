import "server-only";
import type { HeritageSeason } from "./types";
import { heritageResults } from "../heritage-results.js";
import { serverEnvironment } from "../server-runtime.js";

export async function getHeritageSeasons(): Promise<HeritageSeason[]> {
  const { DB } = await serverEnvironment();
  return (await heritageResults(DB)).seasons;
}
