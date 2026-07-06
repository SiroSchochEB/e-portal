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
      selections: [],
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
      selections: [],
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

async function getRandomItems(version, role, count = 6) {
  const starterItemIdsByRole = {
    top: ["1054", "1055", "1083", "1056"],
    mid: ["1056", "1054", "1055"],
    adc: ["1055", "1083"],
    jungle: ["1101", "1102", "1103"],
    support: ["3865", "3866", "3867"]
  };

  const itemData = await fetchDataDragonJson(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/item.json`
  );

  const allItems = Object.entries(itemData.data || {}).map(([id, item]) => ({
    id,
    name: item.name || "Unknown Item",
    description: item.plaintext || "",
    imageUrl: `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${item.image?.full || `${id}.png`}`,
    gold: item.gold?.total || 0,
    purchasable: item.gold?.purchasable !== false,
    tags: item.tags || [],
    maps: item.maps || {},
    into: item.into || [],
    from: item.from || [],
    requiredChampion: item.requiredChampion || null,
    requiredAlly: item.requiredAlly || null
  }));

  const starterIds = starterItemIdsByRole[role] || starterItemIdsByRole.top;
  const allStarterIds = Object.values(starterItemIdsByRole).flat();

  const starterItems = allItems.filter(item => starterIds.includes(item.id));

  if (starterItems.length === 0) {
    throw new Error(`Kein Starter Item für Rolle ${role} gefunden`);
  }

  const starterItem = {
    ...shuffleArray(starterItems)[0],
    itemType: "starter"
  };

  const validFinalItems = allItems.filter(item => {
    const isSummonersRift = item.maps?.["11"] === true;
    const isPurchasable = item.purchasable && item.gold > 0;
    const isFinalItem = item.into.length === 0;
    const isNotConsumable = !item.tags.includes("Consumable");
    const isNotTrinket = !item.tags.includes("Trinket");
    const isNotJungle = !item.tags.includes("Jungle");
    const isNotChampionSpecific = !item.requiredChampion && !item.requiredAlly;
    const isNotAnyStarter = !allStarterIds.includes(item.id);

    return (
      isSummonersRift &&
      isPurchasable &&
      isFinalItem &&
      isNotConsumable &&
      isNotTrinket &&
      isNotJungle &&
      isNotChampionSpecific &&
      isNotAnyStarter
    );
  });

  if (validFinalItems.length < count) {
    throw new Error(`Nur ${validFinalItems.length} gültige Full Items gefunden, erwartet ${count}`);
  }

  const boots = shuffleArray(
    validFinalItems.filter(item => item.tags.includes("Boots"))
  );

  const nonBoots = shuffleArray(
    validFinalItems.filter(item => !item.tags.includes("Boots"))
  );

  const finalItems = [];

  if (boots.length > 0) {
    finalItems.push({
      ...boots[0],
      itemType: "boots"
    });
  }

  for (const item of nonBoots) {
    if (finalItems.length >= count) break;

    const alreadyUsed = finalItems.some(selectedItem => selectedItem.id === item.id);

    if (!alreadyUsed) {
      finalItems.push({
        ...item,
        itemType: "final"
      });
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
      const state = await readBraveryState();

      if (state.champions && state.champions.length > 0) {
        sendJson(res, 400, {
          error: "Es läuft bereits eine Runde. Starte zuerst ein neues Spiel."
        });
        return;
      }

      const data = await getRandomChampions(3);

      const newState = {
        version: data.version,
        champions: data.champions,
        selections: [],
        createdAt: new Date().toISOString(),
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

      if (!state.champions || state.champions.length === 0) {
        sendJson(res, 400, {
          error: "Es läuft aktuell keine Runde."
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

      const champion = (state.champions || []).find(championItem => championItem.id === championId);

      if (!champion) {
        sendJson(res, 400, {
          error: "Champion ist nicht Teil der aktuellen Runde"
        });
        return;
      }

      const itemBuild = await getRandomItems(state.version, role, 6);

      if (!itemBuild.starterItem) {
        throw new Error(`Kein Starter Item für Rolle ${role} generiert`);
      }

      if (!Array.isArray(itemBuild.finalItems) || itemBuild.finalItems.length !== 6) {
        throw new Error(
          `Ungültiger Item Build für Rolle ${role}: erwartet 6 Full Items, erhalten ${itemBuild.finalItems?.length || 0}`
        );
      }

      const selections = state.selections || [];

      selections.push({
        playerName,
        role,
        champion,
        starterItem: itemBuild.starterItem,
        items: itemBuild.finalItems,
        selectedAt: new Date().toISOString()
      });

      const newState = {
        ...state,
        selections,
        updatedAt: new Date().toISOString()
      };

      await writeBraveryState(newState);
      sendJson(res, 200, newState);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/bravery/reset") {
      const newState = {
        version: null,
        champions: [],
        selections: [],
        createdAt: null,
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