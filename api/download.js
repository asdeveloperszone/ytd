import { Innertube } from "youtubei.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Missing url parameter" });

  // Extract video ID
  let videoId;
  try {
    const parsed = new URL(url);
    videoId =
      parsed.searchParams.get("v") ||
      (parsed.hostname === "youtu.be" ? parsed.pathname.slice(1) : null);
    if (!videoId) throw new Error("No video ID");
  } catch {
    return res.status(400).json({ error: "Invalid YouTube URL" });
  }

  try {
    const yt = await Innertube.create({ retrieve_player: true });
    const info = await yt.getInfo(videoId);

    const title = info.basic_info?.title || "video";
    const thumbnail =
      info.basic_info?.thumbnail?.[0]?.url ||
      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    const duration = info.basic_info?.duration || 0;
    const author = info.basic_info?.author || "Unknown";

    // Use choose_format to get a deciphered format
    let chosen;
    try {
      chosen = info.chooseFormat({ quality: "360p", type: "video+audio" });
    } catch (_) {
      try {
        chosen = info.chooseFormat({ quality: "best", type: "video+audio" });
      } catch (_) {
        chosen = null;
      }
    }

    // Fallback: scan streaming_data manually
    if (!chosen) {
      const formats = [
        ...(info.streaming_data?.formats || []),
        ...(info.streaming_data?.adaptive_formats || []),
      ];
      chosen =
        formats.find((f) => f.quality_label === "360p" && f.mime_type?.includes("video/mp4")) ||
        formats.find((f) => f.quality_label === "360p") ||
        formats.find((f) => f.mime_type?.includes("video/mp4")) ||
        formats[0];
    }

    if (!chosen) {
      return res.status(404).json({ error: "No format found for this video." });
    }

    // Decipher the URL
    let downloadUrl;
    try {
      downloadUrl = await info.getStreamingData(chosen);
    } catch (_) {
      downloadUrl = chosen.decipher?.(yt.session.player) || chosen.url;
    }

    if (!downloadUrl) {
      return res.status(404).json({ error: "Could not get download URL. Video may be restricted." });
    }

    return res.status(200).json({
      title,
      author,
      thumbnail,
      duration,
      videoId,
      downloadUrl,
      quality: chosen.quality_label || "360p",
      mimeType: chosen.mime_type || "video/mp4",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed: " + err.message });
  }
}
