const http = require("http");
const fs = require("fs/promises");
const path = require("path");

const PORT = process.env.PORT || 8080;
const RIOT_API_KEY = process.env.RIOT_API_KEY;

const ACCOUNTS_FILE =
  process.env.ACCOUNTS_FILE || path.join(__dirname, "data", "accounts.json");

const BRAVERY_STATE_FILE =
  process.env.BRAVERY_STATE_FILE || path.join(__dirname, "data", "bravery.json");

const FRONTEND_DIR = path.join(__dirname, "frontend");

const DASHBOARD_FILE = path.join(FRONTEND_DIR, "dashboard", "dashboard.html");
const BRAVERY_FILE = path.join(FRONTEND_DIR, "bravery", "bravery.html");

const regionalRoute = {
  euw1: "europe",
  eun1: "europe",
  tr1: "europe",
  ru: "europe",
  na1: "americas",
  br1: "americas",
  la1: "americas",
  la2: "americas",
  oc1: "sea",
  kr: "asia",
  jp1: "asia"
};

const LANE_STARTER_ITEM_NAMES = new Set([
  "Cull",
  "Dark Seal",
  "Doran's Blade",
  "Doran's Bow",
  "Doran's Helm",
  "Doran's Ring",
  "Tear of the Goddess"
]);

const LANE_STARTER_ITEM_IDS = new Set([
  "1083", // Cull
  "1082", // Dark Seal
  "1055", // Doran's Blade
  "1056", // Doran's Ring
  "3070"  // Tear of the Goddess
]);

const JUNGLE_STARTER_ITEM_NAMES = new Set([
  "Gustwalker Hatchling",
  "Mosstomper Seedling",
  "Scorchclaw Pup"
]);

const JUNGLE_STARTER_ITEM_IDS = new Set([
  "1101",
  "1102",
  "1103"
]);

const SUPPORT_FINAL_ITEM_NAMES = new Set([
  "Bloodsong",
  "Celestial Opposition",
  "Dream Maker",
  "Solstice Sleigh",
  "Zaz'Zak's Realmspike",
  "Zaz'Zak's Realm Spike"
]);

const SUPPORT_STARTER_AND_COMPONENT_NAMES = new Set([
  "World Atlas",
  "Runic Compass",
  "Bounty of Worlds"
]);

const BLOCKED_LEGACY_OR_EXTRA_STARTER_NAMES = new Set([
  "Doran's Shield"
]);

const BLOCKED_SPECIAL_ITEM_NAMES = new Set([
  // Arena / Sondermodus
  "Atma's Reckoning",
  "Cruelty",
  "Flesheater",
  "Shield of Molten Stone",
  "Sword of Blossoming Dawn",
  "Demon King's Crown",
  "Force of Entropy",
  "Gambler's Blade",
  "Hemomancer's Helm",
  "Lightning Braid",
  "Moonflair Spellblade",
  "Puppeteer",
  "Reaper's Toll",
  "Runecarver",
  "Turbo Chemtank",
  "Twilight's Edge",
  "Wordless Promise",
  "Veigar's Talisman of Ascension",
  "Cloak of Starry Night",

  // ARAM Guardian Items
  "Guardian's Blade",
  "Guardian's Hammer",
  "Guardian's Horn",
  "Guardian's Orb",

  // Weitere ARAM-/Mode-Items
  "Poro-Snax",
  "The Golden Spatula"
]);

const BLOCKED_BUILD_ITEM_NAMES = new Set([
  ...LANE_STARTER_ITEM_NAMES,
  ...JUNGLE_STARTER_ITEM_NAMES,
  ...SUPPORT_FINAL_ITEM_NAMES,
  ...SUPPORT_STARTER_AND_COMPONENT_NAMES,
  ...BLOCKED_LEGACY_OR_EXTRA_STARTER_NAMES,
  ...BLOCKED_SPECIAL_ITEM_NAMES
]);

const BLOCKED_BUILD_ITEM_IDS = new Set([
  ...LANE_STARTER_ITEM_IDS,
  ...JUNGLE_STARTER_ITEM_IDS,
  "1054", // Doran's Shield, falls im Patch vorhanden
  "3865",
  "3866",
  "3867",
  "3869",
  "3870",
  "3871"
]);

const SUMMONER_SPELLS = [
  { id: "flash", name: "Flash", image: "SummonerFlash.png" },
  { id: "ghost", name: "Ghost", image: "SummonerHaste.png" },
  { id: "ignite", name: "Ignite", image: "SummonerDot.png" },
  { id: "exhaust", name: "Exhaust", image: "SummonerExhaust.png" },
  { id: "heal", name: "Heal", image: "SummonerHeal.png" },
  { id: "barrier", name: "Barrier", image: "SummonerBarrier.png" },
  { id: "cleanse", name: "Cleanse", image: "SummonerBoost.png" },
  { id: "teleport", name: "Teleport", image: "SummonerTeleport.png" },
  { id: "smite", name: "Smite", image: "SummonerSmite.png" }
];

const ITEM_VOTES_PER_PLAYER = 3;
const ITEM_REROLL_VOTE_THRESHOLD = 3;

function getFinalItemCountForRole(role) {
  return role === "adc" ? 7 : 6;
}

async function ensureAccountsFile() {
  await fs.mkdir(path.dirname(ACCOUNTS_FILE), { recursive: true });

  try {
    await fs.access(ACCOUNTS_FILE);
  } catch {
    await fs.writeFile(ACCOUNTS_FILE, "[]", "utf8");
  }
}

async function readAccounts() {
  await ensureAccountsFile();

  try {
    const content = await fs.readFile(ACCOUNTS_FILE, "utf8");
    return JSON.parse(content || "[]");
  } catch {
    await fs.writeFile(ACCOUNTS_FILE, "[]", "utf8");
    return [];
  }
}

async function writeAccounts(accounts) {
  await ensureAccountsFile();
  await fs.writeFile(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), "utf8");
}

