const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');

const BASE_URL = process.env.VIDEOAGENT_BASE_URL || 'http://127.0.0.1:3001';
const OUT_DIR = path.join(process.cwd(), 'outputs', 'xiaopeng-love-history-3min-v2');
const ASSET_PROMPTS_PATH = path.join(OUT_DIR, 'asset_prompts.json');
const SCRIPT_PATH = path.join(OUT_DIR, 'script.md');
const MANIFEST_PATH = path.join(OUT_DIR, 'render-manifest.json');
const CLIP_DIR = path.join(OUT_DIR, 'clips');
const FINAL_PATH = path.join(OUT_DIR, 'xiaopeng-love-history-v2-3min.mp4');
const RAW_CONCAT_PATH = path.join(OUT_DIR, 'xiaopeng-love-history-v2-raw-concat.mp4');
const CONCAT_LIST_PATH = path.join(OUT_DIR, 'concat-list.txt');
const CAPTIONS_PATH = path.join(OUT_DIR, 'captions.srt');

const RATE_LIMIT_WAIT_MS = Number(process.env.VIDEO_RATE_LIMIT_WAIT_MS || 65000);
const POLL_ROUNDS = Number(process.env.VIDEO_POLL_ROUNDS || 8);
const SUBMIT_TIMEOUT_MS = Number(process.env.VIDEO_SUBMIT_TIMEOUT_MS || 120000);
const STATUS_TIMEOUT_MS = Number(process.env.VIDEO_STATUS_TIMEOUT_MS || 60000);
const DOWNLOAD_TIMEOUT_MS = Number(process.env.VIDEO_DOWNLOAD_TIMEOUT_MS || 180000);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { ...options, maxBuffer: 1024 * 1024 * 20 }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`request timeout after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (_) {
    return false;
  }
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2));
}

function numberFromValue(value, fallback = 0) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function stringList(value) {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap((item) => stringList(item));
  return [];
}

function parseCaptions(scriptText) {
  const sections = scriptText.split(/\n###\s+/).slice(1);
  const captions = new Map();
  for (const section of sections) {
    const idMatch = section.match(/^(\d{2})｜([^\n]+)/);
    const captionMatch = section.match(/纯中文字幕：([^\n]+)/);
    const voiceMatch = section.match(/旁白：([^\n]+)/);
    if (!idMatch) continue;
    captions.set(Number(idMatch[1]), (captionMatch?.[1] || voiceMatch?.[1] || idMatch[2]).trim());
  }
  return captions;
}

async function buildFreshManifest(previous = null) {
  const assetPrompts = await readJson(ASSET_PROMPTS_PATH);
  if (!assetPrompts?.prompts?.length) throw new Error(`No prompts found in ${ASSET_PROMPTS_PATH}`);
  const scriptText = await fs.readFile(SCRIPT_PATH, 'utf8');
  const captions = parseCaptions(scriptText);
  const previousById = new Map((previous?.segments || []).map((segment) => [segment.id, segment]));
  const queueByScene = new Map((assetPrompts.renderQueue || []).map((item) => [item.sceneId, item]));
  const renderSpec = {
    aspectRatio: '9:16',
    resolutionTier: '720p',
    targetDurationSeconds: 15,
    numFrames: 361,
    frameRate: 24,
    ...(assetPrompts.renderSpec || {})
  };
  const segments = assetPrompts.prompts
    .filter((item) => item.prompt && item.type !== 'image')
    .map((item, index) => {
      const queueItem = queueByScene.get(item.sceneId) || {};
      const previousSegment = previousById.get(item.id) || {};
      const durationSeconds = numberFromValue(item.durationSeconds, 15);
      const referenceImages = [
        ...stringList(item.referenceImageUrl),
        ...stringList(item.referenceImages),
        ...stringList(queueItem.referenceImageUrl),
        ...stringList(queueItem.referenceImages)
      ].filter((url, urlIndex, all) => all.indexOf(url) === urlIndex);
      return {
        index: index + 1,
        id: item.id || `segment_${index + 1}`,
        sceneId: item.sceneId || '',
        title: item.renderTask || `镜头 ${index + 1}`,
        durationSeconds,
        caption: captions.get(index + 1) || item.renderTask || `小澎恋爱史第 ${index + 1} 段`,
        prompt: item.prompt,
        referenceImages,
        mode: item.mode || queueItem.mode || (referenceImages.length ? 'ti2vid' : ''),
        render: previousSegment.render || { status: 'pending' }
      };
    });

  return {
    title: '小澎的恋爱史｜三分钟搞笑短剧 V2',
    source: 'local website production package',
    baseUrl: BASE_URL,
    totalDurationSeconds: segments.reduce((sum, segment) => sum + segment.durationSeconds, 0),
    segmentCount: segments.length,
    createdAt: previous?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    finalVideo: (await exists(FINAL_PATH)) ? FINAL_PATH : previous?.finalVideo || '',
    rawConcatVideo: (await exists(RAW_CONCAT_PATH)) ? RAW_CONCAT_PATH : previous?.rawConcatVideo || '',
    renderSpec,
    negativePrompt: [
      assetPrompts.characterConsistency?.negativePrompt || '',
      '英文字幕，英文单词，拼音，拉丁字母，乱码文字，可读文字，可读招牌，屏幕文字，书本文字，包装文字',
      '动画风，二次元，卡通，玩偶脸，三维渲染，夸张滤镜，换脸，换人，脸部不一致',
      '亲吻，拥抱，性暗示，成人化儿童'
    ]
      .filter(Boolean)
      .join('，'),
    segments
  };
}

async function loadManifest() {
  const previous = await readJson(MANIFEST_PATH);
  const manifest = await buildFreshManifest(previous);
  await writeManifest(manifest);
  return manifest;
}

async function writeManifest(manifest) {
  manifest.updatedAt = new Date().toISOString();
  await writeJson(MANIFEST_PATH, manifest);
  await writeConcatList(manifest);
  await writeCaptions(manifest);
}

function renderBodyFor(segment, manifest) {
  const referenceImages = segment.referenceImages || [];
  return {
    prompt: segment.prompt,
    negativePrompt: manifest.negativePrompt,
    image: referenceImages.length === 1 && segment.mode !== 'keyframes' ? referenceImages[0] : undefined,
    keyframes: referenceImages.length > 1 || segment.mode === 'keyframes' ? referenceImages : undefined,
    mode: segment.mode || undefined,
    spec: {
      ...manifest.renderSpec,
      targetDurationSeconds: segment.durationSeconds,
      episodeTotalSeconds: manifest.totalDurationSeconds,
      episodeSegmentSeconds: segment.durationSeconds,
      episodeSegmentCount: manifest.segmentCount
    }
  };
}

function errorMessageFrom(body, text, status) {
  if (typeof body?.error === 'string') return body.error;
  if (body?.error) return JSON.stringify(body.error);
  return text || `HTTP ${status}`;
}

async function submitSegment(segment, manifest) {
  const response = await fetchWithTimeout(`${BASE_URL}/api/video/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(renderBodyFor(segment, manifest))
  }, SUBMIT_TIMEOUT_MS);
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok || body.ok === false) {
    throw new Error(errorMessageFrom(body, text, response.status));
  }
  return {
    ...segment.render,
    status: body.videoUrl ? 'completed' : body.status || 'submitted',
    submittedAt: new Date().toISOString(),
    taskId: body.task_id || body.taskId || segment.render?.taskId || '',
    videoId: body.video_id || body.videoId || body.task_id || segment.render?.videoId || '',
    videoUrl: body.videoUrl || segment.render?.videoUrl || '',
    progress: Number.isFinite(Number(body.progress)) ? Number(body.progress) : segment.render?.progress || 0,
    error: '',
    rawSubmit: body.raw || body
  };
}

