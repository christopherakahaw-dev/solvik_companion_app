// What kind of place a search result is, read from its name and address, so a
// result list can lead with an icon: a station looks like a station before you
// read the words. OneMap returns no category, so this is a best guess from the
// text and falls back to a plain pin rather than guessing wrong.
const KINDS = [
  { icon: "train-front", label: "MRT station", test: /\bMRT\b|\bMRT STATION\b|\((?:NS|EW|CG|NE|CC|CE|DT|TE)\d+/i },
  { icon: "tram-front", label: "LRT station", test: /\bLRT\b|\((?:BP|SE|SW|PE|PW|STC|PTC)\d*/i },
  { icon: "bus", label: "Bus", test: /\bBUS (?:INTERCHANGE|INT|TERMINAL|TERMINUS|STOP|HUB)\b|\bBUS INT\b/i },
  { icon: "plane", label: "Airport", test: /\bAIRPORT\b|\bCHANGI (?:T[1-4]|TERMINAL)\b/i },
  { icon: "hospital", label: "Healthcare", test: /\bHOSPITAL\b|\bPOLYCLINIC\b|\bMEDICAL CENTRE\b|\bCLINIC\b/i },
  { icon: "graduation-cap", label: "School", test: /\bSCHOOL\b|\bPRIMARY\b|\bSECONDARY\b|\bUNIVERSITY\b|\bPOLYTECHNIC\b|\bJUNIOR COLLEGE\b|\bINSTITUTE\b|\bCAMPUS\b|\bITE\b|\bNUS\b|\bNTU\b|\bSMU\b|\bSUTD\b/i },
  { icon: "utensils", label: "Food", test: /\bHAWKER\b|\bFOOD CENTRE\b|\bFOOD COURT\b|\bMARKET\b/i },
  { icon: "trees", label: "Park", test: /\bPARK\b(?! ?(?:LANE|ROAD|AVENUE|STREET|CRESCENT))|\bGARDENS?\b(?! ?(?:ROAD|AVENUE|STREET))|\bRESERVOIR\b|\bNATURE RESERVE\b|\bBEACH\b/i },
  { icon: "shopping-bag", label: "Mall", test: /\bMALL\b|\bSHOPPING CENTRE\b|\bPLAZA\b|\bJEWEL\b|\bCITY SQUARE\b|\bJUNCTION \d\b|\bNEX\b|\bVIVOCITY\b/i },
  { icon: "building-2", label: "HDB block", test: /\bHDB\b|^\s*(?:BLK|BLOCK)\s*\d/i },
];

const PLACE = { icon: "map-pin", label: "Place" };

export function placeKind(name, detail = "") {
  const named = String(name || "");
  // The name decides first: "BISHAN MRT STATION" on "BISHAN ROAD" is a station,
  // and an address line mentioning a mall nearby shouldn't relabel a block.
  for (const kind of KINDS) if (kind.test.test(named)) return { icon: kind.icon, label: kind.label };
  for (const kind of KINDS) if (kind.test.test(String(detail || ""))) return { icon: kind.icon, label: kind.label };
  return PLACE;
}