async function ensureBraveryStateFile() {
  await fs.mkdir(path.dirname(BRAVERY_STATE_FILE), { recursive: true });

  try {
    await fs.access(BRAVERY_STATE_FILE);
  } catch {
    await writeBraveryState({
      version: null,
      champions: [],
      rolls: {},
      selections: [],
      itemVotes: [],
      resetVotes: [],
      lastItemReroll: null,
      lastPlayerReroll: null,
      createdAt: null,
      updatedAt: null
    });
  }
}

async function readBraveryState() {
  await ensureBraveryStateFile();

  try {
    const content = await fs.readFile(BRAVERY_STATE_FILE, "utf8");
    return JSON.parse(content || "{}");
  } catch {
    return {
      version: null,
      champions: [],
      rolls: {},
      selections: [],
      itemVotes: [],
      resetVotes: [],
      lastItemReroll: null,
      lastPlayerReroll: null,
      createdAt: null,
      updatedAt: null
    };
  }
}

async function writeBraveryState(state) {
  await fs.mkdir(path.dirname(BRAVERY_STATE_FILE), { recursive: true });
  await fs.writeFile(BRAVERY_STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

function getRankScore(entry) {
  const tierBase = {
    IRON: 0,
    BRONZE: 400,
    SILVER: 800,
    GOLD: 1200,
    PLATINUM: 1600,
    EMERALD: 2000,
    DIAMOND: 2400,
    MASTER: 2800,
    GRANDMASTER: 3200,
    CHALLENGER: 3600
  };

  const divisionOffset = {
    IV: 0,
    III: 100,
    II: 200,
    I: 300
  };

  if (!entry) return 0;

  if (["MASTER", "GRANDMASTER", "CHALLENGER"].includes(entry.tier)) {
    return tierBase[entry.tier] + entry.leaguePoints;
  }

  return tierBase[entry.tier] + divisionOffset[entry.rank] + entry.leaguePoints;
}

async function riotFetch(url) {
  console.log("Riot Request:", url);

  if (!RIOT_API_KEY) {
    throw new Error("RIOT_API_KEY fehlt");
  }

  let response;

  try {
    response = await fetch(url, {
      headers: {
        "X-Riot-Token": RIOT_API_KEY
      }
    });
  } catch (error) {
    throw new Error(`Netzwerkfehler beim Riot API Request: ${error.message}`);
  }

  const text = await response.text();

  if (!response.ok) {
    console.error("Riot API Fehler:", response.status, text);

    if (response.status === 404) {
      throw new Error("Account wurde bei Riot nicht gefunden");
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error("Riot API Key ist ungültig oder abgelaufen");
    }

    if (response.status === 429) {
      throw new Error("Riot API Rate Limit erreicht. Bitte später erneut versuchen");
    }

    throw new Error(`Riot API Fehler ${response.status}: ${text}`);
  }

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Ungültige JSON-Antwort von Riot API");
  }
}

async function getAccountRankData(account) {
  const regional = regionalRoute[account.region];

  if (!regional) {
    throw new Error(`Unbekannte Region: ${account.region}`);
  }

  const riotAccount = await riotFetch(
    `https://${regional}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(account.gameName)}/${encodeURIComponent(account.tagLine)}`
  );

  if (!riotAccount || !riotAccount.puuid) {
    throw new Error(`Keine PUUID gefunden für ${account.gameName}#${account.tagLine}`);
  }

  const leagues = await riotFetch(
    `https://${account.region}.api.riotgames.com/lol/league/v4/entries/by-puuid/${riotAccount.puuid}`
  );

  const soloq = Array.isArray(leagues)
    ? leagues.find(entry => entry.queueType === "RANKED_SOLO_5x5")
    : null;

  const flex = Array.isArray(leagues)
    ? leagues.find(entry => entry.queueType === "RANKED_FLEX_SR")
    : null;

  return {
    label: account.label,
    riotId: `${account.gameName}#${account.tagLine}`,
    region: account.region,
    gameName: account.gameName,
    tagLine: account.tagLine,

    soloq: soloq
      ? {
          tier: soloq.tier,
          rank: soloq.rank,
          lp: soloq.leaguePoints,
          wins: soloq.wins,
          losses: soloq.losses,
          score: getRankScore(soloq)
        }
      : {
          tier: "UNRANKED",
          rank: "",
          lp: 0,
          wins: 0,
          losses: 0,
          score: 0
        },

    flex: flex
      ? {
          tier: flex.tier,
          rank: flex.rank,
          lp: flex.leaguePoints,
          wins: flex.wins,
          losses: flex.losses,
          score: getRankScore(flex)
        }
      : {
          tier: "UNRANKED",
          rank: "",
          lp: 0,
          wins: 0,
          losses: 0,
          score: 0
        }
  };
}

async function getAccountsWithRank() {
  const accounts = await readAccounts();
  const result = [];

  for (const account of accounts) {
    try {
      const data = await getAccountRankData(account);

      result.push({
        label: data.label,
        riotId: data.riotId,
        region: data.region,
        gameName: data.gameName,
        tagLine: data.tagLine,

        tier: data.soloq.tier,
        rank: data.soloq.rank,
        lp: data.soloq.lp,
        wins: data.soloq.wins,
        losses: data.soloq.losses,
        score: data.soloq.score,

        flexTier: data.flex.tier,
        flexRank: data.flex.rank,
        flexLp: data.flex.lp,
        flexWins: data.flex.wins,
        flexLosses: data.flex.losses,
        flexScore: data.flex.score,

        error: null
      });
    } catch (error) {
      result.push({
        label: account.label,
        riotId: `${account.gameName}#${account.tagLine}`,
        region: account.region,
        gameName: account.gameName,
        tagLine: account.tagLine,

        tier: "ERROR",
        rank: "",
        lp: 0,
        wins: 0,
        losses: 0,
        score: -1,

        flexTier: "ERROR",
        flexRank: "",
        flexLp: 0,
        flexWins: 0,
        flexLosses: 0,
        flexScore: -1,

        error: error.message
      });
    }
  }

  result.sort((a, b) => b.score - a.score);
  return result;
}

async function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk;

      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body zu gross"));
      }
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Ungültiges JSON"));
      }
    });

    req.on("error", reject);
  });
}

