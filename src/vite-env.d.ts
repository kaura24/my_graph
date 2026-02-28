/// <reference types="vite/client" />

declare module "turndown" {
  interface Options {
    headingStyle?: "setext" | "atx";
    codeBlockStyle?: "indented" | "fenced";
    bulletListMarker?: "-" | "+" | "*";
    hr?: string;
    br?: string;
  }
  class TurndownService {
    constructor(options?: Options);
    turndown(html: string): string;
    use(plugin: unknown): this;
    addRule(key: string, rule: unknown): this;
  }
  export = TurndownService;
}
