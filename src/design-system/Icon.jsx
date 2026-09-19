import { useEffect, useReducer } from "react";
import * as lucide from "lucide";

function nodesFor(name) {
  // A missing or malformed name must not take down the whole tree.
  if (!name || typeof name !== "string") return null;
  const pascal = name.replace(/(^|-)([a-z0-9])/gi, (_, __, c) => c.toUpperCase());
  const node = lucide[pascal] || lucide[pascal.replace(/\d+$/, "")] || (pascal.toLowerCase().includes("clock") ? lucide.Clock : null);
  if (!node) return null;
  return Array.isArray(node) ? node : [];
}

export function Icon({
  name,
  size = 20,
  strokeWidth = 2,
  color = "currentColor",
  title,
  style,
  ...rest
}) {
  const [, force] = useReducer((n) => n + 1, 0);
  useEffect(() => {
    if (nodesFor(name)) return;
    const t = setInterval(() => {
      if (nodesFor(name)) {
        clearInterval(t);
        force();
      }
    }, 120);
    const stop = setTimeout(() => clearInterval(t), 4000);
    return () => {
      clearInterval(t);
      clearTimeout(stop);
    };
  }, [name]);

  const children = nodesFor(name) || [];
  return (
    <svg
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "block", flex: "none", ...style }}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children.map(([tag, attrs], i) => {
        const Tag = tag;
        return <Tag key={i} {...attrs} />;
      })}
    </svg>
  );
}
