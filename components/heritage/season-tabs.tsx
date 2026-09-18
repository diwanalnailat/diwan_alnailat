"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import type { HeritageSeason } from "../../lib/heritage/types";

export function SeasonTabs({ seasons }: { seasons: HeritageSeason[] }) {
  const [selected, setSelected] = useState(seasons[0]?.edition);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? seasons.length - 1
          : (index + (event.key === "ArrowLeft" ? 1 : -1) + seasons.length) %
            seasons.length;
    setSelected(seasons[next].edition);
    tabs.current[next]?.focus();
  }

  if (!seasons.length) return <p>لا توجد نتائج مواسم متاحة حاليًا.</p>;

  return (
    <>
      <div className="nw-year-tabs" role="tablist" aria-label="مواسم النائلات">
        {seasons.map((season, index) => (
          <button
            key={season.edition}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            id={`nailat-tab-${season.edition}`}
            type="button"
            role="tab"
            aria-controls={`nailat-season-${season.edition}`}
            aria-selected={selected === season.edition}
            tabIndex={selected === season.edition ? 0 : -1}
            onClick={() => setSelected(season.edition)}
            onKeyDown={(event) => handleKey(event, index)}
          >
            <strong dir="ltr">{season.season}</strong>
            <small>النسخة {season.edition}</small>
          </button>
        ))}
      </div>
      {seasons.map((season) => (
        <section
          key={season.edition}
          className="nw-season"
          id={`nailat-season-${season.edition}`}
          role="tabpanel"
          aria-labelledby={`nailat-tab-${season.edition}`}
          tabIndex={0}
          hidden={selected !== season.edition}
        >
          <div className="nw-season-note">
            <span>مهرجان الملك عبدالعزيز للإبل</span>
            <div
              className="nw-edition-number"
              aria-label={`النسخة ${season.edition}`}
            >
              {season.edition.padStart(2, "0")}
            </div>
            <h3>{season.title}</h3>
            <p>
              نتائج منقية النائلات
              <br />
              لون الوضح · موسم <bdi>{season.season}</bdi>
            </p>
          </div>
          <div className="nw-result-list">
            {season.awards.map((award) => (
              <article
                className="nw-result"
                data-rank={award.rank}
                key={`${award.title}-${award.rank}`}
              >
                <div className="nw-place" aria-label={`المركز ${award.rank}`}>
                  <small>المركز</small>
                  <strong>{award.rank}</strong>
                </div>
                <div>
                  <h3>{award.title}</h3>
                  <p>
                    الوضح
                    {award.camel && (
                      <>
                        {" "}
                        <span aria-hidden="true">·</span>{" "}
                        <span className="nw-camel-name">{award.camel}</span>
                      </>
                    )}
                  </p>
                </div>
                {award.date && (
                  <time dateTime={award.date} dir="ltr">
                    {award.date.split("-").reverse().join(" / ")}
                  </time>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