async function submitWithRetry(segment, manifest) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await submitSegment(segment, manifest);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/rate limit|429|too many|timeout|aborted/i.test(message) || attempt === 4) throw error;
      console.log(`retryable submit error on ${segment.index}: ${message}. wait ${Math.round(RATE_LIMIT_WAIT_MS / 1000)}s`);
      await wait(RATE_LIMIT_WAIT_MS);
    }
  }
}

async function submitMissing(manifest) {
  for (const segment of manifest.segments) {
    if (segment.render?.videoId || segment.render?.videoUrl) continue;
    console.log(`submit ${String(segment.index).padStart(2, '0')}/${manifest.segmentCount} ${segment.title}`);
    segment.render = await submitWithRetry(segment, manifest);
    await writeManifest(manifest);
    if (segment.index < manifest.segmentCount) await wait(RATE_LIMIT_WAIT_MS);
  }
}

async function pollSegment(segment) {
  if (!segment.render?.videoId) return segment.render || { status: 'pending' };
  const response = await fetchWithTimeout(
    `${BASE_URL}/api/video/render?video_id=${encodeURIComponent(segment.render.videoId)}`,
    {},
    STATUS_TIMEOUT_MS
  );
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok || body.ok === false) {
    const message = errorMessageFrom(body, text, response.status);
    const rateLimited = response.status === 429 || /rate limit|too many/i.test(message);
    return {
      ...segment.render,
      status: rateLimited ? segment.render.status || 'submitted' : 'failed',
      error: message,
      checkedAt: new Date().toISOString()
    };
  }
  const videoUrl = body.videoUrl || segment.render.videoUrl || '';
  return {
    ...segment.render,
    status: videoUrl ? 'completed' : body.status || segment.render.status || 'submitted',
    progress: Number.isFinite(Number(body.progress)) ? Number(body.progress) : segment.render.progress || 0,
    videoUrl,
    error: '',
    checkedAt: new Date().toISOString(),
    rawStatus: body.raw || body
  };
}

