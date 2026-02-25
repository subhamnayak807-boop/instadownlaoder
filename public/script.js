const form = document.getElementById("video-form");
const urlInput = document.getElementById("video-url");
const fetchBtn = document.getElementById("fetch-btn");
const statusEl = document.getElementById("status");
const resultSection = document.getElementById("result");
const metaEl = document.getElementById("video-meta");
const listEl = document.getElementById("download-list");

function formatDuration(totalSeconds) {
  const seconds = Number(totalSeconds || 0);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function setLoading(isLoading) {
  fetchBtn.disabled = isLoading;
  fetchBtn.textContent = isLoading ? "Fetching..." : "Get Formats";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const url = urlInput.value.trim();
  if (!url) return;

  setLoading(true);
  statusEl.textContent = "";
  resultSection.classList.add("hidden");
  metaEl.innerHTML = "";
  listEl.innerHTML = "";

  try {
    const response = await fetch("/api/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Could not fetch video information.");
    }

    metaEl.innerHTML = `
      ${data.thumbnail ? `<img src="${data.thumbnail}" alt="thumbnail" />` : ""}
      <div>
        <h3>${data.title}</h3>
        <p>${data.author} • ${formatDuration(data.lengthSeconds)}</p>
      </div>
    `;

    data.options.forEach((option) => {
      const li = document.createElement("li");
      const details = `${option.qualityLabel} • ${option.fps || "?"}fps • MP4`;
      const downloadUrl = `/api/download?url=${encodeURIComponent(url)}&formatId=${encodeURIComponent(option.formatId)}`;

      li.innerHTML = `
        <span>${details}</span>
        <a href="${downloadUrl}">Download</a>
      `;
      listEl.appendChild(li);
    });

    resultSection.classList.remove("hidden");
  } catch (error) {
    statusEl.textContent = error.message;
  } finally {
    setLoading(false);
  }
});
