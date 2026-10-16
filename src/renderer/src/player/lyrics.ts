export interface LyricLine {
  time: number;
  text: string;
  translation: string;
}

function timedLines(raw: string): { time: number; text: string }[] {
  const result: { time: number; text: string }[] = [];
  const offset = Number(raw.match(/\[offset:\s*(-?\d+)\]/i)?.[1] ?? 0) / 1000;
  for (const line of raw.split(/\r?\n/)) {
    const times = [
      ...line.matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g),
    ];
    const text = line.replace(/\[[^\]]*\]/g, "").trim();
    if (!text) continue;
    for (const time of times) {
      const seconds = Number(time[2]);
      if (seconds >= 60) continue;
      result.push({
        time: Math.max(
          0,
          Number(time[1]) * 60 +
            seconds +
            Number(`0.${time[3] ?? "0"}`) +
            offset,
        ),
        text,
      });
    }
  }
  return result.sort((a, b) => a.time - b.time);
}

export function parseLyrics(
  original: string,
  translated = "",
): { lines: LyricLine[]; plain: string } {
  const times = timedLines(original);
  const translations = new Map(
    timedLines(translated).map((line) => [
      Math.round(line.time * 100),
      line.text,
    ]),
  );
  const grouped = new Map<number, string[]>();
  for (const line of times) {
    const group = grouped.get(line.time) ?? [];
    if (!group.includes(line.text)) group.push(line.text);
    grouped.set(line.time, group);
  }
  const lines = [...grouped.entries()].map(([time, text]) => ({
    time,
    text: text.join(" / "),
    translation: translations.get(Math.round(time * 100)) ?? "",
  }));
  return {
    lines,
    plain: lines.length
      ? ""
      : original.replace(/\[(?:ar|ti|al|by|offset):[^\]]*\]/gi, "").trim(),
  };
}

export function currentLyricIndex(lines: LyricLine[], time: number): number {
  let low = 0,
    high = lines.length - 1,
    result = -1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (lines[mid]!.time <= time) {
      result = mid;
      low = mid + 1;
    } else high = mid - 1;
  }
  return result;
}