async function pollOnce(manifest) {
  const pending = manifest.segments.filter((segment) => segment.render?.videoId && !segment.render?.videoUrl);
  for (let index = 0; index < pending.length; index += 1) {
    const segment = pending[index];
    console.log(`poll ${String(segment.index).padStart(2, '0')}/${manifest.segmentCount} ${segment.title}`);
    segment.render = await pollSegment(segment);
    await writeManifest(manifest);
    if (index < pending.length - 1) await wait(RATE_LIMIT_WAIT_MS);
  }
}

async function pollUntilDone(manifest) {
  for (let round = 1; round <= POLL_ROUNDS; round += 1) {
    const remaining = manifest.segments.filter((segment) => segment.render?.videoId && !segment.render?.videoUrl);
    if (!remaining.length) break;
    console.log(`poll round ${round}/${POLL_ROUNDS}, remaining ${remaining.length}`);
    await pollOnce(manifest);
    const stillRemaining = manifest.segments.filter((segment) => segment.render?.videoId && !segment.render?.videoUrl);
    if (stillRemaining.length && round < POLL_ROUNDS) await wait(RATE_LIMIT_WAIT_MS);
  }
}

async function downloadFile(url, filePath) {
  const response = await fetchWithTimeout(url, {}, DOWNLOAD_TIMEOUT_MS);
  if (!response.ok) throw new Error(`download failed ${response.status}: ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
}

async function downloadCompleted(manifest) {
  await fs.mkdir(CLIP_DIR, { recursive: true });
  for (const segment of manifest.segments) {
    if (!segment.render?.videoUrl) continue;
    const filePath = path.join(CLIP_DIR, `${String(segment.index).padStart(2, '0')}-${segment.id}.mp4`);
    if (!(await exists(filePath))) {
      console.log(`download ${String(segment.index).padStart(2, '0')} ${segment.title}`);
      await downloadFile(segment.render.videoUrl, filePath);
    }
    segment.render.localFile = filePath;
    await writeManifest(manifest);
  }
}

async function writeConcatList(manifest) {
  const lines = manifest.segments
    .filter((segment) => segment.render?.localFile)
    .map((segment) => `file '${segment.render.localFile.replaceAll("'", "'\\''")}'`);
  await fs.writeFile(CONCAT_LIST_PATH, lines.join('\n'));
}

function srtTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.round((seconds - Math.floor(seconds)) * 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function wrapChineseCaption(text, maxChars = 15) {
  const compact = text.replace(/\s+/g, '').trim();
  const chunks = [];
  let current = '';
  for (const char of compact) {
    current += char;
    if (current.length >= maxChars || /[，。！？；]/.test(char)) {
      chunks.push(current);
      current = '';
    }
  }
  if (current) chunks.push(current);
  return chunks.join('\n');
}

async function writeCaptions(manifest) {
  let cursor = 0;
  const blocks = manifest.segments.map((segment, index) => {
    const start = cursor + 0.4;
    const end = cursor + segment.durationSeconds - 0.5;
    cursor += segment.durationSeconds;
    return [
      String(index + 1),
      `${srtTime(start)} --> ${srtTime(end)}`,
      wrapChineseCaption(segment.caption)
    ].join('\n');
  });
  await fs.writeFile(CAPTIONS_PATH, `${blocks.join('\n\n')}\n`);
}

async function findBinary(name) {
  try {
    const { stdout } = await run('which', [name]);
    return stdout.trim();
  } catch (_) {
    return '';
  }
}

async function findFfmpeg() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  const bundled = '/tmp/videoagent-ffmpeg-static/node_modules/ffmpeg-static';
  if (await exists(bundled)) {
    try {
      return require(bundled);
    } catch (_) {
      // Fall through to local or system ffmpeg.
    }
  }
  const local = path.join(process.cwd(), 'node_modules', 'ffmpeg-static');
  if (await exists(local)) {
    try {
      return require(local);
    } catch (_) {
      // Fall through to system ffmpeg.
    }
  }
  return findBinary('ffmpeg');
}

async function findFfprobe() {
  if (process.env.FFPROBE_PATH) return process.env.FFPROBE_PATH;
  return findBinary('ffprobe');
}

async function assemble(manifest) {
  const missing = manifest.segments.filter((segment) => !segment.render?.localFile);
  if (missing.length) {
    throw new Error(`Cannot assemble; missing ${missing.length} clips: ${missing.map((segment) => segment.index).join(', ')}`);
  }
  const ffmpeg = await findFfmpeg();
  if (!ffmpeg) throw new Error('ffmpeg not found; install ffmpeg or set FFMPEG_PATH');
  await writeConcatList(manifest);
  await writeCaptions(manifest);
  console.log('assemble raw concat');
  await run(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', CONCAT_LIST_PATH, '-c', 'copy', RAW_CONCAT_PATH]);
  console.log('burn pure Chinese subtitles');
  const subtitleFilter = `subtitles=${CAPTIONS_PATH}:force_style='FontName=PingFang SC,FontSize=16,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=1.5,Shadow=0,Alignment=2,MarginV=72'`;
  await run(ffmpeg, [
    '-y',
    '-i',
    RAW_CONCAT_PATH,
    '-vf',
    subtitleFilter,
    '-map',
    '0:v:0',
    '-map',
    '0:a?',
    '-c:v',
    'libx264',
    '-crf',
    '20',
    '-preset',
    'veryfast',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-movflags',
    '+faststart',
    FINAL_PATH
  ]);
  manifest.finalVideo = FINAL_PATH;
  manifest.rawConcatVideo = RAW_CONCAT_PATH;
  await writeManifest(manifest);
}

async function probe(filePath) {
  const ffprobe = await findFfprobe();
  if (!ffprobe || !(await exists(filePath))) return null;
  try {
    const { stdout } = await run(ffprobe, ['-v', 'error', '-show_entries', 'format=duration,size', '-of', 'json', filePath]);
    return JSON.parse(stdout);
  } catch (_) {
    return null;
  }
}

async function probeWithFfmpeg(filePath) {
  if (!(await exists(filePath))) return null;
  const ffmpeg = await findFfmpeg();
  if (!ffmpeg) return null;
  return new Promise((resolve) => {
    execFile(ffmpeg, ['-hide_banner', '-i', filePath], { maxBuffer: 1024 * 1024 * 5 }, async (_error, stdout, stderr) => {
      const text = `${stdout}\n${stderr}`;
      const match = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      const stat = await fs.stat(filePath).catch(() => null);
      if (!match) {
        resolve(stat ? { format: { size: String(stat.size) } } : null);
        return;
      }
      const duration = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
      resolve({ format: { duration: String(duration), size: stat ? String(stat.size) : undefined } });
    });
  });
}

function summary(manifest, probeResult = null) {
  const submitted = manifest.segments.filter((segment) => segment.render?.videoId).length;
  const completed = manifest.segments.filter((segment) => segment.render?.videoUrl).length;
  const downloaded = manifest.segments.filter((segment) => segment.render?.localFile).length;
  const failed = manifest.segments.filter((segment) => segment.render?.status === 'failed').length;
  return {
    manifest: MANIFEST_PATH,
    finalVideo: manifest.finalVideo || '',
    total: manifest.segments.length,
    submitted,
    completed,
    downloaded,
    failed,
    pending: manifest.segments.length - completed - failed,
    duration: probeResult?.format?.duration ? Number(probeResult.format.duration) : null,
    size: probeResult?.format?.size ? Number(probeResult.format.size) : null
  };
}

async function main() {
  const mode = process.argv[2] || 'produce';
  const manifest = await loadManifest();

  if (mode === 'status') {
    console.log(JSON.stringify(summary(manifest, (await probe(FINAL_PATH)) || (await probeWithFfmpeg(FINAL_PATH))), null, 2));
    return;
  }
  if (mode === 'submit-missing' || mode === 'produce') await submitMissing(manifest);
  if (mode === 'poll' || mode === 'produce') await pollUntilDone(manifest);
  if (mode === 'download' || mode === 'produce') await downloadCompleted(manifest);
  if (mode === 'assemble' || mode === 'produce') await assemble(manifest);

  console.log(JSON.stringify(summary(manifest, (await probe(FINAL_PATH)) || (await probeWithFfmpeg(FINAL_PATH))), null, 2));
}

main().catch(async (error) => {
  console.error(error);
  const manifest = await readJson(MANIFEST_PATH);
  if (manifest) console.error(JSON.stringify(summary(manifest), null, 2));
  process.exit(1);
});
