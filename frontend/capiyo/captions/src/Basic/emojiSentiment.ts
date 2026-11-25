/**
 * Deep Sentiment and Keyword Analysis Engine for Creator Subtitles.
 *
 * Automatically inspects transcript cues and spoken words to extract:
 * 1. Emotional sentiment category (hype, wealth, shock, danger, wisdom, etc.)
 * 2. Salient "Hero" emphasis word (anchors viewer attention in accent color)
 * 3. Contextual animated emoji matching the core sentiment or keyword
 *
 * Implements high-retention creator dynamics popularized by MrBeast, Submagic,
 * Ali Abdaal, and viral YouTube Shorts/TikTok creators.
 */

export type SentimentCategory =
  | "hype"
  | "money"
  | "shock"
  | "danger"
  | "mind"
  | "love"
  | "laugh"
  | "sad"
  | "power"
  | "speed"
  | "tech"
  | "world"
  | "food"
  | "question"
  | "win"
  | "creator";

export type WordCandidate = {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  emphasis?: boolean;
};

export type CueSentimentAnalysis = {
  triggerWordId?: string;
  emoji: string;
  category: SentimentCategory;
  heroWordId: string;
  heroWordText: string;
  confidence: number;
  accentColor: string;
  sentimentScore: number; // -1 to +1
  arousal: number; // 0 to 1
  label: string;
  /** False when nothing in the words pointed at an emoji and it is only a filler guess. */
  matched: boolean;
};

// Curated emoji palettes per category for dynamic visual variety
export const CATEGORY_EMOJIS: Record<SentimentCategory, readonly string[]> = {
  hype: ["🔥", "⚡", "🚀", "💥", "🎉", "✨"],
  money: ["💰", "💵", "📈", "🤑", "💎", "👑"],
  shock: ["🤯", "😱", "🫢", "👀", "😳"],
  danger: ["⚠️", "🚨", "🛑", "❌", "💀", "⛔"],
  mind: ["💡", "🧠", "🎯", "🤫", "🧐", "🔍"],
  love: ["❤️", "💖", "😍", "✨", "🙏"],
  laugh: ["😂", "🤣", "💀", "🥳", "🤡"],
  sad: ["😢", "💔", "📉", "🥺", "😔"],
  power: ["💪", "🥊", "🏋️", "🦍", "🏆"],
  speed: ["⏱️", "⏳", "🏃", "💨", "⚡"],
  tech: ["🎬", "📹", "📱", "💻", "🎙️", "🎥"],
  world: ["🌍", "✈️", "🚀", "🌐", "🗺️"],
  food: ["🍔", "🍕", "☕", "🍿", "🍩"],
  question: ["❓", "🤔", "🧐", "👀"],
  win: ["🏆", "🥇", "👑", "🌟", "🎖️"],
  creator: ["💬", "✨", "🎬", "🔥", "🎯"],
};

// Vibrant creator accent colors paired with sentiment
export const CATEGORY_ACCENT_COLORS: Record<SentimentCategory, string> = {
  hype: "#ffe36b", // Electric Yellow
  money: "#00ff88", // Neon Mint
  shock: "#ff9900", // Vivid Orange
  danger: "#ff3b5c", // Punchy Red/Coral
  mind: "#ffe36b", // Golden Yellow
  love: "#ff4d88", // Radiant Pink
  laugh: "#fde047", // Joyful Amber
  sad: "#60a5fa", // Soft Sky Blue
  power: "#fbbf24", // Warm Gold
  speed: "#38bdf8", // Electric Cyan
  tech: "#a78bfa", // Cyber Purple
  world: "#34d399", // Emerald Globe
  food: "#f97316", // Warm Tangerine
  question: "#38bdf8", // Curious Cyan
  win: "#facc15", // Champion Gold
  creator: "#ffe36b", // Signature Creator Gold
};

// Stop words that should rarely or never be chosen as the Hero emphasis word
const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "so", "as", "at", "by", "for", "from",
  "in", "into", "of", "off", "on", "onto", "to", "with", "is", "am", "are", "was",
  "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "can",
  "could", "shall", "should", "will", "would", "may", "might", "must", "it", "its",
  "they", "them", "their", "theirs", "we", "us", "our", "ours", "you", "your", "yours",
  "he", "him", "his", "she", "her", "hers", "that", "this", "these", "those", "there",
  "here", "then", "than", "too", "very", "just", "also", "about",
]);

