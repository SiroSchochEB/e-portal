let currentAccounts = [];
let accountLoadInProgress = false;

function setAccountPanelLoading(isLoading, label = "Aktualisiere...") {
  const panel = document.getElementById("accountsPanel");
  const refreshButton = document.getElementById("refreshButton");

  if (panel) {
    panel.classList.toggle("is-loading", isLoading);
    panel.setAttribute("aria-busy", isLoading ? "true" : "false");
  }

  if (!refreshButton) {
    return;
  }

  refreshButton.disabled = isLoading;
  refreshButton.classList.toggle("is-loading", isLoading);

  if (isLoading) {
    refreshButton.innerHTML = `<span class="button-spinner" aria-hidden="true"></span><span>${escapeHtml(label)}</span>`;
  } else {
    refreshButton.textContent = "Aktualisieren";
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getWinrate(wins, losses) {
  const games = wins + losses;

  if (games === 0) {
    return "-";
  }

  return ((wins / games) * 100).toFixed(1) + "%";
}

function getRankClass(tier) {
  return "rank-" + String(tier || "unranked").toLowerCase();
}

function getQueueData(account, queue) {
  if (queue === "flex") {
    return {
      tier: account.flexTier,
      rank: account.flexRank,
      lp: account.flexLp,
      wins: account.flexWins,
      losses: account.flexLosses,
      score: account.flexScore,
      dailyChange: account.flexDailyChange || 0,
      lpHistory: account.flexLpHistory || [],
      recentMatches: account.flexRecentMatches || []
    };
  }

  return {
    tier: account.tier,
    rank: account.rank,
    lp: account.lp,
    wins: account.wins,
    losses: account.losses,
    score: account.score,
    dailyChange: account.dailyChange || 0,
    lpHistory: account.lpHistory || [],
    recentMatches: account.recentMatches || []
  };
}

function getDeepLolRegion(region) {
  const regionMap = {
    euw1: "euw",
    eun1: "eune",
    na1: "na",
    kr: "kr",
    jp1: "jp",
    tr1: "tr",
    br1: "br",
    la1: "lan",
    la2: "las"
  };

  return regionMap[String(region || "").toLowerCase()] || String(region || "").toLowerCase();
}

function getDeepLolUrl(account) {
  const region = getDeepLolRegion(account.region);
  const summoner = `${account.gameName || ""}-${account.tagLine || ""}`;

  return `https://www.deeplol.gg/summoner/${encodeURIComponent(region)}/${encodeURIComponent(summoner)}`;
}

function renderDailyChange(change) {
  const value = Number(change) || 0;
  const changeClass = value > 0
    ? "daily-change positive"
    : value < 0
      ? "daily-change negative"
      : "daily-change neutral";
  const label = value > 0
    ? `+${value} LP`
    : value < 0
      ? `${value} LP`
      : "±0 LP";

  return `<span class="${changeClass}">${escapeHtml(label)}</span>`;
}

function getDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getLastDateKeys(count) {
  const result = [];
  const today = new Date();

  for (let offset = count - 1; offset >= 0; offset--) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    result.push(getDateKey(date));
  }

  return result;
}

function getSparklinePoints(history, currentScore, dailyChange) {
  const dateKeys = getLastDateKeys(14);
  const historyByDate = new Map(
    (history || [])
      .filter(entry => entry && entry.date && Number.isFinite(Number(entry.score)))
      .map(entry => [entry.date, Number(entry.score)])
  );
  const actualValues = dateKeys
    .filter(dateKey => historyByDate.has(dateKey))
    .map(dateKey => historyByDate.get(dateKey));
  const values = [];
  let lastKnownValue = null;

  for (const dateKey of dateKeys) {
    if (historyByDate.has(dateKey)) {
      lastKnownValue = historyByDate.get(dateKey);
    }

    values.push(lastKnownValue);
  }

  if (actualValues.length >= 2) {
    return {
      values,
      mode: "history"
    };
  }

  const safeCurrentScore = Number(currentScore);
  const safeDailyChange = Number(dailyChange) || 0;

  if (Number.isFinite(safeCurrentScore) && safeDailyChange !== 0) {
    const syntheticValues = Array(14).fill(null);
    syntheticValues[12] = safeCurrentScore - safeDailyChange;
    syntheticValues[13] = safeCurrentScore;

    return {
      values: syntheticValues,
      mode: "today"
    };
  }

  return {
    values,
    mode: "pending"
  };
}

function renderLpSparkline(history, currentScore, dailyChange) {
  const { values, mode } = getSparklinePoints(history, currentScore, dailyChange);
  const numericValues = values.filter(value => Number.isFinite(value));

  if (numericValues.length === 0) {
    return `<div class="sparkline-empty">Keine Daten</div>`;
  }

  if (numericValues.length === 1 && mode === "pending") {
    return `<div class="sparkline-empty" title="Noch nicht genug gespeicherte Tageswerte für einen Verlauf.">No data</div>`;
  }

  const width = 124;
  const height = 34;
  const padding = 4;
  const min = Math.min(...numericValues);
  const max = Math.max(...numericValues);
  const spread = max - min || 1;
  const pointDistance = (width - padding * 2) / Math.max(values.length - 1, 1);
  let path = "";
  const points = [];
  let lastPoint = null;

  values.forEach((value, index) => {
    if (!Number.isFinite(value)) {
      return;
    }

    const x = padding + index * pointDistance;
    const y = height - padding - ((value - min) / spread) * (height - padding * 2);
    const command = lastPoint ? "L" : "M";

    path += `${command}${x.toFixed(1)} ${y.toFixed(1)} `;
    lastPoint = { x, y };
    points.push(lastPoint);
  });

  if (!path && numericValues.length === 1) {
    const y = height / 2;
    path = `M${padding} ${y.toFixed(1)} L${(width - padding).toFixed(1)} ${y.toFixed(1)}`;
  }

  const latest = numericValues[numericValues.length - 1];
  const first = numericValues[0];
  const trendClass = latest > first
    ? "positive"
    : latest < first
      ? "negative"
      : "neutral";
  const title = mode === "today"
    ? `Heute: ${first} → ${latest} Score`
    : `14 Tage: ${first} → ${latest} Score`;

  return `
    <svg class="sparkline ${trendClass}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)}">
      <title>${escapeHtml(title)}</title>
      <path d="${escapeHtml(path.trim())}" />
      ${points.map(point => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="2" />`).join("")}
    </svg>
  `;
}

function renderRecentMatches(matches) {
  const safeMatches = Array.isArray(matches) ? matches.slice(0, 5) : [];

  if (safeMatches.length === 0) {
    return `<span class="recent-empty">Keine Daten</span>`;
  }

  return `
    <div class="recent-champs">
      ${safeMatches.map(match => {
        const resultClass = match.win === true
          ? "win"
          : match.win === false
            ? "loss"
            : "unknown";
        const resultLabel = match.win === true
          ? "Win"
          : match.win === false
            ? "Loss"
            : "Unbekannt";
        const badge = String(match.badge || "").toUpperCase();
        const titleParts = [match.championName || "Unbekannter Champion", resultLabel];

        if (badge === "MVP" || badge === "ACE") {
          titleParts.push(badge);
        }

        return `
          <span class="champ-match ${resultClass}" title="${escapeHtml(titleParts.join(" · "))}">
            ${match.championIconUrl
              ? `<img src="${escapeHtml(match.championIconUrl)}" alt="${escapeHtml(match.championName || "Champion")}" loading="lazy" />`
              : `<span class="champ-fallback">?</span>`}
            ${badge === "MVP" || badge === "ACE"
              ? `<span class="match-badge ${badge.toLowerCase()}">${escapeHtml(badge)}</span>`
              : ""}
          </span>
        `;
      }).join("")}
    </div>
  `;
}

function renderStats(accounts) {
  const queue = document.getElementById("queueSelect").value;
  const totalAccounts = accounts.length;
  const best = accounts[0];

  let totalWins = 0;
  let totalLosses = 0;

  for (const account of accounts) {
    const queueData = getQueueData(account, queue);

    totalWins += queueData.wins || 0;
    totalLosses += queueData.losses || 0;
  }

  const totalGames = totalWins + totalLosses;
  const averageWinrate = totalGames > 0
    ? ((totalWins / totalGames) * 100).toFixed(1) + "%"
    : "-";

  document.getElementById("statAccounts").textContent = totalAccounts;
  document.getElementById("statBest").textContent = best ? best.label : "-";
  document.getElementById("statWinrate").textContent = averageWinrate;
  document.getElementById("statGames").textContent = totalGames;
}

function renderTable() {
  const queue = document.getElementById("queueSelect").value;
  const table = document.getElementById("table");
  const empty = document.getElementById("empty");
  const tbody = document.getElementById("accounts");

  const rows = [...currentAccounts].sort((a, b) => {
    return getQueueData(b, queue).score - getQueueData(a, queue).score;
  });

  renderStats(rows);

  if (rows.length === 0) {
    table.style.display = "none";
    empty.style.display = "block";
    tbody.innerHTML = "";
    return;
  }

  tbody.innerHTML = rows.map((account, index) => {
    const queueData = getQueueData(account, queue);
    const rankText = queueData.tier === "UNRANKED"
      ? "UNRANKED"
      : `${queueData.tier} ${queueData.rank}`;

    const placeClass = ["place", index === 0 ? "first" : "", account.inGame ? "in-game" : ""]
      .filter(Boolean)
      .join(" ");
    const placeTitle = account.inGame
      ? `Aktuell ingame${account.gameMode ? ` · ${account.gameMode}` : ""}`
      : "Nicht ingame";
    const deepLolUrl = getDeepLolUrl(account);

    return `
      <tr>
        <td>
          <div class="${placeClass}" title="${escapeHtml(placeTitle)}">${index + 1}</div>
        </td>

        <td>
          <a class="account account-link" href="${escapeHtml(deepLolUrl)}" target="_blank" rel="noopener noreferrer" title="Auf Deeplol öffnen">
            <strong>${escapeHtml(account.label)}</strong>
            <span>${escapeHtml(account.riotId)} · ${escapeHtml(account.region)}</span>
          </a>
        </td>

        <td>
          <span class="rank-badge ${getRankClass(queueData.tier)}">
            <span class="rank-dot"></span>
            ${escapeHtml(rankText)}
          </span>
        </td>

        <td class="lp">${queueData.lp || 0} LP</td>

        <td>
          <div class="wl">
            <span class="wins">${queueData.wins || 0}W</span>
            <span>/</span>
            <span class="losses">${queueData.losses || 0}L</span>
          </div>
        </td>

        <td>${getWinrate(queueData.wins || 0, queueData.losses || 0)}</td>

        <td>${renderDailyChange(queueData.dailyChange)}</td>

        <td>${renderLpSparkline(queueData.lpHistory, queueData.score, queueData.dailyChange)}</td>

        <td>${renderRecentMatches(queueData.recentMatches)}</td>

        <td>
          <button
            type="button"
            class="delete-btn"
            data-region="${escapeHtml(account.region)}"
            data-game-name="${escapeHtml(account.gameName)}"
            data-tag-line="${escapeHtml(account.tagLine)}"
          >
            Löschen
          </button>
        </td>
      </tr>
    `;
  }).join("");

  document.querySelectorAll(".delete-btn").forEach(button => {
    button.addEventListener("click", () => {
      deleteAccount(
        button.dataset.region,
        button.dataset.gameName,
        button.dataset.tagLine
      );
    });
  });

  table.style.display = "table";
  empty.style.display = "none";
}

async function loadAccounts(forceRefresh = false) {
  if (accountLoadInProgress) {
    return;
  }

  accountLoadInProgress = true;

  const status = document.getElementById("status");
  const errorBox = document.getElementById("error");
  const table = document.getElementById("table");
  const empty = document.getElementById("empty");
  const queue = document.getElementById("queueSelect").value;
  const params = new URLSearchParams({ queue });

  if (forceRefresh) {
    params.set("refresh", "1");
  }

  setAccountPanelLoading(true, forceRefresh ? "Aktualisiere..." : "Lade...");

  try {
    errorBox.innerHTML = "";
    status.textContent = forceRefresh ? "Aktualisiere Accounts..." : "Lade Accounts...";

    const response = await fetch(`/api/accounts?${params.toString()}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Fehler beim Laden der Accounts");
    }

    currentAccounts = data;
    renderTable();

    status.textContent = "Letztes Update: " + new Date().toLocaleTimeString();
  } catch (error) {
    status.textContent = "Fehler beim Laden";
    errorBox.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;

    if (currentAccounts.length === 0) {
      table.style.display = "none";
      empty.style.display = "block";
    }
  } finally {
    accountLoadInProgress = false;
    setAccountPanelLoading(false);
  }
}

