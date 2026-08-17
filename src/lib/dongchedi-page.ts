import { load } from "cheerio";
import { fetchDongchediHtml, isDongchediAccessChallenge } from "./dongchedi";

const allowedHosts = new Set(["dongchedi.com", "www.dongchedi.com"]);
const articleIdPattern = /^\d{8,24}$/;

export type DongchediCategoryArticle = {
  sourceId: string;
  url: string;
  title?: string;
  coverUrl?: string;
};

export function normalizeDongchediCategoryUrl(value: string) {
  const parsed = new URL(value.trim());
  if (parsed.protocol !== "https:" || !allowedHosts.has(parsed.hostname.toLowerCase())) {
    throw new Error("Dongchedi category URL must use an allowed HTTPS Dongchedi host.");
  }
  if (!/^\/news(?:\/|$)/i.test(parsed.pathname)) {
    throw new Error("Dongchedi category URL must use a /news/ path.");
  }
  parsed.hash = "";
  return parsed.toString();
}

export function extractDongchediCategoryArticles(html: string, limit = 30): DongchediCategoryArticle[] {
  const result: DongchediCategoryArticle[] = [];
  const seen = new Set<string>();
  const document = load(html);

  const add = (sourceId: string, context?: { title?: string; coverUrl?: string }) => {
    if (!articleIdPattern.test(sourceId) || seen.has(sourceId) || result.length >= limit) return;
    seen.add(sourceId);
    result.push({
      sourceId,
      url: `https://www.dongchedi.com/ugc/article/${sourceId}`,
      title: context?.title?.trim() || undefined,
      coverUrl: context?.coverUrl,
    });
  };

  document("a[href]").each((_index, element) => {
    const href = document(element).attr("href") || "";
    let parsed: URL;
    try {
      parsed = new URL(href, "https://www.dongchedi.com");
    } catch {
      return;
    }
    if (!allowedHosts.has(parsed.hostname.toLowerCase())) return;
    const match = parsed.pathname.match(/^\/ugc\/article\/(\d{8,24})(?:\/|$)/i);
    if (!match) return;
    const card = document(element);
    const image = card.find("img").first();
    add(match[1], {
      title: card.text().replace(/\s+/g, " ").trim(),
      coverUrl: image.attr("src") || image.attr("data-src") || undefined,
    });
  });

  for (const match of html.matchAll(/["'](?:https?:\/\/(?:www\.)?dongchedi\.com)?\/ugc\/article\/(\d{8,24})(?:[/?#]|["'])/gi)) {
    add(match[1]);
  }

  return result;
}

export async function discoverDongchediCategory(value: string, options: { cookie?: string; limit?: number } = {}) {
  const pageUrl = normalizeDongchediCategoryUrl(value);
  const html = await fetchDongchediHtml(pageUrl, { cookie: options.cookie, maxBytes: 8 * 1024 * 1024 });
  if (isDongchediAccessChallenge(html)) {
    throw new Error("Dongchedi category page returned a login or anti-bot challenge; provide an authorized Cookie or use direct article links.");
  }
  const articles = extractDongchediCategoryArticles(html, Math.min(Math.max(options.limit || 30, 1), 30));
  if (!articles.length) throw new Error("No Dongchedi article links were found on the category page.");
  return { pageUrl, articles };
}

export function isDongchediCategoryStopError(error: unknown) {
  return /HTTP (?:403|429)|login|anti-bot challenge|challenge|request timeout|ETIMEDOUT/i.test(error instanceof Error ? error.message : String(error));
}
