import { Block, Loading, Page } from "./Shared";
import { Paragraphs } from "../../components/Paragraphs";
import { mediaSrc } from "../../lib/api";
import type { PubFacility, PubGalleryImage } from "../../lib/types";
import { usePageTitle } from "../../lib/usePageTitle";
import { usePublic } from "../../lib/useFetch";

export default function Facilities() {
  usePageTitle("Facilities");
  const f = usePublic<PubFacility[]>("/public/facilities");
  const g = usePublic<PubGalleryImage[]>("/public/gallery");
  if (!f.data) return <Loading loading={f.loading} error={f.error} />;
  const cats = [...new Set(f.data.map((x) => x.category))];
  return (
    <Page
      title="Facilities"
      intro="A look at the spaces where our pupils learn, play and grow."
    >
      {cats.length === 0 && (
        <p className="rounded-lg border border-dashed border-line p-6 text-muted">
          Information about our facilities is coming soon.
        </p>
      )}
      {cats.map((c) => (
        <Block key={c} title={c}>
          <ul className="grid gap-4 sm:grid-cols-2">
            {f
              .data!.filter((x) => x.category === c)
              .map((x, i) => (
                <li
                  key={i}
                  className="overflow-hidden rounded-xl border border-line bg-white"
                >
                  {x.images[0] && (
                    <img
                      src={mediaSrc(x.images[0].url)}
                      alt={x.images[0].alt}
                      loading="lazy"
                      className="aspect-video w-full object-cover"
                    />
                  )}
                  <div className="p-4">
                    <h3 className="font-display text-lg font-bold">{x.name}</h3>
                    <Paragraphs
                      text={x.description}
                      className="mt-1 text-muted"
                    />
                    {x.images.length > 1 && (
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {x.images.slice(1).map((im, j) => (
                          <li key={j}>
                            <img
                              src={mediaSrc(im.url)}
                              alt={im.alt}
                              loading="lazy"
                              className="h-16 w-24 rounded object-cover"
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              ))}
          </ul>
        </Block>
      ))}
      {!!g.data?.length && (
        <Block title="Photo gallery">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {g.data.map((im, i) => (
              <li key={i}>
                <figure>
                  <a href={mediaSrc(im.url)} target="_blank" rel="noreferrer">
                    <img
                      src={mediaSrc(im.url)}
                      alt={im.alt}
                      loading="lazy"
                      className="aspect-[4/3] w-full rounded-lg object-cover"
                    />
                  </a>
                  {(im.caption || im.facility) && (
                    <figcaption className="mt-1 text-sm text-muted">
                      {im.caption || im.facility}
                    </figcaption>
                  )}
                </figure>
              </li>
            ))}
          </ul>
        </Block>
      )}
    </Page>
  );
}
