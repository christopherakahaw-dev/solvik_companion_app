import { useEffect, useRef } from "react";

// Safari's keyboard changes the visual viewport without changing 100vh.
export function ViewportShell({ children, fluid = false, largeText = false }) {
  const ref = useRef(null);

  // On the document element rather than the shell: --size-* are defined on
  // :root, and a custom property substitutes its var()s where it is defined, so
  // raising --type-scale further down the tree has no effect on them.
  useEffect(() => {
    const root = document.documentElement;
    if (largeText) root.setAttribute("data-text", "large");
    else root.removeAttribute("data-text");
    return () => root.removeAttribute("data-text");
  }, [largeText]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      ref.current?.style.setProperty("--visible-height", `${viewport?.height || window.innerHeight}px`);
      ref.current?.style.setProperty("--visible-top", `${viewport?.offsetTop || 0}px`);
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  // data-text drives the whole type scale from one token, so a reader who needs
  // larger text gets it everywhere rather than on the few strings we remembered.
  return <div ref={ref} className={`solvik-app-shell${fluid ? " solvik-app-shell--fluid" : ""}`}>{children}</div>;
}