function normalizeAccount(input) {
  const label = String(input.label || "").trim();
  const region = String(input.region || "").trim().toLowerCase();
  const gameName = String(input.gameName || "").trim();
  const tagLine = String(input.tagLine || "").trim();

  if (!label) throw new Error("Label fehlt");
  if (!region) throw new Error("Region fehlt");
  if (!regionalRoute[region]) throw new Error(`Region wird nicht unterstützt: ${region}`);
  if (!gameName) throw new Error("Game Name fehlt");
  if (!tagLine) throw new Error("Tagline fehlt");

  return {
    label,
    region,
    gameName,
    tagLine
  };
}

async function addAccount(input) {
  const newAccount = normalizeAccount(input);
  const accounts = await readAccounts();

  const exists = accounts.some(account =>
    account.region.toLowerCase() === newAccount.region &&
    account.gameName.toLowerCase() === newAccount.gameName.toLowerCase() &&
    account.tagLine.toLowerCase() === newAccount.tagLine.toLowerCase()
  );

  if (exists) {
    throw new Error("Dieser Account ist bereits vorhanden");
  }

  await getAccountRankData(newAccount);

  accounts.push(newAccount);
  await writeAccounts(accounts);

  return newAccount;
}

async function deleteAccount(input) {
  const region = String(input.region || "").trim().toLowerCase();
  const gameName = String(input.gameName || "").trim().toLowerCase();
  const tagLine = String(input.tagLine || "").trim().toLowerCase();

  const accounts = await readAccounts();

  const filtered = accounts.filter(account => {
    return !(
      account.region.toLowerCase() === region &&
      account.gameName.toLowerCase() === gameName &&
      account.tagLine.toLowerCase() === tagLine
    );
  });

  if (filtered.length === accounts.length) {
    throw new Error("Account nicht gefunden");
  }

  await writeAccounts(filtered);

  return {
    deleted: true
  };
}

function shuffleArray(values) {
  const result = [...values];

  for (let i = result.length - 1; i > 0; i--) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    [result[i], result[randomIndex]] = [result[randomIndex], result[i]];
  }

  return result;
}

async function fetchDataDragonJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Data Dragon Fehler ${response.status}`);
  }

  return response.json();
}

async function getRandomChampions(count = 3) {
  const versions = await fetchDataDragonJson(
    "https://ddragon.leagueoflegends.com/api/versions.json"
  );

  const version = versions[0];

  if (!version) {
    throw new Error("Keine Data-Dragon-Version gefunden");
  }

  const championData = await fetchDataDragonJson(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/de_DE/champion.json`
  );

  const champions = Object.values(championData.data || {}).map(champion => ({
    id: champion.id,
    key: champion.key,
    name: champion.name,
    title: champion.title,
    imageUrl: `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${champion.image.full}`,
    splashUrl: `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${champion.id}_0.jpg`
  }));

  return {
    version,
    champions: shuffleArray(champions).slice(0, count)
  };
}

