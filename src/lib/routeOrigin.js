const isLL = (value) =>
  Array.isArray(value) && value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]));

export function resolveRouteOrigin({ selected, userLoc, home } = {}) {
  if (selected && isLL(selected.ll)) {
    return {
      ll: [Number(selected.ll[0]), Number(selected.ll[1])],
      name: selected.name || "Selected starting place",
      detail: selected.address || selected.detail || "",
      kind: "selected",
    };
  }

  if (isLL(userLoc)) {
    return {
      ll: [Number(userLoc[0]), Number(userLoc[1])],
      name: "Current location",
      detail: "Device location",
      kind: "location",
    };
  }

  if (home?.verified && isLL(home.ll)) {
    return {
      ll: [Number(home.ll[0]), Number(home.ll[1])],
      name: home.name || "Home",
      detail: home.address || "Saved Home",
      kind: "home",
    };
  }

  return null;
}
