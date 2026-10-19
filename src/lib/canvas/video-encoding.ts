/** H.264 output policy; filters, decoding and audio remain caller-owned. */
export function canvasVideoEncodingArgs(options: { crf?: number; preset?: string } = {}): string[] {
  const encoder = process.env.FFMPEG_VIDEO_ENCODER?.trim() || "libx264";
  if (encoder === "h264_nvenc") {
    // CQ and CRF use different encoders' quality scales, not identical output bytes.
    return ["-c:v", encoder, "-preset", "p5", "-tune", "hq", "-rc", "vbr", "-cq", String(options.crf ?? 23), "-b:v", "0"];
  }
  if (encoder !== "libx264") {
    throw new Error("FFMPEG_VIDEO_ENCODER must be libx264 or h264_nvenc.");
  }
  return ["-c:v", encoder,
    ...(options.preset ? ["-preset", options.preset] : []),
    ...(options.crf !== undefined ? ["-crf", String(options.crf)] : []),
  ];
}
