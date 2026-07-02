import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function assertContains(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function assertNotContains(source, pattern, message) {
  if (pattern.test(source)) throw new Error(message);
}

const mediaCache = read("src/lib/media-cache.ts");
const mediaBackfill = read("src/lib/media-backfill.ts");
const types = read("src/lib/types.ts");
const config = read("src/lib/config.ts");
const transcription = read("src/lib/video-transcription.ts");
const openai = read("src/lib/openai.ts");
const crawlRoute = read("src/app/api/crawl/jobs/route.ts");
const linkRoute = read("src/app/api/crawl/links/route.ts");
const simpleRoute = read("src/app/api/simple/runs/route.ts");
const page = read("src/app/page.tsx");
const tikhub = read("src/lib/tikhub.ts");
const sourceLinkImport = read("src/lib/source-link-import.ts");
const simpleRuns = read("src/lib/simple-runs.ts");
const feishuImport = read("src/lib/feishu-content-import.ts");
const xiaopengBbs = read("src/lib/xiaopeng-bbs.ts");
const dongchedi = read("src/lib/dongchedi.ts");
const baseline = read("scripts/harness/check.ps1");
const searchedSources = [config, transcription, mediaCache, mediaBackfill, types].join("\n");

assertContains(types, /export type SourceVideoTranscript/, "SourceVideoTranscript metadata must be typed.");
assertContains(types, /videoTranscript\?: SourceVideoTranscript/, "NormalizedSourceItem must persist video transcript metadata.");
assertContains(types, /CrawlInput[\s\S]*enableVideoTranscription\?:\s*boolean/, "CrawlInput must persist the task-level video transcription switch.");
assertContains(types, /SimpleRunInput[\s\S]*enableVideoTranscription\?:\s*boolean/, "SimpleRunInput must persist the task-level video transcription switch.");

assertContains(config, /ARK_API_KEY/, "Ark video transcription API key must be environment-driven.");
assertContains(config, /VOLCENGINE_ASR_APP_KEY/, "Ark video transcription must accept the existing Volcengine app-key env alias.");
assertContains(config, /ARK_VIDEO_TRANSCRIPTION_MODEL/, "Ark video transcription model must be environment-driven.");
assertNotContains(searchedSources, new RegExp(["ARK", "AUDIO", "TRANSCRIPTION"].join("_")), "Deprecated Ark audio env config must be removed.");
assertNotContains(searchedSources, new RegExp(["ark", "Audio", "Transcription"].join("")), "Deprecated Ark audio appConfig fields must be removed.");
assertContains(config, /doubao-seed-2-0-lite-260428/, "Ark video transcription must default to the configured Ark Responses audio model.");
assertContains(config, /ARK_VIDEO_TRANSCRIPTION_PROMPT/, "Ark video transcription prompt must be environment-driven.");
assertContains(config, /请识别音频中的内容，以文字形式返回识别结果。/, "Ark video transcription prompt must target extracted audio recognition.");
assertContains(config, /ARK_VIDEO_TRANSCRIPTION_MAX_AUDIO_BYTES/, "Ark extracted-audio max-size knob must be environment-driven.");
assertContains(config, /ARK_VIDEO_TRANSCRIPTION_TIMEOUT_MS/, "Ark video timeout knob must be environment-driven.");
assertContains(config, /ARK_VIDEO_TRANSCRIPTION_UPLOAD_TIMEOUT_MS/, "Ark video upload timeout must be configurable independently.");
assertContains(config, /ARK_VIDEO_TRANSCRIPTION_AUDIO_EXTRACT_TIMEOUT_MS/, "ffmpeg audio extraction timeout must be configurable.");
assertContains(config, /volcengineAsrConfigured/, "Config status must expose Volcengine ASR readiness.");

assertContains(transcription, /transcribeVideoContent/, "Video transcription module must export the video transcription entry point.");
assertContains(transcription, /mergeTranscriptIntoContentText/, "Video transcription module must export source-body merge logic.");
assertContains(transcription, /extractAudioMp3FromVideo/, "Video transcription must extract MP3 audio from the cached local video before upload.");
assertContains(transcription, /execFile\("ffmpeg"/, "Video transcription must use ffmpeg to extract MP3 audio.");
assertContains(transcription, /uploadAudioFileToArk/, "Video transcription must upload the extracted MP3 audio to Ark Files.");
assertContains(transcription, /purpose[\s\S]*user_data/, "Ark file upload must use purpose=user_data.");
assertNotContains(transcription, /preprocess_configs\[video\]\[fps\]/, "Audio transcription upload must not request video preprocessing.");
assertContains(transcription, /file_id/, "Ark Responses request must reference the uploaded file_id.");
assertContains(transcription, /input_audio/, "Ark Responses request must send input_audio content.");
assertNotContains(transcription, /input_video/, "Ark Responses request must not send input_video for speech recognition.");
assertContains(transcription, /input_text/, "Ark Responses request must send an explicit transcription instruction.");
assertContains(transcription, /audio\/mpeg/, "Ark file upload must label the extracted MP3 as audio/mpeg.");
assertContains(transcription, /Ark audio file upload completed/, "Ark upload success should be logged before Responses transcription starts.");
assertContains(transcription, /Ark audio file upload timed out/, "Ark upload timeout errors should identify the upload phase.");
assertContains(transcription, /Ark Responses audio transcription timed out/, "Ark Responses timeout errors should identify the Responses phase.");
assertContains(transcription, /Authorization[\s\S]*Bearer/, "Ark requests must use Bearer token authorization.");
assertContains(transcription, /provider:[\s\S]*"ark_video"/, "New transcript metadata must identify the Ark video provider.");

assertNotContains(mediaCache, /cacheVideoAudio/, "Media cache must leave audio extraction inside the transcription module.");
assertContains(mediaCache, /transcribeVideoContent/, "Media cache must call the video transcription module with the cached video path.");
assertContains(mediaCache, /mergeTranscriptIntoContentText/, "Media cache must merge successful transcript text into source contentText.");
assertContains(mediaCache, /videoTranscript/, "Media cache must persist transcript metadata on the source item.");
assertContains(mediaCache, /export type CacheCrawledMediaOptions[\s\S]*enableVideoTranscription\?:\s*boolean/, "Media cache must expose an explicit transcription option.");
assertContains(mediaCache, /options\.enableVideoTranscription === true[\s\S]*isArkVideoTranscriptionConfigured\(\)[\s\S]*videoTranscript\?\.status !== "success"/, "Media cache must only transcribe when the task explicitly enables video transcription and Ark is configured.");

assertContains(crawlRoute, /enableVideoTranscription\?:\s*boolean/, "Advanced crawl API must accept the video transcription switch.");
assertContains(crawlRoute, /enableVideoTranscription:\s*body\.enableVideoTranscription === true/, "Advanced crawl API must default video transcription off.");
assertContains(linkRoute, /enableVideoTranscription\?:\s*boolean/, "Source-link API must accept the video transcription switch.");
assertContains(linkRoute, /enableVideoTranscription:\s*body\.enableVideoTranscription === true/, "Source-link API must default video transcription off.");
assertContains(simpleRoute, /enableVideoTranscription\?:\s*boolean/, "Simple run API must accept the video transcription switch.");
assertContains(simpleRoute, /enableVideoTranscription:\s*body\.enableVideoTranscription === true/, "Simple run API must default video transcription off.");
assertContains(page, /simpleEnableVideoTranscription/, "Simple UI must keep video transcription switch state.");
assertContains(page, /crawlEnableVideoTranscription/, "Advanced keyword crawl UI must keep video transcription switch state.");
assertContains(page, /linkImportEnableVideoTranscription/, "Advanced link import UI must keep video transcription switch state.");
assertContains(page, /enableVideoTranscription:\s*simpleEnableVideoTranscription/, "Simple start request must send the video transcription switch.");
assertContains(page, /enableVideoTranscription:\s*crawlEnableVideoTranscription/, "Keyword crawl request must send the video transcription switch.");
assertContains(page, /enableVideoTranscription:\s*linkImportEnableVideoTranscription/, "Link import request must send the video transcription switch.");
assertContains(tikhub, /enableVideoTranscription\?:\s*boolean/, "TikHub source-link input must carry the video transcription switch.");
assertContains(tikhub, /cacheCrawledMedia\(filteredItems,\s*\{\s*enableVideoTranscription:\s*input\.enableVideoTranscription === true\s*\}\)/, "Keyword crawl must pass the video transcription switch to media caching.");
assertContains(tikhub, /cacheCrawledMedia\(normalizedItems,\s*\{\s*enableVideoTranscription:\s*input\.enableVideoTranscription === true\s*\}\)/, "TikHub source-link import must pass the video transcription switch to media caching.");
assertContains(sourceLinkImport, /enableVideoTranscription\?:\s*boolean/, "Source-link import inputs must carry the video transcription switch.");
assertContains(sourceLinkImport, /enableVideoTranscription:\s*input\.enableVideoTranscription === true/, "Source-link import must forward explicit transcription opt-in.");
assertContains(simpleRuns, /enableVideoTranscription:\s*input\.enableVideoTranscription === true/, "Simple run normalization must default video transcription off.");
assertContains(simpleRuns, /enableVideoTranscription:\s*normalizedInput\.enableVideoTranscription === true/, "Simple link collection must forward explicit transcription opt-in.");
assertContains(simpleRuns, /importFeishuContentByTaskNumbers\(taskNumbers,\s*\{\s*enableVideoTranscription:\s*normalizedInput\.enableVideoTranscription === true\s*\}\)/, "Simple Feishu import must forward explicit transcription opt-in.");
assertContains(feishuImport, /enableVideoTranscription\?:\s*boolean/, "Feishu content import must accept the video transcription switch.");
assertContains(feishuImport, /cacheCrawledMedia\(importedItems,\s*\{\s*enableVideoTranscription:\s*options\.enableVideoTranscription === true\s*\}\)/, "Feishu content import must pass the video transcription switch to media caching.");
assertContains(xiaopengBbs, /enableVideoTranscription\?:\s*boolean/, "Xiaopeng BBS import must accept the video transcription switch.");
assertContains(dongchedi, /enableVideoTranscription\?:\s*boolean/, "Dongchedi import must accept the video transcription switch.");

assertContains(mediaBackfill, /videoTranscript/, "Media backfill must preserve or update transcript metadata when refreshing media.");
assertContains(openai, /input\.source\.contentText/, "Generated copy must continue using the source contentText that now contains video transcripts.");
assertContains(baseline, /video_transcription_check\.mjs/, "Harness baseline must include the video transcription check.");

console.log("Video transcription check passed.");
