import { HeritagePage } from "../../components/heritage/heritage-page";
import { getHeritageSeasons } from "../../lib/heritage/content";
import { connection } from "next/server";

export default async function Page() {
  await connection();
  return <HeritagePage seasons={await getHeritageSeasons()} />;
}
