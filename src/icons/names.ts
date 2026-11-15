// The Icon set (spec 2026-11-11, ticket A1a, ADR 0015): every picture name a Topic file or the Tutor may use, and the
// lucide-react 1.71.0 drawing that shows it. The 161 old emoji names keep their alt and keywords from the emoji
// registry, in its order; exchange, ranking, formula, story, lingo and widget name the Widget kinds.
// Pure and self-contained (no module dependencies at all), so `scripts/check-course.mjs` runs it under plain Node.
// `src/icons/icon.tsx` maps each drawing to its Lucide component.

export type IconEntry = { readonly drawing: string; readonly alt: string; readonly keywords: readonly string[] };

/** name -> { drawing, alt, keywords[] }. `drawing` is a Lucide icon's kebab name; `alt` is 1 to 4 plain words ("money bag"). */
export const ICON_SET = {
  "person": { drawing: "user-round", alt: "person", keywords: ["person", "adult", "gender-neutral", "unspecified gender"] },
  "man": { drawing: "user-round", alt: "man", keywords: ["man", "adult"] },
  "woman": { drawing: "user-round", alt: "woman", keywords: ["woman", "adult"] },
  "older-person": { drawing: "user-round", alt: "older person", keywords: ["older", "person", "adult", "gender-neutral", "old", "older person", "unspecified gender"] },
  "old-man": { drawing: "user-round", alt: "old man", keywords: ["old", "man", "adult"] },
  "old-woman": { drawing: "user-round", alt: "old woman", keywords: ["old", "woman", "adult"] },
  "office-worker": { drawing: "user-round", alt: "office worker", keywords: ["office", "worker", "architect", "business", "manager", "office worker", "white-collar"] },
  "man-office-worker": { drawing: "user-round", alt: "man office worker", keywords: ["man", "office", "worker", "architect", "business", "man office worker", "manager", "white-collar"] },
  "woman-office-worker": { drawing: "user-round", alt: "woman office worker", keywords: ["woman", "office", "worker", "architect", "business", "manager", "white-collar", "woman office worker"] },
  "technologist": { drawing: "laptop", alt: "technologist", keywords: ["technologist", "coder", "developer", "inventor", "software"] },
  "judge": { drawing: "gavel", alt: "judge", keywords: ["judge", "justice", "scales"] },
  "police-officer": { drawing: "shield-user", alt: "police officer", keywords: ["police", "officer", "cop"] },
  "detective": { drawing: "user-search", alt: "detective", keywords: ["detective", "sleuth", "spy"] },
  "guard": { drawing: "shield", alt: "guard", keywords: ["guard"] },
  "farmer": { drawing: "tractor", alt: "farmer", keywords: ["farmer", "gardener", "rancher"] },
  "cook": { drawing: "chef-hat", alt: "cook", keywords: ["cook", "chef"] },
  "factory-worker": { drawing: "hard-hat", alt: "factory worker", keywords: ["factory", "worker", "assembly", "industrial"] },
  "construction-worker": { drawing: "hard-hat", alt: "construction worker", keywords: ["construction", "worker", "hat"] },
  "scientist": { drawing: "microscope", alt: "scientist", keywords: ["scientist", "biologist", "chemist", "engineer", "physicist"] },
  "teacher": { drawing: "school", alt: "teacher", keywords: ["teacher", "instructor", "professor"] },
  "student": { drawing: "graduation-cap", alt: "student", keywords: ["student", "graduate"] },
  "person-raising-hand": { drawing: "hand", alt: "person raising hand", keywords: ["person", "raising", "hand", "gesture", "happy", "person raising hand", "raised"] },
  "person-shrugging": { drawing: "circle-question-mark", alt: "person shrugging", keywords: ["person", "shrugging", "doubt", "ignorance", "indifference", "person shrugging", "shrug"] },
  "person-facepalming": { drawing: "face-expressionless", alt: "person facepalming", keywords: ["person", "facepalming", "disbelief", "exasperation", "face", "palm", "person facepalming"] },
  "grinning-face": { drawing: "face-grinning", alt: "grinning face", keywords: ["grinning", "face", "grin", "grinning face"] },
  "slightly-smiling-face": { drawing: "face-slightly-smiling", alt: "slightly smiling face", keywords: ["slightly", "smiling", "face", "slightly smiling face", "smile"] },
  "smiling-face-with-sunglasses": { drawing: "face-grinning", alt: "smiling face with sunglasses", keywords: ["smiling", "face", "with", "sunglasses", "bright", "cool", "smiling face with sunglasses", "sun"] },
  "thinking-face": { drawing: "brain", alt: "thinking face", keywords: ["thinking", "face"] },
  "face-with-monocle": { drawing: "search", alt: "face with monocle", keywords: ["face", "with", "monocle", "face with monocle", "stuffy"] },
  "nerd-face": { drawing: "glasses", alt: "nerd face", keywords: ["nerd", "face", "geek"] },
  "star-struck": { drawing: "star", alt: "star-struck", keywords: ["star", "struck", "eyes", "face", "grinning", "star-struck"] },
  "money-mouth-face": { drawing: "circle-dollar-sign", alt: "money-mouth face", keywords: ["money", "mouth", "face", "money-mouth face", "money-mouth"] },
  "partying-face": { drawing: "party-popper", alt: "partying face", keywords: ["partying", "face", "celebration", "hat", "horn", "party", "partying face"] },
  "exploding-head": { drawing: "zap", alt: "exploding head", keywords: ["exploding", "head", "exploding head", "mind blown", "shocked"] },
  "face-screaming-in-fear": { drawing: "siren", alt: "face screaming in fear", keywords: ["face", "screaming", "in", "fear", "face screaming in fear", "munch", "scared", "scream"] },
  "anxious-face-with-sweat": { drawing: "face-slightly-frowning", alt: "anxious face with sweat", keywords: ["anxious", "face", "with", "sweat", "anxious face with sweat", "blue", "cold", "rushed"] },
  "worried-face": { drawing: "face-slightly-frowning", alt: "worried face", keywords: ["worried", "face"] },
  "astonished-face": { drawing: "circle-exclamation-point", alt: "astonished face", keywords: ["astonished", "face", "shocked", "totally"] },
  "hushed-face": { drawing: "face-neutral", alt: "hushed face", keywords: ["hushed", "face", "stunned", "surprised"] },
  "face-with-rolling-eyes": { drawing: "face-expressionless", alt: "face with rolling eyes", keywords: ["face", "with", "rolling", "eyes", "eyeroll", "face with rolling eyes"] },
  "shushing-face": { drawing: "message-circle-off", alt: "shushing face", keywords: ["shushing", "face", "quiet", "shush", "shushing face"] },
  "zipper-mouth-face": { drawing: "message-circle-off", alt: "zipper-mouth face", keywords: ["zipper", "mouth", "face", "zipper-mouth face", "zipper-mouth"] },
  "neutral-face": { drawing: "face-neutral", alt: "neutral face", keywords: ["neutral", "face", "deadpan", "meh"] },
  "yawning-face": { drawing: "face-expressionless", alt: "yawning face", keywords: ["yawning", "face", "bored", "tired", "yawn", "yawning face"] },
  "ox": { drawing: "trending-up", alt: "ox", keywords: ["ox", "bull", "taurus", "zodiac"] },
  "bear": { drawing: "trending-down", alt: "bear", keywords: ["bear", "face"] },
  "turtle": { drawing: "turtle", alt: "turtle", keywords: ["turtle", "terrapin", "tortoise"] },
  "snail": { drawing: "snail", alt: "snail", keywords: ["snail"] },
  "rabbit-face": { drawing: "rabbit", alt: "rabbit face", keywords: ["rabbit", "face", "bunny", "pet"] },
  "shark": { drawing: "fish", alt: "shark", keywords: ["shark", "fish"] },
  "owl": { drawing: "bird", alt: "owl", keywords: ["owl", "bird", "wise"] },
  "unicorn": { drawing: "sparkles", alt: "unicorn", keywords: ["unicorn", "face"] },
  "money-bag": { drawing: "wallet", alt: "money bag", keywords: ["money", "bag", "dollar", "moneybag"] },
  "coin": { drawing: "coins", alt: "coin", keywords: ["coin", "gold", "metal", "money", "silver", "treasure"] },
  "dollar-banknote": { drawing: "banknote", alt: "dollar banknote", keywords: ["dollar", "banknote", "bill", "currency", "money", "note"] },
  "euro-banknote": { drawing: "euro", alt: "euro banknote", keywords: ["euro", "banknote", "bill", "currency", "money", "note"] },
  "pound-banknote": { drawing: "pound-sterling", alt: "pound banknote", keywords: ["pound", "banknote", "bill", "currency", "money", "note"] },
  "yen-banknote": { drawing: "japanese-yen", alt: "yen banknote", keywords: ["yen", "banknote", "bill", "currency", "money", "note"] },
  "money-with-wings": { drawing: "banknote-arrow-up", alt: "money with wings", keywords: ["money", "with", "wings", "banknote", "bill", "fly", "money with wings"] },
  "credit-card": { drawing: "credit-card", alt: "credit card", keywords: ["credit", "card", "money"] },
  "receipt": { drawing: "receipt", alt: "receipt", keywords: ["receipt", "accounting", "bookkeeping", "evidence", "proof"] },
  "bank": { drawing: "landmark", alt: "bank", keywords: ["bank", "building"] },
  "chart-increasing": { drawing: "trending-up", alt: "chart increasing", keywords: ["chart", "increasing", "chart increasing", "graph", "growth", "trend", "upward"] },
  "chart-decreasing": { drawing: "trending-down", alt: "chart decreasing", keywords: ["chart", "decreasing", "chart decreasing", "down", "graph", "trend"] },
  "chart-increasing-with-yen": { drawing: "chart-line", alt: "rising yen chart", keywords: ["chart", "increasing", "with", "yen", "chart increasing with yen", "graph", "growth", "money", "rising"] },
  "bar-chart": { drawing: "chart-column", alt: "bar chart", keywords: ["bar", "chart", "graph"] },
  "ledger": { drawing: "notebook-text", alt: "ledger", keywords: ["ledger", "notebook"] },
  "notebook": { drawing: "notebook", alt: "notebook", keywords: ["notebook"] },
  "scroll": { drawing: "scroll-text", alt: "scroll", keywords: ["scroll", "paper"] },
  "gem-stone": { drawing: "gem", alt: "gem stone", keywords: ["gem", "stone", "diamond", "gem stone", "jewel"] },
  "balance-scale": { drawing: "scale", alt: "balance scale", keywords: ["balance", "scale", "justice", "libra", "zodiac"] },
  "briefcase": { drawing: "briefcase", alt: "briefcase", keywords: ["briefcase"] },
  "identification-card": { drawing: "id-card", alt: "identification card", keywords: ["identification", "card", "credentials", "id", "identification card", "license", "security"] },
  "label": { drawing: "tag", alt: "label", keywords: ["label"] },
  "classical-building": { drawing: "landmark", alt: "classical building", keywords: ["classical", "building", "classical building"] },
  "office-building": { drawing: "building", alt: "office building", keywords: ["office", "building", "office building"] },
  "house": { drawing: "house", alt: "house", keywords: ["house", "home"] },
  "houses": { drawing: "houses", alt: "houses", keywords: ["houses"] },
  "derelict-house": { drawing: "house", alt: "derelict house", keywords: ["derelict", "house"] },
  "factory": { drawing: "factory", alt: "factory", keywords: ["factory", "building"] },
  "department-store": { drawing: "store", alt: "department store", keywords: ["department", "store"] },
  "convenience-store": { drawing: "store", alt: "convenience store", keywords: ["convenience", "store"] },
  "building-construction": { drawing: "construction", alt: "building construction", keywords: ["building", "construction", "building construction"] },
  "stadium": { drawing: "users", alt: "stadium", keywords: ["stadium"] },
  "cityscape": { drawing: "building-complex", alt: "cityscape", keywords: ["cityscape", "city"] },
  "globe-showing-americas": { drawing: "earth", alt: "globe showing americas", keywords: ["globe", "showing", "americas", "earth", "globe showing americas", "world"] },
  "globe-showing-asia-australia": { drawing: "earth", alt: "globe showing asia-australia", keywords: ["globe", "showing", "asia", "australia", "earth", "globe showing asia-australia", "world", "asia-australia"] },
  "globe-showing-europe-africa": { drawing: "earth", alt: "globe showing europe-africa", keywords: ["globe", "showing", "europe", "africa", "earth", "globe showing europe-africa", "world", "europe-africa"] },
  "world-map": { drawing: "map", alt: "world map", keywords: ["world", "map"] },
  "newspaper": { drawing: "newspaper", alt: "newspaper", keywords: ["newspaper", "news", "paper"] },
  "rolled-up-newspaper": { drawing: "newspaper", alt: "rolled-up newspaper", keywords: ["rolled", "up", "newspaper", "news", "paper", "rolled-up newspaper", "rolled-up"] },
  "megaphone": { drawing: "megaphone", alt: "megaphone", keywords: ["megaphone", "cheering"] },
  "loudspeaker": { drawing: "volume-2", alt: "loudspeaker", keywords: ["loudspeaker", "loud", "public address"] },
  "telephone-receiver": { drawing: "phone", alt: "telephone receiver", keywords: ["telephone", "receiver", "phone"] },
  "mobile-phone": { drawing: "smartphone", alt: "mobile phone", keywords: ["mobile", "phone", "cell", "telephone"] },
  "laptop": { drawing: "laptop", alt: "laptop", keywords: ["laptop", "computer", "pc", "personal"] },
  "envelope": { drawing: "mail", alt: "envelope", keywords: ["envelope", "email", "letter"] },
  "memo": { drawing: "notepad-text", alt: "memo", keywords: ["memo", "pencil"] },
  "clipboard": { drawing: "clipboard-list", alt: "clipboard", keywords: ["clipboard"] },
  "calendar": { drawing: "calendar", alt: "calendar", keywords: ["calendar", "date"] },
  "spiral-calendar": { drawing: "calendar-days", alt: "spiral calendar", keywords: ["spiral", "calendar", "pad"] },
  "tear-off-calendar": { drawing: "calendar-1", alt: "tear-off calendar", keywords: ["tear", "off", "calendar", "tear-off calendar", "tear-off"] },
  "hourglass-done": { drawing: "hourglass", alt: "hourglass done", keywords: ["hourglass", "done", "hourglass done", "sand", "timer"] },
  "hourglass-not-done": { drawing: "hourglass", alt: "hourglass not done", keywords: ["hourglass", "not", "done", "hourglass not done", "sand", "timer"] },
  "alarm-clock": { drawing: "alarm-clock", alt: "alarm clock", keywords: ["alarm", "clock"] },
  "stopwatch": { drawing: "timer", alt: "stopwatch", keywords: ["stopwatch", "clock"] },
  "key": { drawing: "key-round", alt: "key", keywords: ["key", "lock", "password"] },
  "old-key": { drawing: "key", alt: "old key", keywords: ["old", "key", "clue", "lock"] },
  "locked": { drawing: "lock", alt: "locked", keywords: ["locked", "closed"] },
  "unlocked": { drawing: "lock-open", alt: "unlocked", keywords: ["unlocked", "lock", "open", "unlock"] },
  "package": { drawing: "package", alt: "package", keywords: ["package", "box", "parcel"] },
  "delivery-truck": { drawing: "truck", alt: "delivery truck", keywords: ["delivery", "truck"] },
  "shopping-cart": { drawing: "shopping-cart", alt: "shopping cart", keywords: ["shopping", "cart", "trolley"] },
  "shopping-bags": { drawing: "shopping-bag", alt: "shopping bags", keywords: ["shopping", "bags", "bag", "hotel", "shopping bags"] },
  "ticket": { drawing: "ticket", alt: "ticket", keywords: ["ticket", "admission"] },
  "light-bulb": { drawing: "lightbulb", alt: "light bulb", keywords: ["light", "bulb", "comic", "electric", "idea"] },
  "magnifying-glass-tilted-left": { drawing: "search", alt: "magnifying glass tilted left", keywords: ["magnifying", "glass", "tilted", "left", "magnifying glass tilted left", "search", "tool"] },
  "eyes": { drawing: "eye", alt: "eyes", keywords: ["eyes", "eye", "face"] },
  "direct-hit": { drawing: "target", alt: "bullseye", keywords: ["direct", "hit", "bullseye", "dart", "direct hit", "game", "target"] },
  "game-die": { drawing: "dices", alt: "game die", keywords: ["game", "die", "dice"] },
  "slot-machine": { drawing: "dices", alt: "slot machine", keywords: ["slot", "machine", "game", "slot machine"] },
  "trophy": { drawing: "trophy", alt: "trophy", keywords: ["trophy", "prize"] },
  "party-popper": { drawing: "party-popper", alt: "party popper", keywords: ["party", "popper", "celebration", "tada"] },
  "wrapped-gift": { drawing: "gift", alt: "wrapped gift", keywords: ["wrapped", "gift", "box", "celebration", "present"] },
  "rocket": { drawing: "rocket", alt: "rocket", keywords: ["rocket", "space"] },
  "airplane": { drawing: "plane", alt: "airplane", keywords: ["airplane", "aeroplane"] },
  "ship": { drawing: "ship", alt: "ship", keywords: ["ship", "boat", "passenger"] },
  "fuel-pump": { drawing: "fuel", alt: "fuel pump", keywords: ["fuel", "pump", "diesel", "fuelpump", "gas", "station"] },
  "oil-drum": { drawing: "fuel", alt: "oil drum", keywords: ["oil", "drum"] },
  "hammer-and-wrench": { drawing: "wrench", alt: "hammer and wrench", keywords: ["hammer", "and", "wrench", "hammer and wrench", "spanner", "tool"] },
  "gear": { drawing: "cog", alt: "gear", keywords: ["gear", "cog", "cogwheel", "tool"] },
  "battery": { drawing: "battery-full", alt: "battery", keywords: ["battery"] },
  "low-battery": { drawing: "battery-low", alt: "low battery", keywords: ["low", "battery", "electronic", "low battery", "low energy"] },
  "link": { drawing: "link", alt: "link", keywords: ["link"] },
  "chains": { drawing: "link-2", alt: "chains", keywords: ["chains", "chain"] },
  "puzzle-piece": { drawing: "puzzle", alt: "puzzle piece", keywords: ["puzzle", "piece", "clue", "interlocking", "jigsaw"] },
  "bomb": { drawing: "bomb", alt: "bomb", keywords: ["bomb", "comic"] },
  "fire": { drawing: "flame", alt: "fire", keywords: ["fire", "flame", "tool"] },
  "hot-beverage": { drawing: "coffee", alt: "hot beverage", keywords: ["hot", "beverage", "coffee", "drink", "steaming", "tea"] },
  "droplet": { drawing: "droplet", alt: "droplet", keywords: ["droplet", "cold", "comic", "drop", "sweat"] },
  "snowflake": { drawing: "snowflake", alt: "snowflake", keywords: ["snowflake", "cold", "snow"] },
  "umbrella-with-rain-drops": { drawing: "umbrella", alt: "umbrella with rain drops", keywords: ["umbrella", "with", "rain", "drops", "clothing", "drop", "umbrella with rain drops"] },
  "cloud-with-lightning": { drawing: "cloud-lightning", alt: "cloud with lightning", keywords: ["cloud", "with", "lightning", "cloud with lightning"] },
  "tornado": { drawing: "tornado", alt: "tornado", keywords: ["tornado", "cloud", "whirlwind"] },
  "sun": { drawing: "sun", alt: "sun", keywords: ["sun", "bright", "rays", "sunny"] },
  "rainbow": { drawing: "rainbow", alt: "rainbow", keywords: ["rainbow", "rain"] },
  "seedling": { drawing: "sprout", alt: "seedling", keywords: ["seedling", "young"] },
  "deciduous-tree": { drawing: "tree-deciduous", alt: "deciduous tree", keywords: ["deciduous", "tree", "shedding"] },
  "hatching-chick": { drawing: "egg", alt: "hatching chick", keywords: ["hatching", "chick", "baby", "bird"] },
  "warning": { drawing: "triangle-exclamation-point", alt: "warning", keywords: ["warning"] },
  "no-entry": { drawing: "ban", alt: "no entry", keywords: ["no", "entry", "forbidden", "not", "prohibited", "traffic"] },
  "stop-sign": { drawing: "octagon-x", alt: "stop sign", keywords: ["stop", "sign", "octagonal"] },
  "check-mark-button": { drawing: "circle-check", alt: "check mark button", keywords: ["check", "mark", "button"] },
  "cross-mark": { drawing: "circle-x", alt: "cross mark", keywords: ["cross", "mark", "cancel", "multiplication", "multiply"] },
  "red-question-mark": { drawing: "circle-question-mark", alt: "red question mark", keywords: ["red", "question", "mark", "punctuation", "red question mark"] },
  "red-exclamation-mark": { drawing: "circle-exclamation-point", alt: "red exclamation mark", keywords: ["red", "exclamation", "mark", "punctuation", "red exclamation mark"] },
  "high-voltage": { drawing: "zap", alt: "high voltage", keywords: ["high", "voltage", "danger", "electric", "high voltage", "lightning", "zap"] },
  "sparkles": { drawing: "sparkles", alt: "sparkles", keywords: ["sparkles", "sparkle", "star"] },
  "speech-balloon": { drawing: "message-circle", alt: "speech balloon", keywords: ["speech", "balloon", "bubble", "comic", "dialog"] },
  "thought-balloon": { drawing: "message-circle-more", alt: "thought balloon", keywords: ["thought", "balloon", "bubble", "comic"] },
  "crown": { drawing: "crown", alt: "crown", keywords: ["crown", "clothing", "king", "queen"] },
  "exchange": { drawing: "arrow-right-left", alt: "exchange", keywords: ["exchange", "convert"] },
  "ranking": { drawing: "list-ordered", alt: "ranking", keywords: ["ranking", "rank"] },
  "formula": { drawing: "sigma", alt: "formula", keywords: ["formula", "equation"] },
  "story": { drawing: "book-open", alt: "story", keywords: ["story"] },
  "lingo": { drawing: "book-a", alt: "lingo", keywords: ["lingo", "jargon", "term"] },
  "widget": { drawing: "shapes", alt: "widget", keywords: ["widget"] },
} as const satisfies Record<string, IconEntry>;

