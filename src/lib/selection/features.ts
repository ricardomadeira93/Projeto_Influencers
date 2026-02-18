const FILLER_REGEX = /\b(um+|uh+|ah+|eh+|hmm+|tipo|né|you know|like)\b/gi;

function normalize(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function stripFillerWords(text: string) {
  return text.replace(FILLER_REGEX, " ").replace(/\s+/g, " ").trim();
}

export function keywordOverlapRatio(text: string, phrase: string) {
  const normalizedPhrase = normalize(phrase);
  if (!normalizedPhrase) return 0;
  const tokens = normalizedPhrase
    .split(/[^a-z0-9à-ÿ]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
  if (!tokens.length) return 0;
  const lower = normalize(text);
  const hits = tokens.filter((token) => lower.includes(token)).length;
  return hits / tokens.length;
}

export function extractFeatures(text: string) {
  const cleaned = normalize(text);
  const words = cleaned.split(/\s+/).filter(Boolean);
  const uniqueWords = new Set(words);
  const keywordWords = words.filter((word) => word.length >= 6);
  const startsWithFiller = /^(so|and|yeah|então|e aí|bom|bem)\b/i.test(text.trim());
  const ctaNoise = /\b(subscribe|like and subscribe|deixa o like|inscreva-se|comment|comenta)\b/i.test(cleaned);

  return {
    has_question: /[?]/.test(text),
    starts_with_filler: startsWithFiller,
    has_numbered_list: /\b(\d+[\).]|first|second|third|primeiro|segundo|terceiro)\b/i.test(cleaned),
    has_how_to: /\b(how to|como)\b/i.test(cleaned),
    has_warning_words: /\b(don'?t|stop|mistake|wrong|erro|cuidado)\b/i.test(cleaned),
    has_step_words: /\b(step|first|second|passo|primeiro|segundo)\b/i.test(cleaned),
    has_story_markers: /\b(when i|once|i remember|quando eu|um dia|lembro)\b/i.test(cleaned),
    contains_cta_noise: ctaNoise,
    keyword_density: words.length ? keywordWords.length / words.length : 0,
    unique_word_ratio: words.length ? uniqueWords.size / words.length : 0
  };
}
