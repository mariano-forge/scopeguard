// A drawn zone and its pin: the pin sits on one corner of the zone (the one where the drawing started).
// Moving the pin moves that corner only: the opposite corner stays where it was, so the two sides that
// meet at the pin follow it and the others do not. Shared by the server (src/db/actions.ts) and the
// canvas, which shows the zone as it will be while the pin is moved.

export type PinArea = { x: number; y: number; w: number; h: number };

const round = (value: number) => Math.round(value * 10) / 10;

/** The zone once its pin's corner is at (x, y), in % of the page; never thinner than 1 %. */
export function areaFromPin(area: PinArea, pin: { x: number; y: number }, x: number, y: number): PinArea {
  // A pin away from the zone's corners (placed apart from its drawing): the whole zone follows it.
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.5;
  const onCorner = (near(pin.x, area.x) || near(pin.x, area.x + area.w)) && (near(pin.y, area.y) || near(pin.y, area.y + area.h));
  if (!onCorner) return { ...area, x: round(area.x + x - pin.x), y: round(area.y + y - pin.y) };
  // The corner opposite the pin: the one of the zone farthest from it on each axis.
  const farX = Math.abs(pin.x - area.x) <= Math.abs(pin.x - (area.x + area.w)) ? area.x + area.w : area.x;
  const farY = Math.abs(pin.y - area.y) <= Math.abs(pin.y - (area.y + area.h)) ? area.y + area.h : area.y;
  return {
    x: round(Math.min(x, farX)),
    y: round(Math.min(y, farY)),
    w: round(Math.max(1, Math.abs(farX - x))),
    h: round(Math.max(1, Math.abs(farY - y))),
  };
}
