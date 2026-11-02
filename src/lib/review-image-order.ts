import type { GeneratedPost } from "./types";

export function insertAt<T>(items: readonly T[], from: number, to: number): T[] {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= items.length || to >= items.length) throw new Error("Invalid image position");
  const next = [...items];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

export function ordinaryImagePrompts(post: GeneratedPost): string[] {
  const parts = post.imagePrompt.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const selected = (post.imageTasks || []).filter((task) => task.selected);
  return post.imageUrls.map((_, index) => post.imagePrompts?.[index] ??
    (parts.length > 1 && parts[index] ? parts[index] : selected[index]?.prompt?.trim() || post.imageTasks?.[index]?.prompt?.trim() || post.imagePrompt));
}

export function reorderReviewImages(post: GeneratedPost, from: number, to: number): GeneratedPost {
  if (post.xhsSeries) {
    const cards = insertAt(post.xhsSeries.cards, from, to).map((card, index) => ({ ...card, index }));
    return { ...post, xhsSeries: { ...post.xhsSeries, cards }, imageUrls: cards.flatMap((card) => card.imageUrl ? [card.imageUrl] : []) };
  }
  return { ...post, imageUrls: insertAt(post.imageUrls, from, to), imagePrompts: insertAt(ordinaryImagePrompts(post), from, to) };
}
