// Planned works from /api/planned. Throws on failure so the caller can say the
// feed is unavailable rather than implying there is nothing scheduled — "no
// works" and "we couldn't ask" are different answers.
export async function getPlannedWorks() {
  const res = await fetch("/api/planned");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Couldn't check for planned works");
  return {
    works: data.works || [],
    roadWorks: data.roadWorks || [],
    busChanges: data.busChanges || [],
    recorded: !!data.recorded,
  };
}
