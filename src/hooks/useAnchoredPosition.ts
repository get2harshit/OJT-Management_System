import { useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

/**
 * Keeps a `position: fixed` popover pinned to the element that opened it.
 *
 * Dropdowns here render through a portal so they can escape a parent's
 * `overflow: hidden` — a list inside a table cell or a modal body would
 * otherwise be clipped. The cost of leaving the DOM tree is that the popover
 * no longer moves with its trigger: `fixed` coordinates are viewport-relative,
 * so the moment anything scrolls, the trigger slides away and the list stays
 * behind, floating over unrelated content.
 *
 * Recomputing on every scroll and resize is what re-attaches them. The scroll
 * listener is registered in the **capture** phase deliberately: the scroll that
 * matters is usually an inner container's — a modal body, a scrollable table —
 * and scroll events do not bubble, so a listener on `window` alone would never
 * hear them.
 *
 * @param anchorRef  the trigger the popover should follow
 * @param open       only tracks while true; listeners are torn down otherwise
 * @param computePosition  derives the style from the trigger's current rect
 * @param initialPosition  used until the first measurement
 */
export function useAnchoredPosition<P>(
  anchorRef: RefObject<HTMLElement | null>,
  open: boolean,
  computePosition: (rect: DOMRect) => P,
  initialPosition: P,
): P {
  const [position, setPosition] = useState<P>(initialPosition);

  // Held in a ref so callers can pass an inline arrow without the effect
  // re-subscribing on every render.
  const computeRef = useRef(computePosition);
  computeRef.current = computePosition;

  useLayoutEffect(() => {
    if (!open) return;

    const reposition = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      setPosition(computeRef.current(anchor.getBoundingClientRect()));
    };

    // Measured in a layout effect so the first paint already has the popover
    // in the right place — a passive effect would show it at the stale
    // position for a frame.
    reposition();

    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, anchorRef]);

  return position;
}
