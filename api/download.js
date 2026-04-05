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
    const info = await yt.getBasicInfo(videoId, { client: "ANDROID" });

    const title = info.basic_info?.title || "video";
    const thumbnail =
      info.basic_info?.thumbnail?.[0]?.url ||
      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    const duration = info.basic_info?.duration || 0;
    const author = info.basic_info?.author || "Unknown";

    // Find best 360p format (video+audio combined)
    const formats = info.streaming_data?.formats || [];
    const adaptiveFormats = info.streaming_data?.adaptive_formats || [];
    const allFormats = [...formats, ...adaptiveFormats];

    // Priority: 360p mp4 with audio (combined), else closest
    let chosen =
      allFormats.find(
        (f) =>
          f.quality_label === "360p" &&
          f.mime_type?.includes("video/mp4") &&
          f.has_audio
      ) ||
      allFormats.find(
        (f) => f.quality_label === "360p" && f.mime_type?.includes("video/mp4")
      ) ||
      allFormats.find((f) => f.quality_label === "360p") ||
      formats[0]; // fallback to first combined format

    if (!chosen || !chosen.url) {
      return res.status(404).json({ error: "No downloadable format found. Video may be restricted." });
    }

    return res.status(200).json({
      title,
      author,
      thumbnail,
      duration,
      videoId,
      downloadUrl: chosen.url,
      quality: chosen.quality_label || "360p",
      mimeType: chosen.mime_type || "video/mp4",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch video info: " + err.message });
  }
}
