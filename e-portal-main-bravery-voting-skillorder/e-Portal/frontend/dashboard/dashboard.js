let currentAccounts = [];

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
      score: account.flexScore
    };
  }

  return {
    tier: account.tier,
    rank: account.rank,
    lp: account.lp,
    wins: account.wins,
    losses: account.losses,
    score: account.score
  };
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

    const lpPercent = Math.max(0, Math.min(100, queueData.lp || 0));
    const placeClass = index === 0 ? "place first" : "place";

    return `
      <tr>
        <td>
          <div class="${placeClass}">${index + 1}</div>
        </td>

        <td>
          <div class="account">
            <strong>${escapeHtml(account.label)}</strong>
            <span>${escapeHtml(account.riotId)} · ${escapeHtml(account.region)}</span>
          </div>
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

        <td>
          <div class="progress">
            <div class="progress-bar" style="width: ${lpPercent}%;"></div>
          </div>
        </td>

        <td>${queueData.score || 0}</td>

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

async function loadAccounts() {
  const status = document.getElementById("status");
  const errorBox = document.getElementById("error");
  const table = document.getElementById("table");

  try {
    errorBox.innerHTML = "";
    status.textContent = "Lade Accounts...";

    const response = await fetch("/api/accounts");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Fehler beim Laden der Accounts");
    }

    currentAccounts = data;
    renderTable();

    status.textContent = "Letztes Update: " + new Date().toLocaleTimeString();
  } catch (error) {
    table.style.display = "none";
    status.textContent = "Fehler beim Laden";
    errorBox.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
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

  await loadAccounts();
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

  await loadAccounts();
}

document.getElementById("queueSelect").addEventListener("change", renderTable);
document.getElementById("addAccountForm").addEventListener("submit", addAccount);
document.getElementById("refreshButton").addEventListener("click", loadAccounts);

loadAccounts();
setInterval(loadAccounts, 5 * 60 * 1000);