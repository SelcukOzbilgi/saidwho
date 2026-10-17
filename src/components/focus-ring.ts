// The site's focus ring, in the theme's ink orange. Every control on the case
// and run pages takes it, so no browser draws its own blue default instead.
export const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink";

// The same ring drawn just inside the edge, for a box whose outside edge is
// already a border.
export const FOCUS_RING_INSET = "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-ink";