async function addAccount(event) {
  event.preventDefault();

  const label = document.getElementById("labelInput").value.trim();
  const region = document.getElementById("regionInput").value.trim();
  const gameName = document.getElementById("gameNameInput").value.trim();
  const tagLine = document.getElementById("tagLineInput").value.trim();

  const response = await fetch("/api/accounts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      label,
      region,
      gameName,
      tagLine
    })
  });

  const data = await response.json();

  if (!response.ok) {
    alert(data.error || "Account konnte nicht hinzugefügt werden");
    return;
  }

  document.getElementById("addAccountForm").reset();

  await loadAccounts(true);
}

async function deleteAccount(region, gameName, tagLine) {
  const confirmed = confirm(`Account ${gameName}#${tagLine} wirklich löschen?`);

  if (!confirmed) {
    return;
  }

  const response = await fetch("/api/accounts", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      region,
      gameName,
      tagLine
    })
  });

  const data = await response.json();

  if (!response.ok) {
    alert(data.error || "Account konnte nicht gelöscht werden");
    return;
  }

  await loadAccounts(true);
}

document.getElementById("queueSelect").addEventListener("change", () => loadAccounts(false));
document.getElementById("addAccountForm").addEventListener("submit", addAccount);
document.getElementById("refreshButton").addEventListener("click", () => loadAccounts(true));

loadAccounts(false);
setInterval(() => loadAccounts(false), 5 * 60 * 1000);
