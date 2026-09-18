// Converts a CSS text declaration string ("flex:1;min-width:0") into a React
// inline-style object. The view-model logic ported from the prototype builds
// many of its dynamic styles as CSS text, so this keeps that logic unchanged.
export function styleText(input) {
  if (!input) return undefined;
  if (typeof input === "object") return input;
  const out = {};
  String(input)
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean)
    .forEach((decl) => {
      const i = decl.indexOf(":");
      if (i === -1) return;
      const prop = decl.slice(0, i).trim();
      const value = decl.slice(i + 1).trim();
      if (!prop || !value) return;
      const camel = prop.startsWith("--")
        ? prop
        : prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      out[camel] = value;
    });
  return out;
}
