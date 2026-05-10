// 5-letter A–Z answers, no proper nouns, no plurals where singular fits.
export const WORDS: string[] = [
  "ABACK", "ABASE", "ABATE", "ABBEY", "ABBOT", "ABLED", "ABODE", "ABORT",
  "ABOUT", "ABOVE", "ABUSE", "ACORN", "ACRID", "ACTOR", "ACUTE", "ADAGE",
  "ADAPT", "ADEPT", "ADMIN", "ADMIT", "ADOPT", "ADORE", "ADORN", "ADULT",
  "AFFIX", "AFOOT", "AFTER", "AGAIN", "AGENT", "AGILE", "AGING", "AGONY",
  "AGREE", "AHEAD", "ALARM", "ALBUM", "ALERT", "ALGAE", "ALIBI", "ALIEN",
  "ALIGN", "ALIKE", "ALIVE", "ALLEY", "ALLOW", "ALLOY", "ALOFT", "ALONE",
  "ALONG", "ALOUD", "ALPHA", "ALTAR", "ALTER", "AMBER", "AMBLE", "AMEND",
  "AMITY", "AMONG", "AMPLE", "ANGEL", "ANGER", "ANGLE", "ANGRY", "ANKLE",
  "ANNEX", "ANNOY", "APART", "APPLE", "APPLY", "APRON", "ARDOR", "ARENA",
  "ARGUE", "ARISE", "ARMOR", "AROMA", "ARRAY", "ARROW", "ARSON", "ARTSY",
  "ASIDE", "ASSAY", "ASSET", "ATLAS", "ATTIC", "AUDIO", "AUDIT", "AVAIL",
  "AVERT", "AVIAN", "AVOID", "AWAKE", "AWARD", "AWARE", "AWFUL", "AWOKE",
  "AXIAL", "AXIOM", "BACON", "BADGE", "BADLY", "BAGEL", "BAKER", "BALMY",
  "BANAL", "BANJO", "BARGE", "BARON", "BASIC", "BASIL", "BASIN", "BASIS",
  "BATCH", "BATHE", "BATON", "BATTY", "BAYOU", "BEACH", "BEADY", "BEARD",
  "BEAST", "BEEFY", "BEFIT", "BEGAN", "BEGET", "BEGIN", "BEGUN", "BEING",
  "BELCH", "BELIE", "BELLE", "BELLY", "BELOW", "BENCH", "BERET", "BERRY",
  "BERTH", "BESET", "BETEL", "BEVEL", "BEZEL", "BIBLE", "BICEP", "BIDDY",
  "BIGOT", "BILGE", "BILLY", "BINGE", "BINGO", "BIOME", "BIRCH", "BIRTH",
  "BISON", "BITTY", "BLACK", "BLADE", "BLAME", "BLAND", "BLANK", "BLARE",
  "BLAST", "BLAZE", "BLEAK", "BLEAT", "BLEED", "BLEEP", "BLEND", "BLESS",
  "BLIMP", "BLIND", "BLINK", "BLISS", "BLOAT", "BLOCK", "BLOKE", "BLOND",
  "BLOOD", "BLOOM", "BLOWN", "BLUER", "BLUFF", "BLUNT", "BLURB", "BLURT",
  "BLUSH", "BOARD", "BOAST", "BOBBY", "BONEY", "BONGO", "BONUS", "BOOBY",
  "BOOST", "BOOTH", "BOOTY", "BOOZE", "BOOZY", "BORAX", "BORNE", "BOSOM",
  "BOSSY", "BOTCH", "BOUGH", "BOULE", "BOUND", "BOWEL", "BOXER", "BRACE",
  "BRAID", "BRAIN", "BRAKE", "BRAND", "BRASH", "BRASS", "BRAVE", "BRAVO",
  "BRAWL", "BRAWN", "BREAD", "BREAK", "BREED", "BRIAR", "BRIBE", "BRICK",
  "BRIDE", "BRIEF", "BRINE", "BRING", "BRINK", "BRINY", "BRISK", "BROAD",
  "BROIL", "BROKE", "BROOD", "BROOK", "BROOM", "BROTH", "BROWN", "BRUNT",
  "BRUSH", "BRUTE", "BUDDY", "BUDGE", "BUGGY", "BUGLE", "BUILD", "BUILT",
  "BULGE", "BULKY", "BULLY",
];

for (const w of WORDS) {
  if (w.length !== 5 || !/^[A-Z]{5}$/.test(w)) {
    throw new Error(`words.ts: bad entry ${JSON.stringify(w)} — must be 5 uppercase A–Z`);
  }
}

export const GUESSES: Set<string> = new Set(WORDS);

export function isAcceptableGuess(s: string): boolean {
  return /^[A-Z]{5}$/.test(s);
}
