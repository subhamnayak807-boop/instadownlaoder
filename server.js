const express = require("express");
const path = require("path");
const { spawn } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3000;
const PYTHON_BIN = path.join(__dirname, ".venv", "bin", "python");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function isInstagramUrl(url) {
  return /^https?:\/\/(www\.)?instagram\.com\/(reel|p|tv)\//i.test(url);
}

function buildFormatOptions(formats) {
  const videoWithAudio = formats
    .filter((f) => f.ext === "mp4" && f.vcodec !== "none" && f.acodec !== "none" && f.format_id)
    .map((f) => {
      const height = Number(f.height || 0);
      return {
        formatId: f.format_id,
        qualityLabel: height > 0 ? `${height}p` : f.format_note || "SD",
        fps: f.fps || null,
        height,
        tbr: Number(f.tbr || 0)
      };
    });

  const uniqueByQuality = new Map();
  for (const format of videoWithAudio) {
    const key = format.qualityLabel;
    const existing = uniqueByQuality.get(key);
    if (!existing || format.tbr > existing.tbr) {
      uniqueByQuality.set(key, format);
    }
  }

  return Array.from(uniqueByQuality.values()).sort((a, b) => {
    if (b.height !== a.height) return b.height - a.height;
    return b.tbr - a.tbr;
  });
}

function runYtDlpJson(url) {
  return new Promise((resolve, reject) => {
    const args = ["-m", "yt_dlp", "--dump-single-json", "--no-playlist", "--", url];
    const proc = spawn(PYTHON_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    proc.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `yt-dlp exited with ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error("Failed to parse format metadata from yt-dlp."));
      }
    });
  });
}

app.post("/api/info", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || !isInstagramUrl(url)) {
      return res.status(400).json({ error: "Please provide a valid Instagram reel/post URL." });
    }

    const info = await runYtDlpJson(url);
    const options = buildFormatOptions(info.formats);

    if (!options.length) {
      return res.status(404).json({ error: "No downloadable formats found." });
    }

    res.json({
      title: info.title || "Instagram Video",
      author: info.uploader || info.channel || "Unknown",
      lengthSeconds: info.duration || 0,
      thumbnail: info.thumbnail || null,
      options
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch video information.",
      details: error.message
    });
  }
});

app.get("/api/download", async (req, res) => {
  try {
    const { url, formatId } = req.query;
    if (!url || !formatId || !isInstagramUrl(url)) {
      return res.status(400).json({ error: "Missing or invalid url/formatId." });
    }

    const info = await runYtDlpJson(url);
    const selected = (info.formats || []).find((f) => String(f.format_id) === String(formatId));

    if (!selected) {
      return res.status(404).json({ error: "Requested format was not found." });
    }

    const safeTitle = String(info.title || "instagram-video")
      .replace(/[^\w\s.-]/g, "")
      .trim() || "instagram-video";
    const qualityLabel = selected.height ? `${selected.height}p` : "video";
    const ext = selected.ext || "mp4";
    res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}-${qualityLabel}.${ext}"`);
    res.setHeader("Content-Type", "video/mp4");

    const args = [
      "-m",
      "yt_dlp",
      "--no-playlist",
      "-f",
      String(formatId),
      "-o",
      "-",
      "--",
      url
    ];
    const proc = spawn(PYTHON_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";

    proc.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    proc.on("error", () => {
      if (!res.headersSent) {
        res.status(500).json({ error: "Download failed.", details: "Failed to run yt-dlp." });
      }
    });
    proc.on("close", (code) => {
      if (code !== 0 && !res.headersSent) {
        res.status(500).json({ error: "Download failed.", details: stderr || `yt-dlp exited with ${code}` });
      }
    });

    proc.stdout.pipe(res);
  } catch (error) {
    res.status(500).json({
      error: "Download failed.",
      details: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