async function getRandomChampionExcept(version, excludedChampionIds = []) {
  const championData = await fetchDataDragonJson(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/de_DE/champion.json`
  );

  const excluded = new Set((excludedChampionIds || []).map(id => String(id)));
  const champions = Object.values(championData.data || {}).map(champion => ({
    id: champion.id,
    key: champion.key,
    name: champion.name,
    title: champion.title,
    imageUrl: `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${champion.image.full}`,
    splashUrl: `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${champion.id}_0.jpg`
  })).filter(champion => !excluded.has(String(champion.id)));

  const champion = shuffleArray(champions)[0];

  if (!champion) {
    throw new Error("Kein gültiger Ersatz-Champion gefunden");
  }

  return champion;
}

function toPublicItem(item, itemType) {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    imageUrl: item.imageUrl,
    gold: item.gold,
    tags: item.tags,
    itemType
  };
}

function isSummonersRiftItem(item) {
  return item.maps?.["11"] === true;
}

function isLaneStarterItem(item) {
  return (
    LANE_STARTER_ITEM_NAMES.has(item.name) ||
    LANE_STARTER_ITEM_IDS.has(item.id)
  );
}

function isJungleStarterItem(item) {
  return (
    JUNGLE_STARTER_ITEM_NAMES.has(item.name) ||
    JUNGLE_STARTER_ITEM_IDS.has(item.id)
  );
}

function isSupportFinalItem(item) {
  return SUPPORT_FINAL_ITEM_NAMES.has(item.name);
}

function isModeSpecificItem(item) {
  const name = item.name || "";

  return (
    name.startsWith("Guardian's ") ||
    BLOCKED_SPECIAL_ITEM_NAMES.has(name)
  );
}

function isBlockedBuildItem(item) {
  return (
    BLOCKED_BUILD_ITEM_NAMES.has(item.name) ||
    BLOCKED_BUILD_ITEM_IDS.has(item.id)
  );
}

function isBootItem(item) {
  const tags = item.tags || [];
  const name = item.name || "";

  return (
    tags.includes("Boots") ||
    name.includes("Boots") ||
    name.includes("Greaves") ||
    name.includes("Treads") ||
    name.includes("Shoes")
  );
}

function isAllowedFinalBuildItem(item) {
  const tags = item.tags || [];

  if (!isSummonersRiftItem(item)) return false;

  if (item.gold <= 0) return false;
  if (item.purchasable !== true) return false;
  if (item.inStore === false) return false;

  if (item.consumed === true) return false;
  if (item.consumeOnFull === true) return false;

  if (item.requiredChampion) return false;
  if (item.requiredAlly) return false;
  if (item.specialRecipe) return false;

  if (tags.includes("Consumable")) return false;
  if (tags.includes("Trinket")) return false;
  if (tags.includes("Jungle")) return false;

if (isBlockedBuildItem(item)) return false;
if (isModeSpecificItem(item)) return false;

  // Nur fertige Items, keine Komponenten.
  if (Array.isArray(item.into) && item.into.length > 0) return false;

  return true;
}

function getStarterItemsForRole(allItems, role) {
  if (role === "jungle") {
    return allItems.filter(item =>
      isSummonersRiftItem(item) &&
      isJungleStarterItem(item)
    );
  }

  if (role === "support") {
    return allItems.filter(item =>
      isSummonersRiftItem(item) &&
      isSupportFinalItem(item)
    );
  }

  return allItems.filter(item =>
    isSummonersRiftItem(item) &&
    isLaneStarterItem(item)
  );
}

function normalizeItemNameKey(item) {
  return String(item?.name || "")
    .trim()
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/\s+/g, " ");
}

function hasItemIdentity(items, item) {
  const itemId = String(item?.id || "");
  const itemNameKey = normalizeItemNameKey(item);

  return (items || []).some(existingItem =>
    String(existingItem?.id || "") === itemId ||
    normalizeItemNameKey(existingItem) === itemNameKey
  );
}

function dedupeItemsByIdentity(items) {
  const usedIds = new Set();
  const usedNames = new Set();
  const result = [];

  for (const item of items || []) {
    const itemId = String(item?.id || "");
    const itemNameKey = normalizeItemNameKey(item);

    if (!itemId || !itemNameKey) continue;
    if (usedIds.has(itemId) || usedNames.has(itemNameKey)) continue;

    usedIds.add(itemId);
    usedNames.add(itemNameKey);
    result.push(item);
  }

  return result;
}

async function getRandomItems(version, role, count = 6) {
  const itemData = await fetchDataDragonJson(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/item.json`
  );

  const allItems = Object.entries(itemData.data || {}).map(([id, item]) => ({
    id,
    name: item.name || "Unknown Item",
    description: item.plaintext || "",
    imageUrl: `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${item.image?.full || `${id}.png`}`,
    gold: item.gold?.total || 0,
    purchasable: item.gold?.purchasable === true,
    tags: item.tags || [],
    maps: item.maps || {},
    into: item.into || [],
    from: item.from || [],
    inStore: item.inStore,
    consumed: item.consumed,
    consumeOnFull: item.consumeOnFull,
    requiredChampion: item.requiredChampion || null,
    requiredAlly: item.requiredAlly || null,
    specialRecipe: item.specialRecipe || null
  }));

  const starterItems = getStarterItemsForRole(allItems, role);

  if (starterItems.length === 0) {
    throw new Error(`Kein Starter Item für Rolle ${role} gefunden`);
  }

  const starterItem = toPublicItem(
    shuffleArray(starterItems)[0],
    role === "support" ? "support-final" : "starter"
  );

  const validFinalItems = dedupeItemsByIdentity(
    allItems.filter(isAllowedFinalBuildItem)
  );

  console.log("Bravery Item Pools:", {
    role,
    starterItems: starterItems.length,
    validFinalItems: validFinalItems.length
  });

  if (validFinalItems.length < count) {
    throw new Error(`Nur ${validFinalItems.length} gültige Full Items gefunden, erwartet ${count}`);
  }

  const boots = shuffleArray(
    validFinalItems.filter(isBootItem)
  );

  const nonBoots = shuffleArray(
    validFinalItems.filter(item => !isBootItem(item))
  );

  const finalItems = [];

  if (boots.length > 0) {
    finalItems.push(toPublicItem(boots[0], "boots"));
  }

  for (const item of nonBoots) {
    if (finalItems.length >= count) break;

    if (!hasItemIdentity(finalItems, item)) {
      finalItems.push(toPublicItem(item, "final"));
    }
  }

  if (finalItems.length !== count) {
    throw new Error(`Ungültiger Item Build: erwartet ${count} Full Items, erhalten ${finalItems.length}`);
  }

  return {
    starterItem,
    finalItems
  };
}

function toPublicRune(rune) {
  return {
    id: rune.id,
    key: rune.key,
    name: rune.name,
    shortDesc: rune.shortDesc || "",
    longDesc: rune.longDesc || "",
    iconUrl: `https://ddragon.leagueoflegends.com/cdn/img/${rune.icon}`
  };
}