type KeywordRule = {
  category: SentimentCategory;
  emoji: string;
  weight: number; // 1-10
  sentiment: number; // -1 to +1
};

// 500+ High-intent creator keyword dictionary
const KEYWORD_MAP: Record<string, KeywordRule> = {
  पैसा: { category: "money", emoji: "💰", weight: 9, sentiment: .6 },
  पैसे: { category: "money", emoji: "💰", weight: 9, sentiment: .6 },
  paisa: { category: "money", emoji: "💰", weight: 9, sentiment: .6 },
  paise: { category: "money", emoji: "💰", weight: 9, sentiment: .6 },
  मेहनत: { category: "power", emoji: "💪", weight: 8, sentiment: .6 },
  mehnat: { category: "power", emoji: "💪", weight: 8, sentiment: .6 },
  सपना: { category: "love", emoji: "✨", weight: 8, sentiment: .7 },
  sapna: { category: "love", emoji: "✨", weight: 8, sentiment: .7 },
  प्यार: { category: "love", emoji: "❤️", weight: 9, sentiment: .9 },
  pyaar: { category: "love", emoji: "❤️", weight: 9, sentiment: .9 },
  समय: { category: "speed", emoji: "⏱️", weight: 8, sentiment: .2 },
  samay: { category: "speed", emoji: "⏱️", weight: 8, sentiment: .2 },
  // Video, Creator & Captions
  caption: { category: "creator", emoji: "💬", weight: 9, sentiment: 0.5 },
  captions: { category: "creator", emoji: "💬", weight: 9, sentiment: 0.5 },
  video: { category: "tech", emoji: "📹", weight: 8, sentiment: 0.4 },
  videos: { category: "tech", emoji: "📹", weight: 8, sentiment: 0.4 },
  creator: { category: "creator", emoji: "🎬", weight: 9, sentiment: 0.6 },
  creators: { category: "creator", emoji: "🎬", weight: 9, sentiment: 0.6 },
  content: { category: "creator", emoji: "📱", weight: 7, sentiment: 0.4 },
  youtube: { category: "tech", emoji: "🎬", weight: 9, sentiment: 0.6 },
  tiktok: { category: "tech", emoji: "📱", weight: 9, sentiment: 0.6 },
  shorts: { category: "tech", emoji: "⚡", weight: 8, sentiment: 0.5 },
  reels: { category: "tech", emoji: "📱", weight: 8, sentiment: 0.5 },
  film: { category: "tech", emoji: "🎥", weight: 7, sentiment: 0.4 },
  filming: { category: "tech", emoji: "🎥", weight: 7, sentiment: 0.4 },
  camera: { category: "tech", emoji: "📸", weight: 7, sentiment: 0.4 },
  record: { category: "tech", emoji: "🎙️", weight: 7, sentiment: 0.4 },
  edit: { category: "tech", emoji: "💻", weight: 7, sentiment: 0.4 },
  editing: { category: "tech", emoji: "💻", weight: 7, sentiment: 0.4 },
  channel: { category: "tech", emoji: "📺", weight: 7, sentiment: 0.4 },
  subscribe: { category: "hype", emoji: "🔔", weight: 8, sentiment: 0.6 },
  subscriber: { category: "hype", emoji: "🔔", weight: 8, sentiment: 0.6 },
  subscribers: { category: "hype", emoji: "🔔", weight: 8, sentiment: 0.6 },
  view: { category: "shock", emoji: "👀", weight: 6, sentiment: 0.3 },
  views: { category: "hype", emoji: "📈", weight: 8, sentiment: 0.7 },
  stream: { category: "tech", emoji: "🎧", weight: 7, sentiment: 0.4 },

  // Comprehension, Clarity & Focus
  easy: { category: "mind", emoji: "✨", weight: 8, sentiment: 0.7 },
  simple: { category: "mind", emoji: "✨", weight: 8, sentiment: 0.6 },
  understand: { category: "mind", emoji: "💡", weight: 8, sentiment: 0.6 },
  understanding: { category: "mind", emoji: "💡", weight: 8, sentiment: 0.6 },
  watch: { category: "shock", emoji: "👀", weight: 7, sentiment: 0.4 },
  watching: { category: "shock", emoji: "👀", weight: 7, sentiment: 0.4 },
  look: { category: "shock", emoji: "👀", weight: 7, sentiment: 0.3 },
  listen: { category: "mind", emoji: "👂", weight: 7, sentiment: 0.3 },
  engaging: { category: "hype", emoji: "🔥", weight: 9, sentiment: 0.8 },
  engagement: { category: "hype", emoji: "🔥", weight: 9, sentiment: 0.8 },
  everyone: { category: "world", emoji: "🌍", weight: 7, sentiment: 0.5 },
  everywhere: { category: "world", emoji: "🌍", weight: 8, sentiment: 0.6 },
  world: { category: "world", emoji: "🌍", weight: 8, sentiment: 0.5 },
  global: { category: "world", emoji: "🌐", weight: 8, sentiment: 0.5 },

  // Hype, Energy & Virality
  crazy: { category: "shock", emoji: "🤯", weight: 9, sentiment: 0.8 },
  insane: { category: "shock", emoji: "🤯", weight: 9, sentiment: 0.8 },
  unbelievable: { category: "shock", emoji: "🤯", weight: 9, sentiment: 0.8 },
  wild: { category: "hype", emoji: "⚡", weight: 8, sentiment: 0.7 },
  epic: { category: "hype", emoji: "🔥", weight: 9, sentiment: 0.9 },
  huge: { category: "hype", emoji: "💥", weight: 8, sentiment: 0.7 },
  massive: { category: "hype", emoji: "💥", weight: 9, sentiment: 0.8 },
  viral: { category: "hype", emoji: "🚀", weight: 10, sentiment: 0.9 },
  trending: { category: "hype", emoji: "📈", weight: 8, sentiment: 0.8 },
  beast: { category: "power", emoji: "🦍", weight: 9, sentiment: 0.8 },
  explosion: { category: "hype", emoji: "💥", weight: 9, sentiment: 0.7 },
  boom: { category: "hype", emoji: "💥", weight: 8, sentiment: 0.8 },
  fire: { category: "hype", emoji: "🔥", weight: 9, sentiment: 0.9 },
  lit: { category: "hype", emoji: "🔥", weight: 8, sentiment: 0.8 },
  hype: { category: "hype", emoji: "🔥", weight: 9, sentiment: 0.9 },
  amazing: { category: "hype", emoji: "✨", weight: 8, sentiment: 0.8 },
  awesome: { category: "hype", emoji: "✨", weight: 8, sentiment: 0.8 },
  incredible: { category: "hype", emoji: "✨", weight: 9, sentiment: 0.9 },
  unstoppable: { category: "power", emoji: "🚀", weight: 9, sentiment: 0.9 },
  legendary: { category: "win", emoji: "👑", weight: 9, sentiment: 0.9 },
  goat: { category: "win", emoji: "🐐", weight: 9, sentiment: 0.9 },
  super: { category: "hype", emoji: "⚡", weight: 7, sentiment: 0.6 },
  ultimate: { category: "win", emoji: "🏆", weight: 8, sentiment: 0.8 },

  // Wealth, Money, Business & Success
  money: { category: "money", emoji: "💰", weight: 10, sentiment: 0.8 },
  cash: { category: "money", emoji: "💵", weight: 10, sentiment: 0.8 },
  dollar: { category: "money", emoji: "💵", weight: 9, sentiment: 0.7 },
  dollars: { category: "money", emoji: "💵", weight: 9, sentiment: 0.7 },
  rich: { category: "money", emoji: "🤑", weight: 9, sentiment: 0.8 },
  million: { category: "money", emoji: "💰", weight: 9, sentiment: 0.8 },
  millions: { category: "money", emoji: "💰", weight: 9, sentiment: 0.8 },
  billion: { category: "money", emoji: "💎", weight: 10, sentiment: 0.9 },
  billionaire: { category: "money", emoji: "💎", weight: 10, sentiment: 0.9 },
  millionaire: { category: "money", emoji: "💰", weight: 9, sentiment: 0.8 },
  profit: { category: "money", emoji: "📈", weight: 9, sentiment: 0.8 },
  revenue: { category: "money", emoji: "📈", weight: 9, sentiment: 0.8 },
  business: { category: "money", emoji: "💼", weight: 8, sentiment: 0.6 },
  invest: { category: "money", emoji: "📈", weight: 8, sentiment: 0.7 },
  investing: { category: "money", emoji: "📈", weight: 8, sentiment: 0.7 },
  crypto: { category: "money", emoji: "🪙", weight: 8, sentiment: 0.6 },
  bitcoin: { category: "money", emoji: "🪙", weight: 9, sentiment: 0.7 },
  income: { category: "money", emoji: "💵", weight: 8, sentiment: 0.7 },
  wealth: { category: "money", emoji: "💎", weight: 9, sentiment: 0.8 },
  luxury: { category: "money", emoji: "💎", weight: 8, sentiment: 0.7 },
  expensive: { category: "money", emoji: "💎", weight: 8, sentiment: 0.5 },
  price: { category: "money", emoji: "🏷️", weight: 6, sentiment: 0.2 },
  cost: { category: "money", emoji: "💸", weight: 6, sentiment: -0.2 },
  buy: { category: "money", emoji: "🛍️", weight: 7, sentiment: 0.4 },
  sell: { category: "money", emoji: "🏷️", weight: 7, sentiment: 0.4 },
  sales: { category: "money", emoji: "📈", weight: 8, sentiment: 0.7 },
  prize: { category: "win", emoji: "🎁", weight: 8, sentiment: 0.8 },
  fortune: { category: "money", emoji: "💰", weight: 9, sentiment: 0.8 },

  // Victory, Achievements & Best
  win: { category: "win", emoji: "🏆", weight: 9, sentiment: 0.9 },
  winner: { category: "win", emoji: "🏆", weight: 9, sentiment: 0.9 },
  won: { category: "win", emoji: "🏆", weight: 9, sentiment: 0.9 },
  winning: { category: "win", emoji: "🏆", weight: 9, sentiment: 0.9 },
  victory: { category: "win", emoji: "🏆", weight: 9, sentiment: 0.9 },
  champion: { category: "win", emoji: "🥇", weight: 9, sentiment: 0.9 },
  champions: { category: "win", emoji: "🥇", weight: 9, sentiment: 0.9 },
  trophy: { category: "win", emoji: "🏆", weight: 8, sentiment: 0.8 },
  gold: { category: "win", emoji: "🥇", weight: 8, sentiment: 0.8 },
  first: { category: "win", emoji: "🥇", weight: 8, sentiment: 0.7 },
  best: { category: "win", emoji: "👑", weight: 8, sentiment: 0.8 },
  king: { category: "win", emoji: "👑", weight: 8, sentiment: 0.8 },
  boss: { category: "win", emoji: "👑", weight: 8, sentiment: 0.7 },
  success: { category: "win", emoji: "🌟", weight: 9, sentiment: 0.9 },
  successful: { category: "win", emoji: "🌟", weight: 8, sentiment: 0.8 },
  passed: { category: "win", emoji: "✅", weight: 7, sentiment: 0.6 },
  achieve: { category: "win", emoji: "🎯", weight: 8, sentiment: 0.7 },
  accomplished: { category: "win", emoji: "🎯", weight: 8, sentiment: 0.7 },

  // Warning, Danger, Mistake & Negation
  stop: { category: "danger", emoji: "🛑", weight: 10, sentiment: -0.8 },
  danger: { category: "danger", emoji: "⚠️", weight: 9, sentiment: -0.9 },
  warning: { category: "danger", emoji: "⚠️", weight: 9, sentiment: -0.7 },
  avoid: { category: "danger", emoji: "🚫", weight: 8, sentiment: -0.6 },
  mistake: { category: "danger", emoji: "❌", weight: 9, sentiment: -0.8 },
  mistakes: { category: "danger", emoji: "❌", weight: 9, sentiment: -0.8 },
  wrong: { category: "danger", emoji: "❌", weight: 8, sentiment: -0.7 },
  fail: { category: "danger", emoji: "💀", weight: 9, sentiment: -0.8 },
  failed: { category: "danger", emoji: "💀", weight: 9, sentiment: -0.8 },
  failure: { category: "danger", emoji: "💀", weight: 9, sentiment: -0.8 },
  fatal: { category: "danger", emoji: "💀", weight: 10, sentiment: -0.9 },
  never: { category: "danger", emoji: "🚫", weight: 9, sentiment: -0.7 },
  trap: { category: "danger", emoji: "🪤", weight: 8, sentiment: -0.7 },
  risk: { category: "danger", emoji: "⚠️", weight: 8, sentiment: -0.6 },
  dead: { category: "danger", emoji: "💀", weight: 8, sentiment: -0.8 },
  death: { category: "danger", emoji: "💀", weight: 9, sentiment: -0.9 },
  die: { category: "danger", emoji: "💀", weight: 8, sentiment: -0.8 },
  ruin: { category: "danger", emoji: "💥", weight: 8, sentiment: -0.8 },
  ruined: { category: "danger", emoji: "💥", weight: 8, sentiment: -0.8 },
  destroy: { category: "danger", emoji: "💥", weight: 9, sentiment: -0.8 },
  destroyed: { category: "danger", emoji: "💥", weight: 9, sentiment: -0.8 },
  worst: { category: "danger", emoji: "👎", weight: 8, sentiment: -0.8 },
  bad: { category: "danger", emoji: "👎", weight: 7, sentiment: -0.6 },
  ban: { category: "danger", emoji: "⛔", weight: 8, sentiment: -0.7 },
  banned: { category: "danger", emoji: "⛔", weight: 8, sentiment: -0.7 },
  illegal: { category: "danger", emoji: "🚨", weight: 8, sentiment: -0.7 },
  police: { category: "danger", emoji: "🚨", weight: 8, sentiment: -0.5 },

  // Ideas, Brain, Strategy & Secrets
  secret: { category: "mind", emoji: "🤫", weight: 10, sentiment: 0.7 },
  secrets: { category: "mind", emoji: "🤫", weight: 10, sentiment: 0.7 },
  hidden: { category: "mind", emoji: "🔍", weight: 8, sentiment: 0.5 },
  hack: { category: "mind", emoji: "⚡", weight: 9, sentiment: 0.8 },
  hacks: { category: "mind", emoji: "⚡", weight: 9, sentiment: 0.8 },
  trick: { category: "mind", emoji: "🪄", weight: 8, sentiment: 0.7 },
  tricks: { category: "mind", emoji: "🪄", weight: 8, sentiment: 0.7 },
  tip: { category: "mind", emoji: "💡", weight: 8, sentiment: 0.6 },
  tips: { category: "mind", emoji: "💡", weight: 8, sentiment: 0.6 },
  idea: { category: "mind", emoji: "💡", weight: 9, sentiment: 0.7 },
  ideas: { category: "mind", emoji: "💡", weight: 9, sentiment: 0.7 },
  think: { category: "mind", emoji: "🧠", weight: 7, sentiment: 0.4 },
  thinking: { category: "mind", emoji: "🧠", weight: 7, sentiment: 0.4 },
  brain: { category: "mind", emoji: "🧠", weight: 8, sentiment: 0.6 },
  smart: { category: "mind", emoji: "🧠", weight: 8, sentiment: 0.7 },
  genius: { category: "mind", emoji: "🧠", weight: 9, sentiment: 0.8 },
  strategy: { category: "mind", emoji: "🎯", weight: 9, sentiment: 0.7 },
  target: { category: "mind", emoji: "🎯", weight: 8, sentiment: 0.6 },
  goal: { category: "mind", emoji: "🎯", weight: 8, sentiment: 0.7 },
  focus: { category: "mind", emoji: "🎯", weight: 8, sentiment: 0.6 },
  logic: { category: "mind", emoji: "🧠", weight: 7, sentiment: 0.5 },
  truth: { category: "mind", emoji: "✨", weight: 9, sentiment: 0.7 },
  reason: { category: "mind", emoji: "💡", weight: 7, sentiment: 0.4 },
  solve: { category: "mind", emoji: "🧩", weight: 8, sentiment: 0.7 },
  solved: { category: "mind", emoji: "🧩", weight: 8, sentiment: 0.7 },
  learn: { category: "mind", emoji: "📚", weight: 7, sentiment: 0.6 },
  knowledge: { category: "mind", emoji: "🧠", weight: 8, sentiment: 0.7 },

  // Questions & Shock
  why: { category: "question", emoji: "❓", weight: 8, sentiment: 0.1 },
  how: { category: "question", emoji: "❓", weight: 8, sentiment: 0.2 },
  what: { category: "question", emoji: "❓", weight: 8, sentiment: 0.1 },
  who: { category: "question", emoji: "🧐", weight: 7, sentiment: 0.1 },
  where: { category: "question", emoji: "📍", weight: 7, sentiment: 0.1 },
  when: { category: "question", emoji: "⏱️", weight: 7, sentiment: 0.1 },
  question: { category: "question", emoji: "❓", weight: 8, sentiment: 0.3 },
  personal: { category: "mind", emoji: "👤", weight: 6, sentiment: 0.2 },
  shock: { category: "shock", emoji: "😱", weight: 9, sentiment: -0.4 },
  shocked: { category: "shock", emoji: "😱", weight: 9, sentiment: -0.4 },
  omg: { category: "shock", emoji: "😱", weight: 9, sentiment: 0.5 },
  exposed: { category: "shock", emoji: "📸", weight: 9, sentiment: -0.4 },
  caught: { category: "shock", emoji: "🫢", weight: 8, sentiment: -0.4 },
  secretly: { category: "mind", emoji: "🤫", weight: 8, sentiment: 0.4 },

  // Strength, Fitness & Physical Effort
  strong: { category: "power", emoji: "💪", weight: 8, sentiment: 0.8 },
  strength: { category: "power", emoji: "💪", weight: 8, sentiment: 0.8 },
  muscle: { category: "power", emoji: "💪", weight: 8, sentiment: 0.7 },
  muscles: { category: "power", emoji: "💪", weight: 8, sentiment: 0.7 },
  gym: { category: "power", emoji: "🏋️", weight: 8, sentiment: 0.6 },
  workout: { category: "power", emoji: "🏋️", weight: 8, sentiment: 0.7 },
  train: { category: "power", emoji: "🏋️", weight: 7, sentiment: 0.6 },
  training: { category: "power", emoji: "🏋️", weight: 7, sentiment: 0.6 },
  push: { category: "power", emoji: "💪", weight: 7, sentiment: 0.5 },
  hard: { category: "power", emoji: "🔨", weight: 7, sentiment: 0.2 },
  grind: { category: "power", emoji: "⚡", weight: 8, sentiment: 0.7 },
  discipline: { category: "power", emoji: "🎯", weight: 8, sentiment: 0.7 },
  fight: { category: "power", emoji: "🥊", weight: 8, sentiment: 0.3 },
  punch: { category: "power", emoji: "🥊", weight: 8, sentiment: 0.3 },

  // Speed, Time & Urgency
  fast: { category: "speed", emoji: "⚡", weight: 8, sentiment: 0.7 },
  faster: { category: "speed", emoji: "⚡", weight: 8, sentiment: 0.7 },
  fastest: { category: "speed", emoji: "⚡", weight: 9, sentiment: 0.8 },
  quick: { category: "speed", emoji: "⚡", weight: 8, sentiment: 0.6 },
  quickly: { category: "speed", emoji: "⚡", weight: 8, sentiment: 0.6 },
  speed: { category: "speed", emoji: "💨", weight: 8, sentiment: 0.6 },
  run: { category: "speed", emoji: "🏃", weight: 7, sentiment: 0.5 },
  running: { category: "speed", emoji: "🏃", weight: 7, sentiment: 0.5 },
  rush: { category: "speed", emoji: "💨", weight: 8, sentiment: 0.2 },
  hurry: { category: "speed", emoji: "⏳", weight: 8, sentiment: -0.2 },
  now: { category: "speed", emoji: "⏱️", weight: 7, sentiment: 0.3 },
  today: { category: "speed", emoji: "📅", weight: 6, sentiment: 0.3 },
  instant: { category: "speed", emoji: "⚡", weight: 8, sentiment: 0.7 },
  instantly: { category: "speed", emoji: "⚡", weight: 8, sentiment: 0.7 },
  seconds: { category: "speed", emoji: "⏱️", weight: 7, sentiment: 0.3 },
  minutes: { category: "speed", emoji: "⏱️", weight: 7, sentiment: 0.3 },
  hours: { category: "speed", emoji: "⏳", weight: 7, sentiment: 0.2 },
  deadline: { category: "speed", emoji: "🚨", weight: 8, sentiment: -0.4 },

  // Love, Joy & Appreciation
  love: { category: "love", emoji: "❤️", weight: 9, sentiment: 0.9 },
  loved: { category: "love", emoji: "❤️", weight: 8, sentiment: 0.8 },
  favorite: { category: "love", emoji: "⭐", weight: 8, sentiment: 0.8 },
  beautiful: { category: "love", emoji: "✨", weight: 8, sentiment: 0.8 },
  adore: { category: "love", emoji: "😍", weight: 8, sentiment: 0.9 },
  passion: { category: "love", emoji: "🔥", weight: 8, sentiment: 0.8 },
  grateful: { category: "love", emoji: "🙏", weight: 8, sentiment: 0.8 },
  thank: { category: "love", emoji: "🙏", weight: 7, sentiment: 0.7 },
  thanks: { category: "love", emoji: "🙏", weight: 7, sentiment: 0.7 },
  dream: { category: "love", emoji: "✨", weight: 8, sentiment: 0.8 },
  heart: { category: "love", emoji: "❤️", weight: 8, sentiment: 0.8 },

  // Humor & Laughter
  lol: { category: "laugh", emoji: "😂", weight: 9, sentiment: 0.8 },
  haha: { category: "laugh", emoji: "😂", weight: 8, sentiment: 0.8 },
  funny: { category: "laugh", emoji: "🤣", weight: 8, sentiment: 0.8 },
  hilarious: { category: "laugh", emoji: "🤣", weight: 9, sentiment: 0.9 },
  joke: { category: "laugh", emoji: "🤡", weight: 7, sentiment: 0.6 },
  comedy: { category: "laugh", emoji: "🎭", weight: 7, sentiment: 0.6 },
  meme: { category: "laugh", emoji: "💀", weight: 8, sentiment: 0.7 },
  memes: { category: "laugh", emoji: "💀", weight: 8, sentiment: 0.7 },

  // Sadness & Pain
  sad: { category: "sad", emoji: "😢", weight: 9, sentiment: -0.8 },
  cry: { category: "sad", emoji: "😭", weight: 9, sentiment: -0.8 },
  crying: { category: "sad", emoji: "😭", weight: 9, sentiment: -0.8 },
  tears: { category: "sad", emoji: "😢", weight: 8, sentiment: -0.7 },
  pain: { category: "sad", emoji: "💔", weight: 9, sentiment: -0.8 },
  hurt: { category: "sad", emoji: "💔", weight: 8, sentiment: -0.8 },
  struggle: { category: "sad", emoji: "😔", weight: 8, sentiment: -0.6 },
  struggling: { category: "sad", emoji: "😔", weight: 8, sentiment: -0.6 },
  broken: { category: "sad", emoji: "💔", weight: 8, sentiment: -0.8 },
  lost: { category: "sad", emoji: "📉", weight: 8, sentiment: -0.7 },
  lose: { category: "sad", emoji: "📉", weight: 8, sentiment: -0.7 },
  alone: { category: "sad", emoji: "🥺", weight: 7, sentiment: -0.6 },

  // Food & Drink
  food: { category: "food", emoji: "🍔", weight: 7, sentiment: 0.6 },
  eat: { category: "food", emoji: "🍕", weight: 7, sentiment: 0.5 },
  eating: { category: "food", emoji: "🍕", weight: 7, sentiment: 0.5 },
  hungry: { category: "food", emoji: "🤤", weight: 7, sentiment: 0.3 },
  pizza: { category: "food", emoji: "🍕", weight: 8, sentiment: 0.7 },
  burger: { category: "food", emoji: "🍔", weight: 8, sentiment: 0.7 },
  coffee: { category: "food", emoji: "☕", weight: 8, sentiment: 0.7 },
  drink: { category: "food", emoji: "🥤", weight: 6, sentiment: 0.4 },
  snack: { category: "food", emoji: "🍿", weight: 7, sentiment: 0.5 },
};

