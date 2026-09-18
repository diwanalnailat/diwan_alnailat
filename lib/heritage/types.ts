export type HeritageAward = {
  rank: number;
  title: string;
  date?: string;
  camel?: string;
};
export type HeritageSeason = {
  season: string;
  edition: string;
  title: string;
  awards: HeritageAward[];
};