async function getRandomRunes(version) {
  const runeData = await fetchDataDragonJson(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/runesReforged.json`
  );

  if (!Array.isArray(runeData) || runeData.length < 2) {
    throw new Error("Keine gültigen Runen-Daten gefunden");
  }

  const styles = runeData
    .filter(style => Array.isArray(style.slots) && style.slots.length >= 4)
    .map(style => ({
      id: style.id,
      key: style.key,
      name: style.name,
      iconUrl: `https://ddragon.leagueoflegends.com/cdn/img/${style.icon}`,
      slots: style.slots
    }));

  if (styles.length < 2) {
    throw new Error("Zu wenige gültige Runenbäume gefunden");
  }

  const primaryStyle = shuffleArray(styles)[0];
  const secondaryStyle = shuffleArray(
    styles.filter(style => style.id !== primaryStyle.id)
  )[0];

  const primarySlots = primaryStyle.slots;

  const keystone = shuffleArray(primarySlots[0].runes || [])[0];
  const primaryRune1 = shuffleArray(primarySlots[1].runes || [])[0];
  const primaryRune2 = shuffleArray(primarySlots[2].runes || [])[0];
  const primaryRune3 = shuffleArray(primarySlots[3].runes || [])[0];

  if (!keystone || !primaryRune1 || !primaryRune2 || !primaryRune3) {
    throw new Error(`Ungültiger primärer Runenbaum: ${primaryStyle.name}`);
  }

  const secondarySlots = shuffleArray(
    secondaryStyle.slots
      .slice(1)
      .filter(slot => Array.isArray(slot.runes) && slot.runes.length > 0)
  ).slice(0, 2);

  if (secondarySlots.length < 2) {
    throw new Error(`Ungültiger sekundärer Runenbaum: ${secondaryStyle.name}`);
  }

  const secondaryRunes = secondarySlots.map(slot => shuffleArray(slot.runes)[0]);

  const offenseShards = [
    {
      id: "shard-offense-adaptive",
      name: "Adaptive Force",
      iconUrl: "https://ddragon.leagueoflegends.com/cdn/img/perk-images/StatMods/StatModsAdaptiveForceIcon.png"
    },
    {
      id: "shard-offense-attack-speed",
      name: "Attack Speed",
      iconUrl: "https://ddragon.leagueoflegends.com/cdn/img/perk-images/StatMods/StatModsAttackSpeedIcon.png"
    },
    {
      id: "shard-offense-ability-haste",
      name: "Ability Haste",
      iconUrl: "https://ddragon.leagueoflegends.com/cdn/img/perk-images/StatMods/StatModsCDRScalingIcon.png"
    }
  ];

  const flexShards = [
    {
      id: "shard-flex-adaptive",
      name: "Adaptive Force",
      iconUrl: "https://ddragon.leagueoflegends.com/cdn/img/perk-images/StatMods/StatModsAdaptiveForceIcon.png"
    },
    {
      id: "shard-flex-move-speed",
      name: "Move Speed",
      iconUrl: "https://ddragon.leagueoflegends.com/cdn/img/perk-images/StatMods/StatModsMovementSpeedIcon.png"
    },
    {
      id: "shard-flex-health-scaling",
      name: "Scaling Health",
      iconUrl: "https://ddragon.leagueoflegends.com/cdn/img/perk-images/StatMods/StatModsHealthScalingIcon.png"
    }
  ];

  const defenseShards = [
    {
      id: "shard-defense-health",
      name: "Health",
      iconUrl: "https://ddragon.leagueoflegends.com/cdn/img/perk-images/StatMods/StatModsHealthPlusIcon.png"
    },
    {
      id: "shard-defense-tenacity",
      name: "Tenacity and Slow Resist",
      iconUrl: "https://ddragon.leagueoflegends.com/cdn/img/perk-images/StatMods/StatModsTenacityIcon.png"
    },
    {
      id: "shard-defense-health-scaling",
      name: "Scaling Health",
      iconUrl: "https://ddragon.leagueoflegends.com/cdn/img/perk-images/StatMods/StatModsHealthScalingIcon.png"
    }
  ];

  return {
    primaryStyle: {
      id: primaryStyle.id,
      key: primaryStyle.key,
      name: primaryStyle.name,
      iconUrl: primaryStyle.iconUrl
    },
    secondaryStyle: {
      id: secondaryStyle.id,
      key: secondaryStyle.key,
      name: secondaryStyle.name,
      iconUrl: secondaryStyle.iconUrl
    },
    keystone: toPublicRune(keystone),
    primaryRunes: [
      toPublicRune(primaryRune1),
      toPublicRune(primaryRune2),
      toPublicRune(primaryRune3)
    ],
    secondaryRunes: secondaryRunes.map(toPublicRune),
    statShards: [
      shuffleArray(offenseShards)[0],
      shuffleArray(flexShards)[0],
      shuffleArray(defenseShards)[0]
    ]
  };
}


function toPublicSummonerSpell(spell, version) {
  return {
    id: spell.id,
    name: spell.name,
    imageUrl: `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${spell.image}`
  };
}

function getRandomSummonerSpells(role, version) {
  const nonSmiteSpells = SUMMONER_SPELLS.filter(spell => spell.id !== "smite");

  if (role === "jungle") {
    const smite = SUMMONER_SPELLS.find(spell => spell.id === "smite");
    const secondSpell = shuffleArray(nonSmiteSpells)[0];

    return [smite, secondSpell].map(spell => toPublicSummonerSpell(spell, version));
  }

  return shuffleArray(nonSmiteSpells)
    .slice(0, 2)
    .map(spell => toPublicSummonerSpell(spell, version));
}

async function getChampionBasicSpells(champion, version) {
  const fallback = ["Q", "W", "E"].map(key => ({
    id: `${champion?.id || "champion"}-${key.toLowerCase()}`,
    key,
    name: key,
    imageUrl: null
  }));

  if (!champion?.id || !version) {
    return fallback;
  }

  try {
    const championData = await fetchDataDragonJson(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/de_DE/champion/${encodeURIComponent(champion.id)}.json`
    );

    const championDetail = championData.data?.[champion.id];
    const spells = Array.isArray(championDetail?.spells)
      ? championDetail.spells.slice(0, 3)
      : [];

    if (spells.length !== 3) {
      return fallback;
    }

    return spells.map((spell, index) => {
      const key = ["Q", "W", "E"][index];
      const imageName = spell.image?.full;

      return {
        id: spell.id || `${champion.id}-${key.toLowerCase()}`,
        key,
        name: spell.name || key,
        imageUrl: imageName
          ? `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${imageName}`
          : null
      };
    });
  } catch (error) {
    console.warn(`Konnte Skill-Icons für ${champion.id} nicht laden:`, error.message);
    return fallback;
  }
}

async function getRandomSkillOrder(champion, version) {
  const spells = await getChampionBasicSpells(champion, version);
  return shuffleArray(spells);
}

async function getRandomReplacementItem(version, currentItems, currentItem) {
  const itemData = await fetchDataDragonJson(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/item.json`
  );

  const allItems = Object.entries(itemData.data || {}).map(([id, item]) => ({
    id,
    name: item.name || "Unknown Item",
    description: item.plaintext || "",
    imageUrl: `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${item.image?.full || `${id}.png`}`,
    gold: item.gold?.total || 0,
    purchasable: item.gold?.purchasable === true,
    tags: item.tags || [],
    maps: item.maps || {},
    into: item.into || [],
    from: item.from || [],
    inStore: item.inStore,
    consumed: item.consumed,
    consumeOnFull: item.consumeOnFull,
    requiredChampion: item.requiredChampion || null,
    requiredAlly: item.requiredAlly || null,
    specialRecipe: item.specialRecipe || null
  }));

  const currentIds = new Set((currentItems || []).map(item => String(item.id)));
  const currentNames = new Set((currentItems || []).map(normalizeItemNameKey));
  const currentItemId = String(currentItem?.id || "");
  const currentItemName = normalizeItemNameKey(currentItem);

  currentIds.delete(currentItemId);
  currentNames.delete(currentItemName);

  const validItems = dedupeItemsByIdentity(
    allItems.filter(isAllowedFinalBuildItem)
  ).filter(item =>
    String(item.id) !== currentItemId &&
    normalizeItemNameKey(item) !== currentItemName &&
    !currentIds.has(String(item.id)) &&
    !currentNames.has(normalizeItemNameKey(item))
  );

  const sameTypeItems = currentItem?.itemType === "boots"
    ? validItems.filter(isBootItem)
    : validItems.filter(item => !isBootItem(item));

  const pool = sameTypeItems.length > 0 ? sameTypeItems : validItems;
  const replacement = shuffleArray(pool)[0];

  if (!replacement) {
    throw new Error("Kein gültiges Ersatz-Item gefunden");
  }

  return toPublicItem(replacement, currentItem?.itemType === "boots" ? "boots" : "final");
}

function normalizePlayerKey(playerName) {
  return String(playerName || "").trim().toLowerCase();
}

function getActiveItemVotes(state, targetPlayerKey, itemIndex, itemId) {
  return (state.itemVotes || []).filter(vote =>
    vote.targetPlayerKey === targetPlayerKey &&
    Number(vote.itemIndex) === Number(itemIndex) &&
    String(vote.itemId) === String(itemId)
  );
}

function getKnownBraveryPlayerKeys(state) {
  const keys = new Set();

  Object.keys(state.rolls || {}).forEach(key => {
    if (key) keys.add(normalizePlayerKey(key));
  });

  (state.selections || []).forEach(selection => {
    const key = normalizePlayerKey(selection.playerName);
    if (key) keys.add(key);
  });

  return [...keys];
}

function getRequiredResetVotes(state) {
  return getKnownBraveryPlayerKeys(state).length >= 3 ? 2 : 1;
}

function createEmptyBraveryState() {
  return {
    version: null,
    champions: [],
    rolls: {},
    selections: [],
    itemVotes: [],
    resetVotes: [],
    lastItemReroll: null,
    lastPlayerReroll: null,
    createdAt: null,
    updatedAt: null
  };
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });

  res.end(JSON.stringify(data, null, 2));
}

