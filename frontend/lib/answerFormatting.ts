/**
 * Splits a RAG answer's raw text into renderable blocks (Phase 6B) --
 * paragraphs, plus bullet/numbered runs turned into real lists. This is
 * presentation-only: no word of the answer is added, removed, or
 * reworded. A line's leading "- "/"1. " marker is stripped only when it's
 * replaced by an equivalent semantic <ul>/<ol> marker, never dropped
 * outright. The backend-generated answer text remains authoritative;
 * this never talks to the LLM or re-derives content.
 */

export type AnswerBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] };

const UNORDERED_BULLET = /^[-*•]\s+/;
const ORDERED_BULLET = /^\d+[.)]\s+/;

export function parseAnswerBlocks(answer: string): AnswerBlock[] {
  const paragraphs = answer.trim().split(/\n{2,}/);
  const blocks: AnswerBlock[] = [];

  for (const paragraph of paragraphs) {
    const lines = paragraph
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length === 0) continue;

    // Only treat as a list when there's more than one line and every line
    // in the paragraph shares the same marker style -- a single stray
    // dash in ordinary prose shouldn't turn into a one-item list.
    const isUnorderedList = lines.length > 1 && lines.every((line) => UNORDERED_BULLET.test(line));
    const isOrderedList =
      !isUnorderedList && lines.length > 1 && lines.every((line) => ORDERED_BULLET.test(line));

    if (isUnorderedList) {
      blocks.push({ type: "list", ordered: false, items: lines.map((l) => l.replace(UNORDERED_BULLET, "")) });
    } else if (isOrderedList) {
      blocks.push({ type: "list", ordered: true, items: lines.map((l) => l.replace(ORDERED_BULLET, "")) });
    } else {
      blocks.push({ type: "paragraph", text: paragraph.trim() });
    }
  }

  return blocks;
}
