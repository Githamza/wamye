/**
 * The Wamye brand, as a static SVG from /public. Plain <img> is the right tool —
 * next/image would try to optimize it and needs extra config for SVGs, with
 * nothing to gain for a vector that ships as-is.
 *
 * `variant="wordmark"` (default) is the full "Wamye Delivery" lockup (~3.3:1),
 * used as the primary logo in page headers. `variant="mark"` is just the bird
 * glyph (1:1), a compact brand accent for chrome that already shows a name
 * (e.g. the tenant dashboard header). Callers set the height; width follows.
 */
export function Logo({
  variant = "wordmark",
  className,
}: {
  variant?: "wordmark" | "mark";
  className?: string;
}) {
  const mark = variant === "mark";
  return (
    // eslint-disable-next-line @next/next/no-img-element -- vector brand asset, no optimization needed
    <img
      src={mark ? "/wamyemark.svg" : "/wamyelogo.svg"}
      alt="Wamye"
      className={className ?? (mark ? "h-6 w-6" : "h-11 w-auto sm:h-12")}
    />
  );
}
