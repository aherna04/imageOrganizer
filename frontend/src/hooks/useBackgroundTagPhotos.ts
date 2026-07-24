import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MediaFile, api } from "../api/client";

function shuffleIds(items: MediaFile[]): number[] {
  const ids = items.map((f) => f.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

/** Loads and shuffles photos for the configured home/skin background tag. */
export function useBackgroundTagPhotos() {
  const { data: config } = useQuery({ queryKey: ["config"], queryFn: api.getConfig });
  const tagSlug = config?.home_background_tag?.trim() || "landscapes";

  const { data: tags } = useQuery({ queryKey: ["tags"], queryFn: api.listTags });
  const tagId = tags?.find((t) => t.slug === tagSlug)?.id;

  const { data: photoPage } = useQuery({
    queryKey: ["background-tag-photos", tagSlug, tagId],
    queryFn: () => api.listFiles({ tag_id: tagId!, page_size: 24 }),
    enabled: tagId != null,
  });

  const items = photoPage?.items ?? [];
  const itemKey = items.map((f) => f.id).join(",");

  const order = useMemo(() => {
    if (items.length === 0) return [] as number[];
    return shuffleIds(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reshuffle only when the id set changes
  }, [itemKey]);

  const parsedInterval = Number.parseInt(config?.view_skin_interval_sec ?? "28", 10);
  const skinIntervalSec =
    Number.isFinite(parsedInterval) && parsedInterval >= 0 ? parsedInterval : 28;

  return {
    tagSlug,
    order,
    itemKey,
    ready: config != null,
    skinStyle: config?.view_skin_style ?? "soft",
    skinIntervalSec,
  };
}
