import { chromium, type Browser, type Page } from "playwright";

export interface CrawlOptions {
  maxDepth?: number;
  maxPages?: number;
  excludePatterns?: RegExp[];
}

export interface CrawledPage {
  url: string;
  title: string;
  depth: number;
  score: number;
}

export class DiscoveryEngine {
  private browser: Browser | null = null;

  async initialize() {
    this.browser = await chromium.launch({ headless: true });
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async crawl(startUrl: string, options: CrawlOptions = {}): Promise<CrawledPage[]> {
    if (!this.browser) {
      await this.initialize();
    }

    const maxDepth = options.maxDepth ?? 2;
    const maxPages = options.maxPages ?? 15;
    const excludePatterns = options.excludePatterns ?? [
      /privacy/i, /terms/i, /legal/i, /refund/i, /404/i, /login/i, /signup/i, /logout/i
    ];

    const visited = new Set<string>();
    const queue: { url: string; depth: number }[] = [{ url: startUrl, depth: 0 }];
    const results: CrawledPage[] = [];

    const startUrlObj = new URL(startUrl);

    while (queue.length > 0 && results.length < maxPages) {
      const current = queue.shift()!;
      if (visited.has(current.url)) continue;
      visited.add(current.url);

      if (excludePatterns.some(pattern => pattern.test(current.url))) {
        continue;
      }

      const page = await this.browser!.newPage();
      try {
        await page.goto(current.url, { waitUntil: "load", timeout: 15000 });
        const title = await page.title();
        
        // Compute discovery prominence score based on heuristics
        const score = await page.evaluate(() => {
          let pts = 100;
          // Subpages have lower default score
          const pathSegments = window.location.pathname.split("/").filter(Boolean);
          pts -= pathSegments.length * 15;

          // Check if it has headings
          const h1Count = document.querySelectorAll("h1").length;
          if (h1Count > 0) pts += 10;
          
          // Higher score if it has direct CTAs or buttons
          const buttons = document.querySelectorAll("button, a.cta, a.button, input[type='submit']");
          pts += Math.min(buttons.length, 5) * 4;

          return pts;
        });

        results.push({
          url: current.url,
          title,
          depth: current.depth,
          score,
        });

        if (current.depth < maxDepth) {
          // Extract links
          const links = await page.evaluate(() => {
            return Array.from(document.querySelectorAll("a"))
              .map(a => a.href)
              .filter(href => href.startsWith("http"));
          });

          for (const link of links) {
            try {
              const linkUrl = new URL(link);
              // Crawl internal links only
              if (linkUrl.hostname === startUrlObj.hostname && !visited.has(link)) {
                queue.push({ url: link, depth: current.depth + 1 });
              }
            } catch {
              // Ignore invalid link URLs
            }
          }
        }
      } catch (err) {
        console.warn(`Failed to crawl url: ${current.url}`, err);
      } finally {
        await page.close();
      }
    }

    // Sort by discovery score descending
    return results.sort((a, b) => b.score - a.score);
  }
}
