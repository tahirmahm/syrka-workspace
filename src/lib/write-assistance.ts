export type Suggestion = {
  from: number;
  to: number;
  original: string;
  replacement: string;
  reason: string;
};
/** Deliberately conservative, local English rules. Not AI or a complete grammar checker. */
export function writingSuggestions(
  text: string,
  language: string,
): Suggestion[] {
  if (!language.startsWith("en")) return [];
  const result: Suggestion[] = [];
  const rules: [RegExp, (m: RegExpExecArray) => string, string][] = [
    [
      /(?:^|[.!?]\s+)([a-z])([a-z]{1,})\b/g,
      (m) =>
        m[0].slice(0, m[0].length - m[1].length - m[2].length) +
        m[1].toUpperCase() +
        m[2],
      "Possible sentence capitalization",
    ],
    [/\s+([,;:!?])/g, (m) => m[1], "Space before punctuation"],
    [/\b(They|We|You) is\b/g, (m) => m[1] + " are", "Subject–verb agreement"],
    [/\bi\b/g, () => "I", "Capitalise the English pronoun"],
    [
      /\b(teh|recieve|seperate|definately|occured)\b/gi,
      (m) =>
        ({
          teh: "the",
          recieve: "receive",
          seperate: "separate",
          definately: "definitely",
          occured: "occurred",
        })[m[0].toLowerCase()] || m[0],
      "Common spelling",
    ],
    [/\b(\w+)\s+\1\b/gi, (m) => m[1], "Repeated word"],
    [/([^\S\n]){2,}/g, () => " ", "Repeated spaces"],
    [/\b(He|She|It) are\b/g, (m) => m[1] + " is", "Subject–verb agreement"],
    [
      /\b(dont|doesnt|isnt|cant|wont)\b/gi,
      (m) =>
        ({
          dont: "don't",
          doesnt: "doesn't",
          isnt: "isn't",
          cant: "can't",
          wont: "won't",
        })[m[0].toLowerCase()] || m[0],
      "Possible missing apostrophe",
    ],
  ];
  for (const [pattern, replace, reason] of rules) {
    let m;
    while ((m = pattern.exec(text)))
      result.push({
        from: m.index,
        to: m.index + m[0].length,
        original: m[0],
        replacement: replace(m),
        reason,
      });
  }
  return result.sort((a, b) => a.from - b.from);
}
export type Source = {
  author: string;
  title: string;
  year: string;
  publisher: string;
  doi: string;
  url: string;
};
export function citation(s: Source, style: string) {
  return style === "MLA"
    ? `(${s.author})`
    : style === "Chicago"
      ? `(${s.author} ${s.year})`
      : `(${s.author}, ${s.year})`;
}
export function bibliography(s: Source, style: string) {
  const end = [
    s.publisher,
    s.doi
      ? `https://doi.org/${s.doi.replace(/^https?:\/\/doi.org\//, "")}`
      : s.url,
  ]
    .filter(Boolean)
    .join(". ");
  return style === "MLA"
    ? `${s.author}. ${s.title}. ${s.publisher}, ${s.year}. ${s.doi || s.url}`
    : style === "Chicago"
      ? `${s.author}. ${s.title}. ${s.publisher}, ${s.year}. ${s.doi || s.url}`
      : `${s.author} (${s.year}). ${s.title}. ${end}.`;
}
export const academicTemplates: Record<string, string[]> = {
  "Reader’s Diary": ["Reading details", "Summary", "Critical reflection"],
  Essay: ["Introduction", "Argument", "Conclusion", "References"],
  "Research paper": [
    "Abstract",
    "Introduction",
    "Methods",
    "Results",
    "Discussion",
    "References",
  ],
  "Literature review": [
    "Introduction",
    "Thematic review",
    "Research gaps",
    "Conclusion",
    "References",
  ],
  "Seminar paper": ["Introduction", "Analysis", "Discussion", "References"],
  Thesis: [
    "Abstract",
    "Introduction",
    "Literature review",
    "Methodology",
    "Findings",
    "Discussion",
    "Conclusion",
    "References",
  ],
  "Lab report": [
    "Aim",
    "Methods",
    "Results",
    "Discussion",
    "Conclusion",
    "References",
  ],
  "Policy brief": [
    "Executive summary",
    "Problem",
    "Evidence",
    "Options",
    "Recommendations",
    "References",
  ],
};
