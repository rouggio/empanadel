export interface Slot {
  start: string;
  end: string;
  status: "available" | "booked" | "blocked" | "closed";
}

export function splitIntoSlots(open: string, close: string, durationMin: number): Array<{ start: string; end: string }> {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const toStr = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  const start = toMin(open);
  const end = toMin(close);
  const slots: Array<{ start: string; end: string }> = [];
  for (let cur = start; cur + durationMin <= end; cur += durationMin) {
    slots.push({ start: toStr(cur), end: toStr(cur + durationMin) });
  }
  return slots;
}

export function overlaps(a: { start: string; end: string }, b: { start: string; end: string }): boolean {
  return a.start < b.end && b.start < a.end;
}
