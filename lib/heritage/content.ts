import type { HeritageSeason } from "./types";

// Existing editorial records; evidence: docs/nailat-results.md.
const seasons: HeritageSeason[] = [
  {
    season: "2021–2022",
    edition: "6",
    title: "بداية الحضور",
    awards: [
      { rank: 2, title: "بيرق المؤسس", date: "2022-01-08" },
      { rank: 2, title: "فردي الجل", date: "2021-12-23" },
      { rank: 4, title: "فردي الجل", date: "2021-12-23" },
      { rank: 5, title: "فردي الجل", date: "2021-12-23" },
      { rank: 5, title: "فردي الدق", date: "2021-12-23" },
    ],
  },
  {
    season: "2022–2023",
    edition: "7",
    title: "بيرقٌ ونخبة",
    awards: [
      { rank: 1, title: "بيرق المؤسس", date: "2023-01-09" },
      { rank: 1, title: "نخبة النخبة", date: "2023-01-11" },
      { rank: 2, title: "فردي الجل", camel: "رعادة", date: "2022-12-22" },
    ],
  },
  {
    season: "2023–2024",
    edition: "8",
    title: "صدارة الوضح",
    awards: [
      { rank: 1, title: "بيرق الموحد", date: "2023-12-31" },
      { rank: 1, title: "نخبة النخبة", date: "2024-01-02" },
      ...[1, 2, 3, 4, 5].map((rank) => ({ rank, title: "فردي الجل" })),
    ],
  },
  {
    season: "2024–2025",
    edition: "9",
    title: "رايةٌ تتجدد",
    awards: [
      { rank: 1, title: "بيرق الموحد", date: "2024-12-30" },
      { rank: 1, title: "نخبة النخبة", date: "2024-12-31" },
      ...[1, 2, 3, 4, 5, 7, 9, 10].map((rank) => ({
        rank,
        title: "فردي الجل",
        date: "2024-12-19",
      })),
      ...[2, 5].map((rank) => ({
        rank,
        title: "فردي الدق · بكار",
        date: "2024-12-18",
      })),
    ],
  },
  {
    season: "2025–2026",
    edition: "10",
    title: "على درب الإنجاز",
    awards: [
      { rank: 1, title: "بيرق الموحد", date: "2025-12-30" },
      ...[1, 2, 3, 4, 5].map((rank) => ({
        rank,
        title: "فردي الجل",
        date: "2025-12-14",
      })),
    ],
  },
];

// Replace this repository boundary when the database is connected.
export function getHeritageSeasons(): HeritageSeason[] {
  return [...seasons].reverse();
}
