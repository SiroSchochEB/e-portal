const http = require("http");
const fs = require("fs/promises");
const path = require("path");

const PORT = process.env.PORT || 8080;
const RIOT_API_KEY = process.env.RIOT_API_KEY;
const ACCOUNTS_FILE = process.env.ACCOUNTS_FILE || path.join(__dirname, "data", "accounts.json");
const INDEX_FILE = path.join(__dirname, "index.html");

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

  if (!entry) {
    return 0;
  }

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
    throw new Error(`Riot API Fehler ${response.status}: ${text}`);
  }

  if (!text) {
    return null;
  }

  return JSON.parse(text);
}

async function getAccountRankData(account) {
  const regional = regionalRoute[account.region];

  if (!regional) {
    throw new Error(`Unbekannte Region: ${account.region}`);
  }

  console.log(`Verarbeite Account: ${account.label} (${account.gameName}#${account.tagLine})`);

  const riotAccount = await riotFetch(
    `https://${regional}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(account.gameName)}/${encodeURIComponent(account.tagLine)}`
  );

  if (!riotAccount || !riotAccount.puuid) {
    throw new Error(`Keine PUUID gefunden für ${account.gameName}#${account.tagLine}`);
  }

  const leagues = await riotFetch(
    `https://${account.region}.api.riotgames.com/lol/league/v4/entries/by-puuid/${riotAccount.puuid}`
  );

  const soloq = leagues.find(x => x.queueType === "RANKED_SOLO_5x5");
  const flex = leagues.find(x => x.queueType === "RANKED_FLEX_SR");

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
      flexScore: data.flex.score
    });
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

  if (!label) {
    throw new Error("Label fehlt");
  }

  if (!region) {
    throw new Error("Region fehlt");
  }

  if (!regionalRoute[region]) {
    throw new Error(`Region wird nicht unterstützt: ${region}`);
  }

  if (!gameName) {
    throw new Error("Game Name fehlt");
  }

  if (!tagLine) {
    throw new Error("Tagline fehlt");
  }

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

  const exists = accounts.some(acc =>
    acc.region.toLowerCase() === newAccount.region &&
    acc.gameName.toLowerCase() === newAccount.gameName.toLowerCase() &&
    acc.tagLine.toLowerCase() === newAccount.tagLine.toLowerCase()
  );

  if (exists) {
    throw new Error("Dieser Account ist bereits vorhanden");
  }

  accounts.push(newAccount);
  await writeAccounts(accounts);

  return newAccount;
}

async function deleteAccount(input) {
  const region = String(input.region || "").trim().toLowerCase();
  const gameName = String(input.gameName || "").trim().toLowerCase();
  const tagLine = String(input.tagLine || "").trim().toLowerCase();

  const accounts = await readAccounts();

  const filtered = accounts.filter(acc => {
    return !(
      acc.region.toLowerCase() === region &&
      acc.gameName.toLowerCase() === gameName &&
      acc.tagLine.toLowerCase() === tagLine
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

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });

  res.end(JSON.stringify(data, null, 2));
}

async function sendIndex(res) {
  const html = await fs.readFile(INDEX_FILE, "utf8");
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8"
  });
  res.end(html);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/") {
      await sendIndex(res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/accounts") {
      try {
        const data = await getAccountsWithRank();
        sendJson(res, 200, data);
      } catch (error) {
        console.error("Backend Fehler:", error.message);
        console.error(error.stack);

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
      error: "Interner Serverfehler"
    });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`LoL Rank Dashboard läuft auf Port ${PORT}`);
});