export type IconName = keyof typeof ICON_SET;

/** The Lucide drawings the set uses (134 distinct). */
export type Drawing = (typeof ICON_SET)[IconName]["drawing"];

export const ICON_SET_NAMES = Object.keys(ICON_SET) as IconName[];

export function isIconName(name: string): name is IconName {
  return Object.prototype.hasOwnProperty.call(ICON_SET, name);
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/**
 * The best match for a keyword or short phrase: an exact name wins, then the entry whose keywords match the most of the
 * phrase's words (a word of the name beats another keyword, which beats a shared word start such as "coin" and "coins"), the shorter name on a tie ("money-bag" over "money-mouth-face"), then the earlier entry. Null when nothing matches.
 */
export function iconFor(keyword: string): IconName | null {
  const asked = keyword.trim().toLowerCase();
  if (!asked) return null;
  const direct = asked.replace(/\s+/g, "-");
  if (isIconName(direct)) return direct;
  const wanted = words(asked);
  let best: IconName | null = null;
  let bestScore = 0;
  for (const name of ICON_SET_NAMES) {
    const nameWords = new Set(words(name));
    const own = new Set([...ICON_SET[name].keywords, ...nameWords]);
    let score = 0;
    for (const w of wanted) {
      if (own.has(w)) score += nameWords.has(w) ? 4 : 3;
      else if (w.length > 3 && [...own].some((k) => k.length > 3 && (k.startsWith(w) || w.startsWith(k)))) score += 1;
    }
    if (score > bestScore || (score > 0 && score === bestScore && best && words(name).length < words(best).length)) {
      best = name;
      bestScore = score;
    }
  }
  return best;
}
