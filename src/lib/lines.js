// One name for a rail line, whoever is writing it.
//
// LTA's service alerts say "NSL". OneMap's routeShortName is "NS", which
// legLabel() turns back into "NSL". A service message may spell it out. The
// crowd-density feed uses a third set again. All of them have to resolve to the
// same thing, because a line we fail to recognise is a line we fail to warn
// about — and, when rerouting, one we fail to avoid.
//
// There are two different relationships here and flattening them is the bug.
//
// An ALIAS is the same physical line under two spellings: Sengkang LRT is STL
// in TrainServiceAlerts and SLRT in the crowd feed. Those unify.
//
// An EXTENSION is a segment that one feed folds into its parent line and the
// other splits out: alerts report the Changi branch as EWL, while the crowd
// feed publishes it separately as CGL. Those are not equal — CGL is *part of*
// EWL — so they get containment below rather than an alias here. Treating them
// as equal would make a Changi crowd reading answer for the whole East-West
// line, and a disruption on EWL miss Changi's stations entirely.
const LINE_ALIASES = {
  NSL: ["NS", "NORTHSOUTH"],
  EWL: ["EW", "EASTWEST"],
  CGL: ["CG", "CHANGI", "CHANGIAIRPORT"],
  CCL: ["CC", "CIRCLE"],
  CEL: ["CE", "CIRCLEEXTENSION"],
  DTL: ["DT", "DOWNTOWN"],
  NEL: ["NE", "NORTHEAST"],
  TEL: ["TE", "THOMSON", "THOMSONEASTCOAST"],
  BPL: ["BP", "BUKITPANJANG"],
  // STL and PTL are how TrainServiceAlerts spells the two LRTs; SLRT and PLRT
  // are how the crowd feed spells the same lines.
  SLRT: ["STL", "SE", "SW", "STC", "SENGKANG"],
  PLRT: ["PTL", "PE", "PW", "PTC", "PUNGGOL"],
};

// An alert line, expanded to every code the crowd-density feed publishes for it.
// The eleven values here are the TrainLine parameter that PCDRealTime and
// PCDForecast accept, verbatim.
const LINE_EXTENSIONS = {
  EWL: ["EWL", "CGL"],
  CCL: ["CCL", "CEL"],
};

export const squashLine = (raw) => String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// The canonical code for a line written any of the ways the feeds write it.
// Returns null for anything that isn't a rail line — a bus service, or the
// "LTA" placeholder a general service message carries.
export function canonicalLine(raw) {
  const key = squashLine(raw);
  if (!key) return null;
  if (LINE_ALIASES[key]) return key;
  for (const [code, aliases] of Object.entries(LINE_ALIASES)) {
    if (aliases.includes(key)) return code;
    // "NSLINE", "DOWNTOWNLINE" — a name with the word LINE still attached.
    if (key.endsWith("LINE") && aliases.includes(key.slice(0, -4))) return code;
  }
  return null;
}

// Do these two names mean the same line? Only ever true for rail: two bus
// services are compared by number elsewhere, where an exact match is wanted.
export function sameLine(a, b) {
  const x = canonicalLine(a);
  return !!x && x === canonicalLine(b);
}

// Which crowd-density codes to read for a line named in a service alert.
// Alerts fold the Changi and Circle extensions into their parent lines; the
// crowd feed does not, so asking for "EWL" alone would silently skip Changi.
export function crowdCodesFor(raw) {
  const code = canonicalLine(raw);
  if (!code) return [];
  return LINE_EXTENSIONS[code] || [code];
}

// Does a crowd-feed code fall under a line named in an alert? CGL is part of
// EWL, so a disruption on EWL covers Changi's stations — but not the reverse:
// a Changi-only reading says nothing about the rest of the East-West line.
export function lineCovers(alertLine, crowdCode) {
  const code = canonicalLine(crowdCode);
  return !!code && crowdCodesFor(alertLine).includes(code);
}