async function sendDashboard(res) {
  try {
    const html = await fs.readFile(DASHBOARD_FILE, "utf8");

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8"
    });

    res.end(html);
  } catch {
    sendJson(res, 500, {
      error: "Dashboard-Datei nicht gefunden",
      dashboardFile: DASHBOARD_FILE
    });
  }
}

async function sendBravery(res) {
  try {
    const html = await fs.readFile(BRAVERY_FILE, "utf8");

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8"
    });

    res.end(html);
  } catch {
    sendJson(res, 500, {
      error: "Bravery-Datei nicht gefunden",
      braveryFile: BRAVERY_FILE
    });
  }
}

async function sendStaticFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();

  const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".json": "application/json; charset=utf-8"
  };

  const contentType = contentTypes[ext] || "application/octet-stream";
  const content = await fs.readFile(filePath);

  res.writeHead(200, {
    "Content-Type": contentType
  });

  res.end(content);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/") {
      await sendDashboard(res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/bravery") {
      await sendBravery(res);
      return;
    }

    if (
      req.method === "GET" &&
      (url.pathname.startsWith("/dashboard/") || url.pathname.startsWith("/bravery/"))
    ) {
      const requestedPath = path.normalize(
        path.join(FRONTEND_DIR, url.pathname)
      );

      const frontendRoot = path.normalize(FRONTEND_DIR);

      if (!requestedPath.startsWith(frontendRoot)) {
        sendJson(res, 403, {
          error: "Forbidden"
        });
        return;
      }

      try {
        await sendStaticFile(res, requestedPath);
      } catch {
        sendJson(res, 404, {
          error: "Static file not found",
          requestedPath
        });
      }

      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, {
        ok: true,
        port: PORT,
        accountsFile: ACCOUNTS_FILE,
        braveryStateFile: BRAVERY_STATE_FILE,
        frontendDir: FRONTEND_DIR,
        dashboardFile: DASHBOARD_FILE,
        braveryFile: BRAVERY_FILE,
        hasRiotApiKey: Boolean(RIOT_API_KEY)
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/bravery/state") {
      const state = await readBraveryState();
      sendJson(res, 200, state);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/bravery/roll") {
      const body = await readRequestBody(req);
      const playerName = String(body.playerName || "").trim();

      if (!playerName) {
        sendJson(res, 400, {
          error: "Spielername fehlt"
        });
        return;
      }

      const state = await readBraveryState();

      const alreadySelected = (state.selections || []).some(
        selection => selection.playerName.toLowerCase() === playerName.toLowerCase()
      );

      if (alreadySelected) {
        sendJson(res, 400, {
          error: "Du hast bereits einen Champion gewählt."
        });
        return;
      }

      const data = await getRandomChampions(3);

      const playerKey = playerName.toLowerCase();

      const newState = {
        ...state,
        version: state.version || data.version,
        champions: [],
        rolls: {
          ...(state.rolls || {}),
          [playerKey]: data.champions
        },
        selections: state.selections || [],
        resetVotes: state.resetVotes || [],
        createdAt: state.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await writeBraveryState(newState);
      sendJson(res, 200, newState);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/bravery/select") {
      const body = await readRequestBody(req);

      const playerName = String(body.playerName || "").trim();
      const championId = String(body.championId || "").trim();
      const role = String(body.role || "").trim().toLowerCase();

      const allowedRoles = ["top", "jungle", "mid", "adc", "support"];

      if (!playerName) {
        sendJson(res, 400, {
          error: "Spielername fehlt"
        });
        return;
      }

      if (!allowedRoles.includes(role)) {
        sendJson(res, 400, {
          error: "Bitte wähle eine gültige Rolle."
        });
        return;
      }

      const state = await readBraveryState();

      const playerKey = playerName.toLowerCase();
      const playerRoll = (state.rolls || {})[playerKey] || [];

      if (playerRoll.length === 0) {
        sendJson(res, 400, {
          error: "Bitte würfle zuerst deine Champions."
        });
        return;
      }

      const alreadySelected = (state.selections || []).some(
        selection => selection.playerName.toLowerCase() === playerName.toLowerCase()
      );

      if (alreadySelected) {
        sendJson(res, 400, {
          error: "Du hast bereits einen Champion gewählt."
        });
        return;
      }

      const champion = playerRoll.find(championItem => championItem.id === championId);

      if (!champion) {
        sendJson(res, 400, {
          error: "Champion ist nicht Teil der aktuellen Runde"
        });
        return;
      }

      const finalItemCount = getFinalItemCountForRole(role);
      const itemBuild = await getRandomItems(state.version, role, finalItemCount);
      const runeBuild = await getRandomRunes(state.version);
      const summonerSpells = getRandomSummonerSpells(role, state.version);
      const skillOrder = await getRandomSkillOrder(champion, state.version);

      if (!itemBuild.starterItem) {
        throw new Error(`Kein Starter Item für Rolle ${role} generiert`);
      }

      if (!Array.isArray(itemBuild.finalItems) || itemBuild.finalItems.length !== finalItemCount) {
        throw new Error(
          `Ungültiger Item Build für Rolle ${role}: erwartet ${finalItemCount} Full Items, erhalten ${itemBuild.finalItems?.length || 0}`
        );
      }

      const selections = state.selections || [];

      selections.push({
        playerName,
        role,
        champion,
        starterItem: itemBuild.starterItem,
        items: itemBuild.finalItems,
        runes: runeBuild,
        summonerSpells,
        skillOrder,
        selectedAt: new Date().toISOString()
      });

      const rolls = {
        ...(state.rolls || {})
      };

      delete rolls[playerKey];

      const newState = {
        ...state,
        champions: [],
        rolls,
        selections,
        resetVotes: [],
        updatedAt: new Date().toISOString()
      };

      await writeBraveryState(newState);
      sendJson(res, 200, newState);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/bravery/reroll-player") {
      const body = await readRequestBody(req);
      const playerName = String(body.playerName || "").trim();

      if (!playerName) {
        sendJson(res, 400, { error: "Spielername fehlt" });
        return;
      }

      const state = await readBraveryState();
      const selections = state.selections || [];
      const playerKey = normalizePlayerKey(playerName);
      const selectionIndex = selections.findIndex(
        selection => normalizePlayerKey(selection.playerName) === playerKey
      );

      if (selectionIndex < 0) {
        sendJson(res, 404, { error: "Deine Auswahl wurde nicht gefunden." });
        return;
      }

      const currentSelection = selections[selectionIndex];
      const excludedChampionIds = selections
        .filter((_, index) => index !== selectionIndex)
        .map(selection => selection.champion?.id)
        .filter(Boolean);

      const champion = await getRandomChampionExcept(state.version, excludedChampionIds);
      const finalItemCount = getFinalItemCountForRole(currentSelection.role);
      const itemBuild = await getRandomItems(state.version, currentSelection.role, finalItemCount);
      const runeBuild = await getRandomRunes(state.version);
      const summonerSpells = getRandomSummonerSpells(currentSelection.role, state.version);
      const skillOrder = await getRandomSkillOrder(champion, state.version);

      if (!itemBuild.starterItem || !Array.isArray(itemBuild.finalItems) || itemBuild.finalItems.length !== finalItemCount) {
        throw new Error(`Ungültiger neuer Build für ${currentSelection.playerName}`);
      }

      const rerolledSelection = {
        ...currentSelection,
        champion,
        starterItem: itemBuild.starterItem,
        items: itemBuild.finalItems,
        runes: runeBuild,
        summonerSpells,
        skillOrder,
        rerolledAt: new Date().toISOString()
      };

      selections[selectionIndex] = rerolledSelection;

      const newState = {
        ...state,
        selections,
        itemVotes: (state.itemVotes || []).filter(vote => vote.targetPlayerKey !== playerKey),
        resetVotes: [],
        lastPlayerReroll: {
          eventId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          playerKey,
          playerName: rerolledSelection.playerName,
          championId: champion.id,
          championName: champion.name,
          at: new Date().toISOString()
        },
        updatedAt: new Date().toISOString()
      };

      await writeBraveryState(newState);
      sendJson(res, 200, newState);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/bravery/item-vote") {
      const body = await readRequestBody(req);

      const playerName = String(body.playerName || "").trim();
      const targetPlayerName = String(body.targetPlayerName || "").trim();
      const itemIndex = Number(body.itemIndex);

      if (!playerName) {
        sendJson(res, 400, { error: "Spielername fehlt" });
        return;
      }

      if (!targetPlayerName || !Number.isInteger(itemIndex)) {
        sendJson(res, 400, { error: "Ungültiger Vote" });
        return;
      }

      const state = await readBraveryState();
      const selections = state.selections || [];
      const voterKey = normalizePlayerKey(playerName);
      const targetPlayerKey = normalizePlayerKey(targetPlayerName);

      const voterSelection = selections.find(
        selection => normalizePlayerKey(selection.playerName) === voterKey
      );
      const targetSelection = selections.find(
        selection => normalizePlayerKey(selection.playerName) === targetPlayerKey
      );

      if (!voterSelection) {
        sendJson(res, 400, { error: "Du musst in dieser Runde zuerst deine Auswahl speichern." });
        return;
      }

      if (!targetSelection) {
        sendJson(res, 404, { error: "Zielspieler wurde nicht gefunden." });
        return;
      }

      if (voterKey === targetPlayerKey) {
        sendJson(res, 400, { error: "Eigene Items können nicht gevoted werden." });
        return;
      }

      const targetItems = targetSelection.items || [];
      const targetItem = targetItems[itemIndex];

      if (!targetItem) {
        sendJson(res, 400, { error: "Item wurde nicht gefunden." });
        return;
      }

      const itemVotes = state.itemVotes || [];
      const voterVotes = itemVotes.filter(vote => vote.voterKey === voterKey);

      if (voterVotes.length >= ITEM_VOTES_PER_PLAYER) {
        sendJson(res, 400, { error: `Du hast deine ${ITEM_VOTES_PER_PLAYER} Votes für diese Runde bereits benutzt.` });
        return;
      }

      const alreadyVotedForThisItem = itemVotes.some(vote =>
        vote.voterKey === voterKey &&
        vote.targetPlayerKey === targetPlayerKey &&
        Number(vote.itemIndex) === itemIndex &&
        String(vote.itemId) === String(targetItem.id)
      );

      if (alreadyVotedForThisItem) {
        sendJson(res, 400, { error: "Du hast dieses Item bereits gevoted." });
        return;
      }

      const newVote = {
        voterKey,
        voterName: playerName,
        targetPlayerKey,
        targetPlayerName: targetSelection.playerName,
        itemIndex,
        itemId: targetItem.id,
        itemName: targetItem.name,
        votedAt: new Date().toISOString()
      };

      const nextVotes = [...itemVotes, newVote];
      const activeVotes = getActiveItemVotes(
        { itemVotes: nextVotes },
        targetPlayerKey,
        itemIndex,
        targetItem.id
      );

      let lastItemReroll = state.lastItemReroll || null;

      if (activeVotes.length >= ITEM_REROLL_VOTE_THRESHOLD) {
        const replacementItem = await getRandomReplacementItem(
          state.version,
          targetItems,
          targetItem
        );

        targetItems[itemIndex] = replacementItem;
        targetSelection.items = targetItems;

        lastItemReroll = {
          eventId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          targetPlayerKey,
          targetPlayerName: targetSelection.playerName,
          itemIndex,
          oldItemId: targetItem.id,
          oldItemName: targetItem.name,
          newItemId: replacementItem.id,
          newItemName: replacementItem.name,
          at: new Date().toISOString()
        };
      }

      const newState = {
        ...state,
        selections,
        itemVotes: nextVotes,
        lastItemReroll,
        updatedAt: new Date().toISOString()
      };

      await writeBraveryState(newState);
      sendJson(res, 200, newState);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/bravery/item-swap") {
      const body = await readRequestBody(req);

      const playerName = String(body.playerName || "").trim();
      const itemIndex = Number(body.itemIndex);

      if (!playerName) {
        sendJson(res, 400, { error: "Spielername fehlt" });
        return;
      }

      if (!Number.isInteger(itemIndex)) {
        sendJson(res, 400, { error: "Ungültiges Item" });
        return;
      }

      const state = await readBraveryState();
      const selections = state.selections || [];
      const playerKey = normalizePlayerKey(playerName);
      const selection = selections.find(
        currentSelection => normalizePlayerKey(currentSelection.playerName) === playerKey
      );

      if (!selection) {
        sendJson(res, 400, { error: "Du musst in dieser Runde zuerst deine Auswahl speichern." });
        return;
      }

      const usedVotes = (state.itemVotes || []).filter(vote => vote.voterKey === playerKey).length;

      if (usedVotes < ITEM_VOTES_PER_PLAYER) {
        sendJson(res, 400, { error: `Du musst zuerst deine ${ITEM_VOTES_PER_PLAYER} Item-Votes benutzen.` });
        return;
      }

      const items = selection.items || [];
      const currentItem = items[itemIndex];

      if (!currentItem) {
        sendJson(res, 400, { error: "Item wurde nicht gefunden." });
        return;
      }

      const replacementItem = await getRandomReplacementItem(
        state.version,
        items,
        currentItem
      );

      items[itemIndex] = replacementItem;
      selection.items = items;

      const lastItemReroll = {
        eventId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        targetPlayerKey: playerKey,
        targetPlayerName: selection.playerName,
        itemIndex,
        oldItemId: currentItem.id,
        oldItemName: currentItem.name,
        newItemId: replacementItem.id,
        newItemName: replacementItem.name,
        source: "self-swap",
        at: new Date().toISOString()
      };

      const newState = {
        ...state,
        selections,
        lastItemReroll,
        updatedAt: new Date().toISOString()
      };

      await writeBraveryState(newState);
      sendJson(res, 200, newState);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/bravery/reset") {
      const body = await readRequestBody(req);
      const playerName = String(body.playerName || "").trim();
      const state = await readBraveryState();
      const requiredVotes = getRequiredResetVotes(state);

      if (requiredVotes <= 1) {
        const newState = createEmptyBraveryState();
        await writeBraveryState(newState);
        sendJson(res, 200, newState);
        return;
      }

      if (!playerName) {
        sendJson(res, 400, { error: "Spielername fehlt" });
        return;
      }

      const playerKey = normalizePlayerKey(playerName);
      const knownPlayerKeys = getKnownBraveryPlayerKeys(state);

      if (!knownPlayerKeys.includes(playerKey)) {
        sendJson(res, 400, { error: "Du musst in dieser Runde zuerst Teil der Lobby sein." });
        return;
      }

      const resetVotes = state.resetVotes || [];
      const nextResetVotes = resetVotes.some(vote => vote.voterKey === playerKey)
        ? resetVotes
        : [...resetVotes, {
          voterKey: playerKey,
          voterName: playerName,
          votedAt: new Date().toISOString()
        }];

      if (nextResetVotes.length >= requiredVotes) {
        const newState = createEmptyBraveryState();
        await writeBraveryState(newState);
        sendJson(res, 200, newState);
        return;
      }

      const newState = {
        ...state,
        resetVotes: nextResetVotes,
        updatedAt: new Date().toISOString()
      };

      await writeBraveryState(newState);
      sendJson(res, 200, newState);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/accounts") {
      try {
        const data = await getAccountsWithRank();
        sendJson(res, 200, data);
      } catch (error) {
        sendJson(res, 500, {
          error: error.message
        });
      }

      return;
    }

    if (req.method === "POST" && url.pathname === "/api/accounts") {
      try {
        const body = await readRequestBody(req);
        const account = await addAccount(body);

        sendJson(res, 201, {
          message: "Account hinzugefügt",
          account
        });
      } catch (error) {
        sendJson(res, 400, {
          error: error.message
        });
      }

      return;
    }

    if (req.method === "DELETE" && url.pathname === "/api/accounts") {
      try {
        const body = await readRequestBody(req);
        const result = await deleteAccount(body);

        sendJson(res, 200, result);
      } catch (error) {
        sendJson(res, 400, {
          error: error.message
        });
      }

      return;
    }

    sendJson(res, 404, {
      error: "Not found"
    });
  } catch (error) {
    console.error("Server Fehler:", error);

    sendJson(res, 500, {
      error: error.message || "Interner Serverfehler"
    });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`LoL Rank Dashboard läuft auf Port ${PORT}`);
  console.log(`Frontend-Verzeichnis: ${FRONTEND_DIR}`);
});