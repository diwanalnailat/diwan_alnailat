import { HeritagePage } from "../../components/heritage/heritage-page";
import { getHeritageSeasons } from "../../lib/heritage/content";

export default function Page() {
  return <HeritagePage seasons={getHeritageSeasons()} />;
}