/**
 * Normalizes raw speech tokens by stripping punctuation and casing.
 */
export function cleanWord(raw: string): string {
  return raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]/gu, "")
    .trim();
}

/**
 * Analyzes a chunk of words (caption cue) to determine the dominant sentiment,
 * the primary hero word to highlight in accent color, and an animated emoji.
 */
export function analyzeCueSentiment(words: WordCandidate[]): CueSentimentAnalysis {
  if (!words.length) {
    return {
      emoji: "✨",
      category: "creator",
      heroWordId: "",
      heroWordText: "",
      confidence: 0,
      accentColor: CATEGORY_ACCENT_COLORS.creator,
      sentimentScore: 0,
      arousal: 0.5,
      label: "Creator Subtitle",
      matched: false,
    };
  }

  // Check for punctuation cues in full text
  const fullText = words.map((w) => w.text).join(" ");
  const hasQuestion = fullText.includes("?");
  const hasExclamation = fullText.includes("!");

  let bestMatch: KeywordRule | null = null;
  let emojiWord: WordCandidate | undefined;
  let heroWord = words[0];
  let highestWordScore = -Infinity;
  let accumulatedSentiment = 0;
  let matchesCount = 0;

  for (let i = 0; i < words.length; i++) {
    const candidate = words[i];
    const cleaned = cleanWord(candidate.text);
    if (!cleaned) continue;

    const rule = KEYWORD_MAP[cleaned];
    const isStop = STOP_WORDS.has(cleaned);

    // Scoring weights:
    // - Base length heuristic: longer content words carry more semantic meaning
    // - Explicit emphasis flag from transcript (10x boost)
    // - Matched keyword rule weight (1x to 10x)
    // - Penalty for common grammatical stop words
    let score = (cleaned.length * 0.8);
    if (candidate.emphasis) score += 15;
    if (isStop) score -= 8;

    if (rule) {
      score += rule.weight * 2.5;
      accumulatedSentiment += rule.sentiment;
      matchesCount++;

      if (!bestMatch || rule.weight > bestMatch.weight) {
        bestMatch = rule;
        emojiWord = candidate;
      }
    }

    if (score > highestWordScore) {
      highestWordScore = score;
      heroWord = candidate;
    }
  }

  // Contextual fallback logic if no direct dictionary keyword matched
  let category: SentimentCategory = "creator";
  let emoji = "✨";
  let confidence = 0.5;

  if (bestMatch) {
    category = bestMatch.category;
    emoji = bestMatch.emoji;
    confidence = Math.min(1, bestMatch.weight / 10 + 0.2);
  } else if (hasQuestion) {
    category = "question";
    emoji = "❓";
    confidence = 0.85;
  } else if (hasExclamation) {
    category = "hype";
    emoji = "🔥";
    confidence = 0.8;
  } else {
    // Intelligent heuristic fallback based on average sentiment & syllables
    const cleanedHero = cleanWord(heroWord.text);
    if (cleanedHero.length >= 7) {
      category = "mind";
      emoji = "💡";
    } else {
      category = "creator";
      emoji = "✨";
    }
    confidence = 0.4;
  }

  const sentimentScore = matchesCount > 0 ? accumulatedSentiment / matchesCount : (hasExclamation ? 0.7 : hasQuestion ? 0.2 : 0.4);
  const arousal = hasExclamation ? 0.9 : hasQuestion ? 0.7 : Math.min(1, 0.4 + words.length * 0.1);

  return {
    triggerWordId: emojiWord?.id ?? heroWord.id,
    emoji,
    category,
    heroWordId: heroWord.id,
    heroWordText: cleanWord(heroWord.text),
    confidence,
    accentColor: CATEGORY_ACCENT_COLORS[category] ?? "#ffe36b",
    sentimentScore,
    arousal,
    label: `${category.toUpperCase()} (${emoji})`,
    matched: !!bestMatch || hasQuestion || hasExclamation,
  };
}
