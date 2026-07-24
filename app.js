const canvas = document.getElementById("videoCanvas");
const ctx = canvas.getContext("2d");
const lyricsInput = document.getElementById("lyricsInput");
const titleInput = document.getElementById("titleInput");
const providerInput = document.getElementById("providerInput");
const apiBaseInput = document.getElementById("apiBaseInput");
const apiKeyInput = document.getElementById("apiKeyInput");
const musicStyleInput = document.getElementById("musicStyleInput");
const testModeEnabledInput = document.getElementById("testModeEnabledInput");
const imageApiKeyInput = document.getElementById("imageApiKeyInput");
const imageProviderInput = document.getElementById("imageProviderInput");
const manualAudioUrlInput = document.getElementById("manualAudioUrlInput");
const audioFileInput = document.getElementById("audioFileInput");
const bpmInput = document.getElementById("bpmInput");
const secondsInput = document.getElementById("secondsInput");
const syncOffsetInput = document.getElementById("syncOffsetInput");
const bottomTickerEnabledInput = document.getElementById("bottomTickerEnabledInput");
const bottomTickerTextInput = document.getElementById("bottomTickerTextInput");
const linesPerImageInput = document.getElementById("linesPerImageInput");
const styleInput = document.getElementById("styleInput");
const timeline = document.getElementById("timeline");
const generateBtn = document.getElementById("generateBtn");
const generateImageBtn = document.getElementById("generateImageBtn");
const songBtn = document.getElementById("songBtn");
const previewBtn = document.getElementById("previewBtn");
const exportBtn = document.getElementById("exportBtn");
const exportHint = document.getElementById("exportHint");
const statusDot = document.getElementById("statusDot");
const songPlayer = document.getElementById("songPlayer");

const W = canvas.width;
const H = canvas.height;
let shots = [];
let previewTimer = 0;
let currentSong = null;
let currentSongKey = "";
let localAudioObjectUrl = "";
let currentAudioTiming = null;
let currentAudioTimingKey = "";
const imageCache = new Map();
const IMAGE_PROXY_BASE = "/api/draw-image";

const scienceFacts = [
  "这里的关键是能量转化，少浪费就是少排放。",
  "材料经过分类处理，才能进入更高效的循环。",
  "温度、光照和压力会改变物体的状态。",
  "微小选择叠加起来，就会改变资源消耗曲线。",
  "看似日常的现象，背后都有可验证的科学规律。"
];

const palettes = {
  show: ["#050506", "#f4f4f4", "#ffd91a", "#eaf7ff", "#111318"],
  neon: ["#071411", "#37d7a5", "#ffcc4d", "#f2f5f7", "#27313a"],
  paper: ["#f5efe2", "#276b5f", "#c94f38", "#202020", "#e1d3b7"],
  studio: ["#101820", "#2f80ed", "#f2994a", "#ffffff", "#253341"]
};

// 去除歌词中的结构标签，只保留纯歌词内容
// 支持 Markdown 格式（## Intro、## Verse 1、## Hook、## Outro 等）
// 自动去除行首标签（Hook、Hook（副歌重复）、Verse 1 等）
function splitLyrics(value) {
  const SECTION_LINES = /^#{1,3}\s+/;           // 匹配 ## Intro、# 《标题》 等整行标签
  const INLINE_TAG   = /^(?:Hook（副歌重复）|Hook|副歌(?:重复)?|Verse\s?\d*|Intro|Outro)\s*[：:：]?\s*/i;
  // 先按行分割
  const rawLines = value.split(/\n/);
  const cleanedLines = [];

  for (const raw of rawLines) {
    const line = raw.trim();
    // 整行是结构标签（如 ## Intro、# 《标题》）→ 跳过
    if (SECTION_LINES.test(line)) continue;
    // 空行 → 跳过
    if (!line) continue;
    // 行首是 Hook/Verse/Intro/Outro 标签 → 去掉标签，保留后面的歌词
    const rest = line.replace(INLINE_TAG, "").trim();
    if (rest) cleanedLines.push(rest);
  }

  // 对清理后的纯歌词按句号（。！？）和换行分割
  const lyricLines = cleanedLines
    .join("\n")
    .split(/\n|。|！|!|？|\?/)
    .map((s) => s.trim())
    .filter(Boolean);

  return lyricLines;
}

function makeRapLine(line, index) {
  return line;
}

function getSongKey() {
  return [
    lyricsInput.value.trim(),
    titleInput.value.trim(),
    providerInput.value,
    musicStyleInput.value.trim(),
    isTestModeEnabled() ? "test-mode" : "music-api-mode",
    linesPerImageInput.value,
    apiBaseInput.value.trim(),
    apiKeyInput.value.trim()
  ].join("\n---\n");
}

function isTestModeEnabled() {
  return Boolean(testModeEnabledInput?.checked);
}

function getRapLyrics() {
  buildShots();
  return shots.map((shot) => shot.rap).join("\n");
}

function getMusicPrompt() {
  const lyrics = getRapLyrics();
  const bpm = Math.max(70, Math.min(180, Number(bpmInput.value) || 96));
  return [
    "[Rap lyrics]",
    lyrics,
    "[Rules]",
    `Start singing immediately from the first lyric character. The very first audible sound must be the first lyric, with no count-in, no beat intro, and no spoken lead-in. Sing exactly ${shots.length} lines, one line per phrase. Do not add an intro, outro, chorus, adlibs, or extra lyrics. Do not repeat lines. Keep each phrase close to the same length so subtitles can switch evenly.`,
    `[Style] Rap at exactly ${bpm} BPM. Each line should be exactly 4 beats long (one bar). The total duration should be approximately ${((shots.length * 240) / bpm).toFixed(1)} seconds. Do not vary the tempo. Start singing right away with zero silence before the first word.`
  ].join("\n");
}

function getLinesPerImage() {
  return Math.max(1, Math.min(2, Number(linesPerImageInput.value) || 1));
}

function getTotalDuration() {
  return shots.reduce((sum, shot) => sum + shot.duration, 0);
}

function getActiveAudioUrl() {
  const manualSong = getManualSong();
  if (manualSong) return manualSong.audioUrl;
  if (currentSong?.audioUrl) return currentSong.audioUrl;
  return "";
}

function getAudioTimingKey() {
  return [
    getActiveAudioUrl(),
    isTestModeEnabled() ? "test-mode" : "music-mode",
    lyricsInput.value.trim(),
    titleInput.value.trim(),
    providerInput.value,
    apiBaseInput.value.trim(),
    apiKeyInput.value.trim()
  ].join("\n---\n");
}

function clearAudioTiming() {
  currentAudioTiming = null;
  currentAudioTimingKey = "";
}

function getSyncOffset() {
  return Math.max(-3, Math.min(3, Number(syncOffsetInput.value) || 0));
}

function getSyncedElapsed(rawElapsedSeconds) {
  const timing =
    currentAudioTiming && currentAudioTimingKey === getAudioTimingKey() ? currentAudioTiming : null;
  const totalDuration = timing?.duration > 0 ? timing.duration : getTotalDuration();
  if (!totalDuration) return 0;
  const startOffset = timing?.startOffset || 0;
  return Math.max(0, Math.min(totalDuration, rawElapsedSeconds - startOffset - getSyncOffset()));
}

function getShotIndexAtTime(elapsedSeconds) {
  if (!shots.length) return 0;
  let cursor = 0;
  for (let i = 0; i < shots.length; i += 1) {
    if (elapsedSeconds >= cursor && elapsedSeconds < cursor + shots[i].duration) return i;
    cursor += shots[i].duration;
  }
  return shots.length - 1;
}

function getVisualShotForLine(lineIndex) {
  const linesPerImage = getLinesPerImage();
  const start = Math.floor(lineIndex / linesPerImage) * linesPerImage;
  const group = shots.slice(start, start + linesPerImage);
  const current = shots[lineIndex] || group[0] || {
    lyric: "输入歌词后生成视频",
    rap: "输入歌词后生成视频",
    keyword: "science",
    id: 1
  };
  return {
    ...current,
    lyric: group.map((shot) => shot.lyric).join(" "),
    rap: group.map((shot) => shot.rap).join(" "),
    keyword: inferKeywords(group.map((shot) => shot.lyric).join(" ")) || current.keyword,
    id: Math.floor(lineIndex / linesPerImage) + 1,
    imageUrl: group.find((shot) => shot.imageUrl)?.imageUrl || current.imageUrl || "",
    imageDataUrl: group.find((shot) => shot.imageDataUrl)?.imageDataUrl || current.imageDataUrl || "",
    imageObjectUrl:
      group.find((shot) => shot.imageObjectUrl)?.imageObjectUrl || current.imageObjectUrl || ""
  };
}

function inferKeywords(line) {
  const map = [
    ["商业", "business"],
    ["逻辑", "keyhole"],
    ["规律", "keyhole"],
    ["秘密", "keyhole"],
    ["流量", "crowd"],
    ["排队", "crowd"],
    ["人群", "crowd"],
    ["多推", "crowd"],
    ["营销", "business"],
    ["赚钱", "business"],
    ["搞钱", "business"],
    ["利润", "business"],
    ["太阳", "sun"],
    ["光", "sun"],
    ["塑料", "recycle"],
    ["瓶", "recycle"],
    ["回收", "recycle"],
    ["节能", "energy"],
    ["减排", "energy"],
    ["水", "water"],
    ["电", "energy"],
    ["火", "heat"],
    ["空气", "air"],
    ["风", "air"],
    ["植物", "plant"],
    ["食物", "food"],
    ["手机", "tech"],
    ["网络", "tech"]
  ];
  return map.find(([word]) => line.includes(word))?.[1] || "science";
}

function buildShots() {
  // 检测歌词内容是否变化：变化则清除所有旧图片
  const lyricsHash = lyricsInput.value.trim();
  const lyricsChanged = shots.length > 0 && shots[0].lyricsHash !== lyricsHash;

  if (lyricsChanged) {
    // 清理旧 ObjectURL，释放内存
    shots.forEach((shot) => {
      if (shot?.imageObjectUrl) URL.revokeObjectURL(shot.imageObjectUrl);
    });
    imageCache.clear();
    crossfadeShotIndex = -1;
    prevImageDataUrl = "";
    currentImageDataUrl = "";
  }

  // 同一次编辑内：按歌词文本匹配保留已有图片（不改歌词时不会重新生成）
  const oldByLyric = new Map();
  if (!lyricsChanged) {
    for (const shot of shots) {
      if (shot?.lyric) oldByLyric.set(shot.lyric, shot);
    }
  }

  const lines = splitLyrics(lyricsInput.value);
  const seconds = Number(secondsInput.value) || 3.5;
  const safeLines = lines.length ? lines : [titleInput.value.trim() || "输入歌词后生成视频"];
  shots = safeLines.map((line, index) => {
    const old = oldByLyric.get(line);
    return {
      id: index + 1,
      lyric: line,
      lyricsHash, // 记录当前歌词内容，用于下次 buildShots 判断是否变化
      rap: makeRapLine(line, index),
      keyword: inferKeywords(line),
      duration: old?.duration ?? seconds,
      imageUrl: old?.imageUrl ?? "",
      imageDataUrl: old?.imageDataUrl ?? "",
      imageObjectUrl: old?.imageObjectUrl ?? "",
      imagePrompt: old?.imagePrompt ?? "",
      imageStatus: old?.imageStatus ?? "pending",
      imageError: old?.imageError ?? ""
    };
  });
  currentSong = null;
  currentSongKey = "";
  clearAudioTiming();
  updateManualAudioPreview();
  renderTimeline();
  drawFrame(0, 0);
}

function updateMusicModeHint() {
  if (isTestModeEnabled()) {
    exportHint.textContent =
      "测试模式已开启：不会调用音乐 API。优先使用本地音频或手动音频 URL，没有音频时导出会回退到浏览器合成节拍。";
  } else {
    exportHint.textContent =
      "导出会先调用音乐 API 生成带人声的 rap，再把画面和音频合成为 16:9 视频。";
  }
}

function syncMusicModeState() {
  const testMode = isTestModeEnabled();
  providerInput.disabled = testMode;
  apiBaseInput.disabled = testMode;
  apiKeyInput.disabled = testMode;
  musicStyleInput.disabled = testMode;
  songBtn.textContent = testMode ? "生成测试音频" : "生成说唱";
  if (testMode) {
    currentSong = null;
    currentSongKey = "";
    if (!getManualSong()) songPlayer.removeAttribute("src");
  }
  updateMusicModeHint();
}

async function ensureAudioTiming() {
  const sourceUrl = getActiveAudioUrl();
  if (!sourceUrl || isTestModeEnabled()) {
    clearAudioTiming();
    return null;
  }

  const key = getAudioTimingKey();
  if (currentAudioTiming && currentAudioTimingKey === key) return currentAudioTiming;

  const timing = await analyzeAudioTiming(sourceUrl);
  currentAudioTiming = timing;
  currentAudioTimingKey = key;
  return timing;
}

async function analyzeAudioTiming(audioUrl) {
  const audioBuffer = await loadAudioBuffer(audioUrl);
  return computeAudioTiming(audioBuffer);
}

async function loadAudioBuffer(audioUrl) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const audioContext = new AudioContextClass();
  try {
    const response = await fetch(audioUrl);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const buffer = await response.arrayBuffer();
    return await audioContext.decodeAudioData(buffer);
  } catch (error) {
    throw new Error(
      `音频读取失败：${error.message}。如果这是远程音频 URL，请确认该地址允许浏览器跨域下载；也可以下载后用“本地音频文件”上传。`
    );
  } finally {
    await audioContext.close().catch(() => {});
  }
}

function computeAudioTiming(audioBuffer) {
  const sampleRate = audioBuffer.sampleRate || 44100;
  const windowSize = Math.max(1024, Math.round(sampleRate * 0.03));
  const stepSize = windowSize;
  const energies = [];
  const channel = audioBuffer.getChannelData(0);

  for (let offset = 0; offset + windowSize <= channel.length; offset += stepSize) {
    let sum = 0;
    for (let i = 0; i < windowSize; i += 1) {
      const sample = channel[offset + i];
      sum += sample * sample;
    }
    energies.push(Math.sqrt(sum / windowSize));
  }

  if (!energies.length) {
    return { startOffset: 0, endOffset: audioBuffer.duration, duration: audioBuffer.duration, shotSegments: null };
  }

  const maxEnergy = Math.max(...energies);
  const threshold = Math.max(0.012, maxEnergy * 0.18);
  const sustainWindows = Math.min(6, Math.max(3, Math.floor(energies.length / 24) || 3));
  const prefix = [0];
  for (const value of energies) prefix.push(prefix[prefix.length - 1] + value);

  const rangeAvg = (start, end) => {
    const safeStart = Math.max(0, start);
    const safeEnd = Math.min(energies.length, end);
    if (safeEnd <= safeStart) return 0;
    return (prefix[safeEnd] - prefix[safeStart]) / (safeEnd - safeStart);
  };

  let startIndex = 0;
  for (let i = 0; i <= energies.length - sustainWindows; i += 1) {
    if (rangeAvg(i, i + sustainWindows) >= threshold) {
      startIndex = Math.max(0, i - 2);
      break;
    }
  }

  let endIndex = energies.length - 1;
  for (let i = energies.length - sustainWindows; i >= 0; i -= 1) {
    if (rangeAvg(i, i + sustainWindows) >= threshold) {
      endIndex = Math.min(energies.length - 1, i + sustainWindows + 1);
      break;
    }
  }

  const startOffset = Math.max(0, (startIndex * stepSize) / sampleRate);
  const endOffset = Math.min(audioBuffer.duration, ((endIndex + 1) * stepSize) / sampleRate);
  const duration = Math.max(0.5, endOffset - startOffset);

  // 从能量曲线检测句子边界（静音间隙），用于字幕同步
  const shotSegments = detectShotBoundaries(energies, stepSize, sampleRate, shots.length, startOffset, endOffset);

  return {
    startOffset,
    endOffset,
    duration,
    rawDuration: audioBuffer.duration,
    shotSegments
  };
}

// 从能量曲线检测静音间隙作为句子边界，返回每个 shot 对应的音频起止时间
// silenceThresholdRatio: 能量低于 maxEnergy * ratio 视为静音
// minSilenceFrames: 静音持续多少帧才算真正的句子间隔（默认 8 帧 ≈ 0.24s）
function detectShotBoundaries(energies, stepSize, sampleRate, shotCount, startOffset, endOffset) {
  if (!energies.length || shotCount <= 0) return null;

  const maxEnergy = Math.max(...energies);
  const silenceThreshold = maxEnergy * 0.08; // 低于 8% 最大能量视为静音

  // 找到所有静音帧索引
  const silentFrames = [];
  for (let i = 0; i < energies.length; i += 1) {
    if (energies[i] < silenceThreshold) silentFrames.push(i);
  }

  // 找出连续的静音区间（至少 5 帧 ≈ 150ms 才算有效间隙）
  const minSilenceFrames = 5;
  const gaps = [];
  let gapStart = -1;
  for (let i = 0; i < silentFrames.length; i += 1) {
    if (gapStart < 0) {
      gapStart = silentFrames[i];
    } else if (silentFrames[i] - silentFrames[i - 1] > 1) {
      const len = silentFrames[i - 1] - gapStart;
      if (len >= minSilenceFrames) {
        gaps.push({ start: gapStart, end: silentFrames[i - 1] });
      }
      gapStart = silentFrames[i];
    }
  }
  if (gapStart >= 0) {
    const len = silentFrames[silentFrames.length - 1] - gapStart;
    if (len >= minSilenceFrames) gaps.push({ start: gapStart, end: silentFrames[silentFrames.length - 1] });
  }

  // 把静音间隙时间点转成秒（相对于音频开始）
  const audioStart = (gaps.length ? energies.indexOf(gaps[0].start) : 0) >= 0
    ? 0
    : 0; // fallback
  const silencePoints = gaps.map((g) => ((g.start + g.end) / 2) * stepSize / sampleRate);

  // 用静音点把 [startOffset, endOffset] 切成 shotCount 段
  return buildShotSegments(silencePoints, startOffset, endOffset, shotCount);
}

// 把静音点和音频起止边界，切成 shotCount 个段落
function buildShotSegments(silencePoints, startOffset, endOffset, shotCount) {
  const segments = [];

  if (silencePoints.length === 0) {
    // 没有检测到静音 → 均匀分配
    const segLen = (endOffset - startOffset) / shotCount;
    for (let i = 0; i < shotCount; i += 1) {
      segments.push({ start: startOffset + i * segLen, end: startOffset + (i + 1) * segLen });
    }
    return segments;
  }

  // 取所有边界点（startOffset, 各静音中点, endOffset），去重排序
  const boundaries = [startOffset, ...silencePoints, endOffset].filter(
    (t) => t > startOffset && t < endOffset
  );
  const unique = [...new Set(boundaries)].sort((a, b) => a - b);
  // 保证首尾在列表里
  if (unique[0] !== startOffset) unique.unshift(startOffset);
  if (unique[unique.length - 1] !== endOffset) unique.push(endOffset);

  if (unique.length <= 1) {
    const segLen = (endOffset - startOffset) / shotCount;
    for (let i = 0; i < shotCount; i += 1) {
      segments.push({ start: startOffset + i * segLen, end: startOffset + (i + 1) * segLen });
    }
    return segments;
  }

  // 检测到的边界数量 vs 需要数量
  const neededGaps = shotCount - 1; // 需要多少个分界点
  const detectedGaps = unique.length - 1; // 当前有多少段

  if (detectedGaps <= neededGaps) {
    // 边界不够 → 用现有边界 + 均匀插值补足
    const targetBoundaries = [startOffset];
    for (let i = 0; i < neededGaps; i += 1) {
      const ratio = (i + 1) / neededGaps;
      const targetTime = startOffset + ratio * (endOffset - startOffset);
      // 找最近的已有边界或静音点
      let best = targetTime;
      for (const bp of unique) {
        if (bp > startOffset && bp < endOffset && Math.abs(bp - targetTime) < Math.abs(best - targetTime)) {
          best = bp;
        }
      }
      targetBoundaries.push(best);
    }
    targetBoundaries.push(endOffset);
    for (let i = 0; i < targetBoundaries.length - 1; i += 1) {
      segments.push({ start: targetBoundaries[i], end: targetBoundaries[i + 1] });
    }
  } else {
    // 边界太多 → 合并最近的相邻边界，直到数量够用
    const working = [...unique];
    while (working.length - 1 > neededGaps) {
      // 找最小间隔的一对相邻边界合并
      let minIdx = 0;
      let minGap = Infinity;
      for (let i = 0; i < working.length - 1; i += 1) {
        const gap = working[i + 1] - working[i];
        if (gap < minGap) { minGap = gap; minIdx = i; }
      }
      // 合并 minIdx 和 minIdx+1（取中点）
      const mid = (working[minIdx] + working[minIdx + 1]) / 2;
      working.splice(minIdx, 2, mid);
    }
    for (let i = 0; i < working.length - 1; i += 1) {
      segments.push({ start: working[i], end: working[i + 1] });
    }
  }

  // 修复：确保正好有 shotCount 个 segment
  while (segments.length < shotCount) {
    // 找到最长的 segment 劈开
    let maxLen = 0, maxIdx = 0;
    for (let i = 0; i < segments.length; i += 1) {
      const len = segments[i].end - segments[i].start;
      if (len > maxLen) { maxLen = len; maxIdx = i; }
    }
    const mid = (segments[maxIdx].start + segments[maxIdx].end) / 2;
    segments.splice(maxIdx, 1, { start: segments[maxIdx].start, end: mid }, { start: mid, end: segments[maxIdx].end });
  }
  while (segments.length > shotCount) {
    // 合并最短的两个相邻 segment
    let minLen = Infinity, minIdx = 0;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const len = segments[i].end - segments[i].start + segments[i + 1].end - segments[i + 1].start;
      if (len < minLen) { minLen = len; minIdx = i; }
    }
    segments.splice(minIdx, 2, { start: segments[minIdx].start, end: segments[minIdx + 1].end });
  }

  return segments;
}

// 根据 shot 索引从音频时间轴获取起止时间（有真实音频时用真实时间，否则用 shot.duration 估算）
function getShotAudioTime(shotIndex) {
  const segs = currentAudioTiming?.shotSegments;
  if (segs && segs.length === shots.length && segs[shotIndex]) {
    const seg = segs[shotIndex];
    return { start: seg.start, end: seg.end, duration: seg.end - seg.start };
  }
  // 回退：用 shot.duration 累加
  let cursor = 0;
  for (let i = 0; i < shotIndex; i += 1) cursor += shots[i]?.duration ?? 3.5;
  const dur = shots[shotIndex]?.duration ?? 3.5;
  return { start: cursor, end: cursor + dur, duration: dur };
}

// 返回 shot 在全局音频时间轴上的起止（不含 startOffset）
function getShotGlobalTime(shotIndex) {
  const segs = currentAudioTiming?.shotSegments;
  if (segs && segs.length === shots.length && segs[shotIndex]) {
    const offset = currentAudioTiming?.startOffset ?? 0;
    const seg = segs[shotIndex];
    return { start: seg.start - offset, end: seg.end - offset, duration: seg.end - seg.start };
  }
  let cursor = 0;
  for (let i = 0; i < shotIndex; i += 1) cursor += shots[i]?.duration ?? 3.5;
  const dur = shots[shotIndex]?.duration ?? 3.5;
  return { start: cursor, end: cursor + dur, duration: dur };
}

async function waitForMediaMetadata(mediaElement) {
  if (mediaElement.readyState >= 1 && Number.isFinite(mediaElement.duration)) return;
  await new Promise((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("音频元数据加载失败"));
    };
    const cleanup = () => {
      mediaElement.removeEventListener("loadedmetadata", onReady);
      mediaElement.removeEventListener("error", onError);
    };
    mediaElement.addEventListener("loadedmetadata", onReady, { once: true });
    mediaElement.addEventListener("error", onError, { once: true });
  });
}

function getShotIndexAtTime(elapsedSeconds) {
  if (!shots.length) return 0;
  const segs = currentAudioTiming?.shotSegments;
  if (segs && segs.length === shots.length) {
    const offset = currentAudioTiming?.startOffset ?? 0;
    const audioAbs = elapsedSeconds + offset;
    for (let i = 0; i < segs.length; i += 1) {
      if (audioAbs >= segs[i].start && audioAbs < segs[i].end) return i;
    }
    return segs.length - 1;
  }
  // 回退：按固定 duration 累加
  let cursor = 0;
  for (let i = 0; i < shots.length; i += 1) {
    if (elapsedSeconds >= cursor && elapsedSeconds < cursor + shots[i].duration) return i;
    cursor += shots[i].duration;
  }
  return shots.length - 1;
}

function getVisualShotForLine(lineIndex) {
    const cleanup = () => {
      mediaElement.removeEventListener("loadedmetadata", onReady);
      mediaElement.removeEventListener("error", onError);
    };
    mediaElement.addEventListener("loadedmetadata", onReady, { once: true });
    mediaElement.addEventListener("error", onError, { once: true });
  });
}

function renderTimeline() {
  timeline.innerHTML = "";
  shots.forEach((shot) => {
    const item = document.createElement("article");
    item.className = "shot";
    item.innerHTML = `<strong>SHOT ${shot.id}</strong><p>${escapeHtml(shot.rap)}</p>`;
    timeline.appendChild(item);
  });
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
  });
}

function setBusy(isBusy, isError = false) {
  statusDot.classList.toggle("busy", isBusy);
  statusDot.classList.toggle("error", isError);
  generateBtn.disabled = isBusy;
  generateImageBtn.disabled = isBusy;
  songBtn.disabled = isBusy;
  previewBtn.disabled = isBusy;
  exportBtn.disabled = isBusy;
}

function drawFrame(time, shotIndex, elapsedSeconds = null) {
  // 图片加载完成后，触发对应 shot 的重绘
  if (pendingRedrawShot >= 0) {
    const pendingShot = pendingRedrawShot;
    const pendingTime = pendingRedrawTime;
    pendingRedrawShot = -1;
    // 重新计算当前播放位置
    const activeElapsed =
      Number.isFinite(elapsedSeconds) ? elapsedSeconds : getSyncedElapsed(songPlayer.currentTime || 0);
    const currentIndex = getShotIndexAtTime(activeElapsed);
    if (pendingShot === currentIndex) {
      drawFrame(pendingTime, pendingShot, activeElapsed);
    }
    return;
  }
  const currentShot = shots[shotIndex] || {
    lyric: "输入歌词后生成视频",
    rap: "每一句会自动变成科普 rap 分镜",
    keyword: "science",
    id: 1
  };
  const visualShot = getVisualShotForLine(shotIndex);
  const palette = palettes[styleInput.value] || palettes.neon;
  const activeElapsed =
    Number.isFinite(elapsedSeconds) ? elapsedSeconds : getSyncedElapsed(songPlayer.currentTime || 0);
  if (styleInput.value !== "show") {
    const pulse = Math.sin(time * 0.006) * 0.5 + 0.5;
    ctx.fillStyle = palette[0];
    ctx.fillRect(0, 0, W, H);
    drawBackgroundGrid(palette, pulse);
    drawKeywordVisual(currentShot.keyword, palette, time);
    drawBeatBars(palette, time);
    drawTextBlock(currentShot, palette, activeElapsed, shotIndex);
    drawProgress(shotIndex, palette);
    return;
  }

  drawShowPackageFrame(visualShot, currentShot, shotIndex, time, activeElapsed);
}

function drawShowPackageFrame(visualShot, captionShot, shotIndex, time, elapsedSeconds = 0) {
  const frame = { x: 54, y: 54, w: W - 108, h: H - 108 };
  const inset = 22;
  const picture = { x: frame.x + inset, y: frame.y + inset, w: frame.w - inset * 2, h: frame.h - inset * 2 };

  drawMetalPackageBackground(time);
  drawScreenFrame(frame);
  // 传入 shotIndex + 全局 elapsed，支持 crossfade 淡入淡出
  drawGeneratedPicture(picture, visualShot, time, shotIndex, elapsedSeconds);
  drawSceneWatermark(picture, visualShot, time);
  drawBottomTicker(shotIndex, frame);
  // 使用 shot 内相对时间，保证 Karaoke 高亮节奏正确
  const { localElapsed, shotDuration } = getShotLocalElapsed(elapsedSeconds, shotIndex);
  drawKaraokeCaption(captionShot, localElapsed, shotDuration);
}

function drawMetalPackageBackground(time) {
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#171719");
  bg.addColorStop(0.36, "#040405");
  bg.addColorStop(0.68, "#171719");
  bg.addColorStop(1, "#050506");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.globalAlpha = 0.42;
  ctx.strokeStyle = "#5b5d60";
  ctx.lineWidth = 10;
  for (let i = -180; i < W + 240; i += 42) {
    ctx.beginPath();
    ctx.moveTo(i, -40);
    ctx.bezierCurveTo(i - 120, 240, i - 40, 520, i - 260, H + 120);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.translate(0, 0);
  ctx.fillStyle = "#9cff00";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(188, 0);
  ctx.lineTo(110, 372);
  ctx.lineTo(0, 456);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#e8ff22";
  ctx.translate(95 + Math.sin(time * 0.0015) * 8, 372);
  ctx.rotate(-0.68);
  ctx.fillRect(-18, -260, 22, 520);
  ctx.restore();

  const vignette = ctx.createRadialGradient(W / 2, H / 2, 280, W / 2, H / 2, 980);
  vignette.addColorStop(0, "rgba(255,255,255,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.72)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
}

function drawScreenFrame(frame) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 18;
  const outer = ctx.createLinearGradient(frame.x, frame.y, frame.x, frame.y + frame.h);
  outer.addColorStop(0, "#f6f6f6");
  outer.addColorStop(0.12, "#8f9296");
  outer.addColorStop(0.5, "#313335");
  outer.addColorStop(0.86, "#c9c9c9");
  outer.addColorStop(1, "#5d6064");
  ctx.fillStyle = outer;
  roundRect(frame.x, frame.y, frame.w, frame.h, 18);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#080808";
  roundRect(frame.x + 14, frame.y + 14, frame.w - 28, frame.h - 28, 10);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.78)";
  ctx.lineWidth = 5;
  roundRect(frame.x + 6, frame.y + 6, frame.w - 12, frame.h - 12, 14);
  ctx.stroke();
  ctx.restore();
}

function drawGeneratedPicture(area, shot, time, shotIndex, globalElapsed) {
  ctx.save();
  roundedClip(area.x, area.y, area.w, area.h, 8);

  // 背景底色
  const base = ctx.createLinearGradient(area.x, area.y, area.x + area.w, area.y + area.h);
  base.addColorStop(0, "#222831");
  base.addColorStop(0.5, "#151719");
  base.addColorStop(1, "#050506");
  ctx.fillStyle = base;
  ctx.fillRect(area.x, area.y, area.w, area.h);

  // 检测 shot 切换 → 启动 crossfade，记录旧图 URL
  if (shotIndex !== crossfadeShotIndex) {
    // 切换 shot 时：把当前显示的图片推入 prevImageDataUrl（用于淡出）
    if (currentImageDataUrl) prevImageDataUrl = currentImageDataUrl;
    // 更新当前图 URL
    currentImageDataUrl = shot.imageDataUrl || "";
    crossfadeShotIndex = shotIndex;
    crossfadeStartTime = time;
  } else {
    // 同 shot 内持续更新（图片生成完成后会更新）
    currentImageDataUrl = shot.imageDataUrl || currentImageDataUrl;
  }

  // 计算 crossfade 进度（0 = 新图刚进入，1 = 过渡完成）
  const crossfadeProgress = Math.min(1, Math.max(0, (time - crossfadeStartTime) / CROSSFADE_DURATION));

  // 上一张图：crossfade 期间淡出（Ken Burns 继续动）
  if (crossfadeProgress < 1 && prevImageDataUrl) {
    const prevAlpha = 1 - crossfadeProgress;
    drawImageWithKenBurns(area, prevImageDataUrl, shotIndex - 1, time, prevAlpha);
  }

  // 当前图：带 Ken Burns 动效 + crossfade 淡入
  const currentAlpha = crossfadeProgress;
  drawImageWithKenBurns(area, shot.imageDataUrl, shotIndex, time, currentAlpha);

  // 如果没有生成的图片，绘制 fallback 动效场景（占满整个画面）
  if (!shot.imageDataUrl) {
    const kw = shot.keyword || "science";
    if (kw === "crowd") drawCrowdScene(area, time);
    else if (kw === "keyhole") drawKeyholeScene(area, time);
    else if (kw === "business") drawBusinessScene(area, time);
    else if (kw === "recycle") drawRecycleScene(area, time);
    else if (kw === "sun") drawSunScienceScene(area, time);
    else if (kw === "water") drawWaterScienceScene(area, time);
    else if (kw === "energy") drawEnergyScene(area, time);
    else if (kw === "heat") drawHeatScene(area, time);
    else if (kw === "air") drawAirScene(area, time);
    else if (kw === "plant") drawPlantScienceScene(area, time);
    else if (kw === "food") drawFoodScene(area, time);
    else if (kw === "tech") drawTechScene(area, time);
    else drawScienceScene(area, time);
  }

  ctx.restore();
  drawPictureGrade(area);
}

// 带 Ken Burns 动效的图片绘制，支持 crossfade alpha
// alpha=1 时完全显示，alpha<1 时用于过渡淡出
function drawImageWithKenBurns(area, imageDataUrl, shotIndex, time, alpha = 1) {
  const status = imageDataUrl ? getCachedImageStatus(imageDataUrl) : null;

  if (status === "ready") {
    const image = imageCache.get(imageDataUrl)?.image;
    if (!image) return;

    // Ken Burns：基于时间平滑的缩放 + 轻微摇摆
    const t = time * 0.0005;
    // 每张图有独特的运动轨迹，用 shotIndex 区分方向
    const dir = shotIndex % 2 === 0 ? 1 : -1;
    const panX = Math.sin(t + shotIndex * 1.7) * 22 * dir;
    const panY = Math.cos(t * 0.7 + shotIndex * 2.3) * 12;
    const zoomBase = 1.04;
    const zoomOsc = (Math.sin(t * 0.6 + shotIndex) + 1) * 0.015;
    const zoom = zoomBase + zoomOsc;

    const cx = area.x + area.w / 2;
    const cy = area.y + area.h / 2;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx + panX, cy + panY);
    ctx.scale(zoom, zoom);
    ctx.translate(-cx, -cy);
    ctx.drawImage(image, area.x, area.y, area.w, area.h);
    ctx.restore();
    return;
  }

  // 未缓存：触发加载；加载中：静默等待（不盖住旧图）
  if (status === null && imageDataUrl) {
    preloadImage(imageDataUrl);
  }
}

function getImageGroupShots() {
  const groups = [];
  const linesPerImage = getLinesPerImage();
  for (let index = 0; index < shots.length; index += linesPerImage) {
    groups.push({
      index,
      shot: getVisualShotForLine(index)
    });
  }
  return groups;
}

function buildImagePrompt(shot) {
  const lyric = shot.lyric || "";
  const scene = inferVisualScene(lyric);
  // 精简 prompt：场景 + 核心风格 + 明确拒绝文字，缩短避免超时
  return `${scene}. Photorealistic, cinematic lighting, ultra detailed, 8K. No text, no words, no letters, no Chinese characters, no watermark, no logo, no subtitles.`;
}

// 从歌词内容推断具体视觉场景
function inferVisualScene(lyric) {
  const text = lyric.toLowerCase();
  const scenes = [];

  // 技能/学习/AI
  if (/AI|人工智能|智能|agent|大模型|编程|代码|技能|学习|工具/.test(text)) {
    scenes.push("a modern tech workspace with glowing screens showing code and AI interfaces, realistic");
  }
  // 塑料/回收/环保
  if (/塑料|回收|环保|废物|再利用|垃圾|生态/.test(text)) {
    scenes.push("plastic bottles and recyclables sorted in a clean recycling facility, photorealistic");
  }
  // 太阳/能源/节能
  if (/太阳|能源|节能|光|电|光合|太阳能/.test(text)) {
    scenes.push("bright sunlight shining through solar panels and green energy infrastructure, cinematic");
  }
  // 水/循环
  if (/水|海洋|河流|循环|清洁/.test(text)) {
    scenes.push("crystal clear water flowing in a pristine river, natural light, photorealistic");
  }
  // 植物/食物/自然
  if (/植物|绿植|食物|森林|自然|生态|生长/.test(text)) {
    scenes.push("lush green plants and organic vegetables in natural sunlight, shallow DOF");
  }
  // 商业/赚钱/利润
  if (/商业|赚钱|利润|企业|增长|商业/.test(text)) {
    scenes.push("dynamic business cityscape with modern skyscrapers, golden hour lighting");
  }
  // 人群/社交/多推
  if (/人群|排队|多人|社交|热闹/.test(text)) {
    scenes.push("vibrant busy street market with diverse people, candid street photography");
  }
  // 火焰/高温
  if (/火|热|燃烧|高温/.test(text)) {
    scenes.push("warm orange firelight and glowing embers in industrial setting, cinematic");
  }
  // 空气/风
  if (/空气|风|呼吸|清新/.test(text)) {
    scenes.push("fresh mountain air with misty wind through pine trees, nature photography");
  }
  // 科技/手机/网络
  if (/手机|网络|科技|数字|智能/.test(text)) {
    scenes.push("sleek smartphone and glowing digital interface in dark modern room, neon accents");
  }
  // 2026/未来/趋势
  if (/2026|未来|新时代|趋势|新战局/.test(text)) {
    scenes.push("futuristic city with holographic AI elements, golden sunrise, cinematic wide shot");
  }
  // 实干/行动
  if (/实干|行动|实操|踩坑|动手|上手/.test(text)) {
    scenes.push("hands working on a creative project with tools and materials, realistic");
  }

  if (scenes.length === 0) {
    // 默认：科普主题的写实自然场景
    scenes.push("a vivid science discovery moment, glowing particles and natural light, cinematic");
  }

  // 取第一个匹配场景，用 & 连接多个场景感
  return scenes[0];
}

function applyImageResultToGroup(groupStartIndex, result) {
  const groupId = Math.floor(groupStartIndex / getLinesPerImage());
  const end = Math.min(groupStartIndex + getLinesPerImage(), shots.length);
  for (let i = groupStartIndex; i < end; i += 1) {
    shots[i].imageUrl = result.imageUrl || "";
    shots[i].imageDataUrl = result.imageDataUrl || "";
    shots[i].imageObjectUrl = result.imageObjectUrl || "";
    shots[i].imagePrompt = result.prompt || "";
    shots[i].imageStatus = result.status || "ready";
    shots[i].imageError = result.error || "";
  }
  renderTimeline();
  drawFrame(performance.now(), groupId * getLinesPerImage());
}

async function generateImages() {
  buildShots();

  const apiKey = imageApiKeyInput.value.trim();
  const provider = imageProviderInput.value || "rightcode";
  if (!apiKey) throw new Error("请填写图像 API Key。");

  const providerNames = { rightcode: "Right Code", agnes: "Agnes AI" };
  const providerName = providerNames[provider] || provider;
  setBusy(true);
  exportHint.textContent = `正在提交 ${providerName} 画面生图任务...`;

  try {
    for (const group of getImageGroupShots()) {
      const prompt = buildImagePrompt(group.shot);
      const result = await createImageTask({ prompt, apiKey, provider });
      applyImageResultToGroup(group.index, { ...result, prompt });
    }
    exportHint.textContent = "画面生图完成，预览和导出会优先使用生成图片。";
  } catch (error) {
    exportHint.textContent = error.message;
    setBusy(false, true);
    return;
  }

  setBusy(false);
}

async function createImageTask(payload) {
  const created = await postImageJson(
    IMAGE_PROXY_BASE,
    { prompt: payload.prompt, provider: payload.provider, apiKey: payload.apiKey },
    payload.apiKey
  );
  const immediate = extractImageAsset(created);
  if (immediate) return materializeImageAsset(immediate);

  const taskId = extractImageTaskId(created);
  if (taskId) {
    return pollImageTask(taskId, payload.apiKey);
  }

  throw new Error(`图像 API 没有返回图片地址或任务 id，返回摘要：${summarizeJson(created)}`);
}

async function pollImageTask(taskId, apiKey) {
  const startedAt = Date.now();
  const timeoutMs = 10 * 60 * 1000;

  while (Date.now() - startedAt < timeoutMs) {
    await delay(5000);
    const result = await getImageJson(`${IMAGE_PROXY_BASE}/tasks/${encodeURIComponent(taskId)}`, apiKey);
    const image = extractImageAsset(result);
    if (image) return materializeImageAsset(image);

    const status = extractStatus(result);
    if (/fail|error|reject/i.test(status)) {
      throw new Error(`图像生成失败：${status}`);
    }
    exportHint.textContent = `画面生图处理中... ${Math.round((Date.now() - startedAt) / 1000)}s`;
  }

  throw new Error("即梦图像生成超时，请检查任务状态或 API 配额。");
}

async function materializeImageAsset(image) {
  if (image.imageDataUrl) {
    const normalized = normalizeBase64Image(image.imageDataUrl);
    await preloadImage(normalized);
    return {
      ...image,
      imageDataUrl: normalized,
      imageObjectUrl: ""
    };
  }

  if (image.imageUrl) {
    throw new Error("图像代理需要返回 base64 图片数据。");
  }

  throw new Error("图像 API 没有返回可用的图片内容。");
}

function drawCrowdScene(area, time) {
  const floor = ctx.createLinearGradient(area.x, area.y + area.h * 0.45, area.x, area.y + area.h);
  floor.addColorStop(0, "#313030");
  floor.addColorStop(1, "#d9d0c3");
  ctx.fillStyle = floor;
  ctx.fillRect(area.x, area.y + area.h * 0.42, area.w, area.h * 0.58);
  drawStorefront(area.x + 40, area.y + 20, area.w - 80, area.h * 0.52);

  for (let i = 0; i < 28; i += 1) {
    const depth = i / 28;
    const x = area.x + 90 + i * 42 + Math.sin(i * 1.7) * 26;
    const y = area.y + area.h * (0.58 + depth * 0.18);
    drawPerson(x, y, 0.58 + depth * 0.32, i);
  }

  ctx.strokeStyle = "rgba(255,255,255,0.42)";
  ctx.lineWidth = 8;
  for (let i = 0; i < 5; i += 1) {
    ctx.beginPath();
    ctx.moveTo(area.x + 120 + i * 250, area.y + area.h - 40);
    ctx.lineTo(area.x + 260 + i * 250, area.y + area.h - 190);
    ctx.stroke();
  }
}

function drawStorefront(x, y, w, h) {
  ctx.fillStyle = "#141111";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  for (let i = 0; i < 5; i += 1) {
    ctx.fillRect(x + 30 + i * (w / 5), y + 20, w / 5 - 42, h - 40);
  }
}

function drawPerson(x, y, scale, seed) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  const colors = ["#ffffff", "#111111", "#f2a65a", "#5d7fbf", "#d8b7a3", "#a7d2cb"];
  ctx.fillStyle = "#27211f";
  ctx.beginPath();
  ctx.arc(0, -86, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors[seed % colors.length];
  roundRect(-20, -66, 40, 74, 10);
  ctx.fill();
  ctx.strokeStyle = "#1f1f1f";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(-12, 8);
  ctx.lineTo(-20, 86);
  ctx.moveTo(12, 8);
  ctx.lineTo(22, 86);
  ctx.stroke();
  ctx.restore();
}

function drawKeyholeScene(area, time) {
  ctx.fillStyle = "#020202";
  ctx.fillRect(area.x, area.y, area.w, area.h);
  const cx = area.x + area.w * 0.52;
  const cy = area.y + area.h * 0.44;
  const glow = ctx.createRadialGradient(cx, cy, 40, cx, cy, 340);
  glow.addColorStop(0, "rgba(255,255,255,0.98)");
  glow.addColorStop(0.38, "rgba(255,255,255,0.35)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(area.x, area.y, area.w, area.h);

  ctx.fillStyle = "#f8f8f1";
  ctx.beginPath();
  ctx.arc(cx, cy - 80, 90, 0, Math.PI * 2);
  ctx.moveTo(cx - 56, cy - 8);
  ctx.lineTo(cx + 56, cy - 8);
  ctx.lineTo(cx + 92, cy + 300);
  ctx.lineTo(cx - 92, cy + 300);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#0b0b0c";
  ctx.globalAlpha = 0.82;
  drawPerson(cx + Math.sin(time * 0.001) * 12, cy + 270, 1.45, 3);
  ctx.globalAlpha = 1;
}

function drawBusinessScene(area, time) {
  const sky = ctx.createLinearGradient(area.x, area.y, area.x, area.y + area.h);
  sky.addColorStop(0, "#111723");
  sky.addColorStop(1, "#0b0b0d");
  ctx.fillStyle = sky;
  ctx.fillRect(area.x, area.y, area.w, area.h);
  drawBarChart(area.x + 180, area.y + 520, 720, 220, time);
  drawCoinStack(area.x + 980, area.y + 610, 1.1);
  ctx.strokeStyle = "#ffde22";
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(area.x + 200, area.y + 560);
  ctx.bezierCurveTo(area.x + 520, area.y + 360, area.x + 760, area.y + 430, area.x + 1120, area.y + 220);
  ctx.stroke();
  drawArrowHead(area.x + 1120, area.y + 220, -0.5);
}

function drawBarChart(x, y, w, h, time) {
  const values = [0.35, 0.52, 0.46, 0.75, 0.62, 0.92];
  for (let i = 0; i < values.length; i += 1) {
    const bw = w / values.length - 18;
    const bh = h * values[i] + Math.sin(time * 0.002 + i) * 8;
    ctx.fillStyle = i % 2 ? "#8fd6ff" : "#ffdf28";
    ctx.fillRect(x + i * (bw + 18), y - bh, bw, bh);
  }
}

function drawCoinStack(x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  for (let i = 0; i < 7; i += 1) {
    ctx.fillStyle = i % 2 ? "#d9aa22" : "#ffd84a";
    ctx.beginPath();
    ctx.ellipse(0, -i * 22, 86, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-86, -i * 22 - 26, 172, 26);
  }
  ctx.restore();
}

function drawRecycleScene(area, time) {
  const bg = ctx.createLinearGradient(area.x, area.y, area.x, area.y + area.h);
  bg.addColorStop(0, "#dbeee3");
  bg.addColorStop(1, "#243b31");
  ctx.fillStyle = bg;
  ctx.fillRect(area.x, area.y, area.w, area.h);
  drawFactoryLine(area);
  ctx.save();
  ctx.translate(area.x + area.w * 0.62, area.y + area.h * 0.43);
  ctx.rotate(time * 0.0004);
  ctx.fillStyle = "#40cc82";
  for (let i = 0; i < 3; i += 1) {
    ctx.rotate((Math.PI * 2) / 3);
    drawArrow(0, -150, 260, 78, ["#000", "#000", "#40cc82"]);
  }
  ctx.restore();
}

function drawFactoryLine(area) {
  ctx.fillStyle = "#2c3432";
  ctx.fillRect(area.x + 80, area.y + 540, area.w - 160, 86);
  ctx.fillStyle = "#91d0f3";
  for (let i = 0; i < 9; i += 1) {
    ctx.save();
    ctx.translate(area.x + 150 + i * 116, area.y + 500 + Math.sin(i) * 18);
    ctx.rotate(-0.12);
    roundRect(-22, -70, 44, 120, 12);
    ctx.fill();
    ctx.restore();
  }
}

function drawSunScienceScene(area, time) {
  const bg = ctx.createLinearGradient(area.x, area.y, area.x, area.y + area.h);
  bg.addColorStop(0, "#385b83");
  bg.addColorStop(1, "#f2c37a");
  ctx.fillStyle = bg;
  ctx.fillRect(area.x, area.y, area.w, area.h);
  ctx.fillStyle = "#fff3a3";
  ctx.beginPath();
  ctx.arc(area.x + area.w * 0.72, area.y + area.h * 0.26, 122 + Math.sin(time * 0.002) * 8, 0, Math.PI * 2);
  ctx.fill();
  drawHeatWaves(area.x + 220, area.y + 560, 700);
}

function drawWaterScienceScene(area, time) {
  ctx.fillStyle = "#0a2230";
  ctx.fillRect(area.x, area.y, area.w, area.h);
  for (let i = 0; i < 10; i += 1) {
    ctx.strokeStyle = i % 2 ? "#79d8ff" : "#e7fbff";
    ctx.lineWidth = 10;
    ctx.beginPath();
    const y = area.y + 190 + i * 48;
    ctx.moveTo(area.x + 90, y);
    for (let x = area.x + 90; x < area.x + area.w - 80; x += 80) {
      ctx.quadraticCurveTo(x + 40, y + Math.sin(time * 0.002 + i) * 32, x + 80, y);
    }
    ctx.stroke();
  }
}

function drawEnergyScene(area, time) {
  ctx.fillStyle = "#15120a";
  ctx.fillRect(area.x, area.y, area.w, area.h);
  ctx.fillStyle = "#ffe45c";
  ctx.shadowColor = "#ffe45c";
  ctx.shadowBlur = 48;
  ctx.beginPath();
  const x = area.x + area.w * 0.54;
  const y = area.y + area.h * 0.18;
  ctx.moveTo(x - 70, y);
  ctx.lineTo(x + 150, y + 260);
  ctx.lineTo(x + 40, y + 260);
  ctx.lineTo(x + 130, y + 590);
  ctx.lineTo(x - 160, y + 210);
  ctx.lineTo(x - 34, y + 210);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawHeatScene(area, time) {
  const bg = ctx.createLinearGradient(area.x, area.y, area.x, area.y + area.h);
  bg.addColorStop(0, "#30120c");
  bg.addColorStop(0.58, "#f07b2f");
  bg.addColorStop(1, "#fff1a8");
  ctx.fillStyle = bg;
  ctx.fillRect(area.x, area.y, area.w, area.h);
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  for (let i = 0; i < 9; i += 1) {
    const x = area.x + 130 + i * 135;
    ctx.beginPath();
    ctx.moveTo(x, area.y + area.h - 80);
    ctx.bezierCurveTo(
      x - 80,
      area.y + area.h - 300,
      x + 90,
      area.y + area.h - 470 + Math.sin(time * 0.002 + i) * 36,
      x,
      area.y + area.h - 650
    );
    ctx.strokeStyle = i % 2 ? "#fff7d1" : "#ffd35a";
    ctx.lineWidth = 16;
    ctx.stroke();
  }
}

function drawAirScene(area, time) {
  ctx.fillStyle = "#d8f0f8";
  ctx.fillRect(area.x, area.y, area.w, area.h);
  ctx.fillStyle = "#8fcfba";
  ctx.fillRect(area.x, area.y + area.h * 0.72, area.w, area.h * 0.28);
  for (let i = 0; i < 8; i += 1) {
    const y = area.y + 150 + i * 70;
    const offset = Math.sin(time * 0.0015 + i) * 60;
    ctx.strokeStyle = i % 2 ? "#ffffff" : "#2f9dd0";
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(area.x + 120 + offset, y);
    ctx.bezierCurveTo(area.x + 420, y - 80, area.x + 650, y + 90, area.x + 980, y);
    ctx.bezierCurveTo(area.x + 1120, y - 32, area.x + 1220, y - 18, area.x + 1320, y + 12);
    ctx.stroke();
  }
}

function drawFoodScene(area, time) {
  const bg = ctx.createLinearGradient(area.x, area.y, area.x, area.y + area.h);
  bg.addColorStop(0, "#274033");
  bg.addColorStop(1, "#f2d39b");
  ctx.fillStyle = bg;
  ctx.fillRect(area.x, area.y, area.w, area.h);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(area.x + area.w * 0.5, area.y + area.h * 0.62, 410, 130, 0, 0, Math.PI * 2);
  ctx.fill();
  const foods = ["#e9553f", "#62a944", "#f4c24d", "#8f5b3e", "#fbf2d0"];
  for (let i = 0; i < 16; i += 1) {
    ctx.fillStyle = foods[i % foods.length];
    ctx.beginPath();
    ctx.arc(
      area.x + area.w * 0.28 + (i % 8) * 82,
      area.y + area.h * 0.55 + Math.floor(i / 8) * 78 + Math.sin(time * 0.001 + i) * 4,
      38,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
}

function drawTechScene(area, time) {
  ctx.fillStyle = "#07131f";
  ctx.fillRect(area.x, area.y, area.w, area.h);
  ctx.strokeStyle = "rgba(86,201,255,0.38)";
  ctx.lineWidth = 4;
  for (let x = area.x + 80; x < area.x + area.w; x += 110) {
    ctx.beginPath();
    ctx.moveTo(x, area.y);
    ctx.lineTo(x - 180, area.y + area.h);
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(area.x + area.w * 0.52, area.y + area.h * 0.52);
  ctx.rotate(Math.sin(time * 0.0008) * 0.04);
  ctx.fillStyle = "#101923";
  ctx.strokeStyle = "#76d7ff";
  ctx.lineWidth = 12;
  roundRect(-180, -310, 360, 620, 44);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#1f7a98";
  roundRect(-142, -250, 284, 500, 18);
  ctx.fill();
  ctx.fillStyle = "#d7fbff";
  for (let i = 0; i < 5; i += 1) {
    ctx.fillRect(-96, -170 + i * 72, 192 + Math.sin(time * 0.002 + i) * 28, 18);
  }
  ctx.restore();
}

function drawPlantScienceScene(area, time) {
  ctx.fillStyle = "#102417";
  ctx.fillRect(area.x, area.y, area.w, area.h);
  ctx.fillStyle = "#436f42";
  ctx.fillRect(area.x, area.y + area.h * 0.7, area.w, area.h * 0.3);
  ctx.fillStyle = "#7ed86b";
  for (let i = 0; i < 8; i += 1) {
    const x = area.x + 160 + i * 145;
    const y = area.y + 660 + Math.sin(time * 0.001 + i) * 12;
    ctx.fillRect(x - 10, y - 160, 20, 160);
    ctx.beginPath();
    ctx.ellipse(x - 45, y - 110, 58, 24, -0.45, 0, Math.PI * 2);
    ctx.ellipse(x + 45, y - 70, 58, 24, 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawScienceScene(area, time) {
  ctx.fillStyle = "#08111a";
  ctx.fillRect(area.x, area.y, area.w, area.h);
  const cx = area.x + area.w / 2;
  const cy = area.y + area.h / 2;
  ctx.strokeStyle = "#8fd6ff";
  ctx.lineWidth = 8;
  for (let i = 0; i < 4; i += 1) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(i * 0.7 + time * 0.0008);
    ctx.beginPath();
    ctx.ellipse(0, 0, 300, 100, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = "#ffdf28";
  ctx.beginPath();
  ctx.arc(cx, cy, 74, 0, Math.PI * 2);
  ctx.fill();
}

function drawPictureGrade(area) {
  ctx.save();
  roundedClip(area.x, area.y, area.w, area.h, 8);
  const shade = ctx.createLinearGradient(area.x, area.y, area.x, area.y + area.h);
  shade.addColorStop(0, "rgba(0,0,0,0.12)");
  shade.addColorStop(0.68, "rgba(0,0,0,0.04)");
  shade.addColorStop(1, "rgba(0,0,0,0.58)");
  ctx.fillStyle = shade;
  ctx.fillRect(area.x, area.y, area.w, area.h);
  ctx.fillStyle = "rgba(255,255,255,0.035)";
  for (let y = area.y; y < area.y + area.h; y += 4) {
    ctx.fillRect(area.x, y, area.w, 1);
  }
  ctx.restore();
}

function drawSceneWatermark(area, shot, time) {
  if (shot.keyword !== "crowd") return;
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.font = "700 46px system-ui, sans-serif";
  const labels = ["多推", "多推", "多推", "多推", "多推", "多推"];
  labels.forEach((label, index) => {
    const x = area.x + area.w * (0.57 + (index % 3) * 0.14);
    const y = area.y + 60 + Math.floor(index / 3) * 82 + Math.sin(time * 0.001 + index) * 5;
    ctx.fillText(label, x, y);
  });
  ctx.restore();
}

function drawKaraokeCaption(shot, elapsedSeconds = 0, shotDuration = 3.5) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const line = shot.lyric || shot.rap || "";
  drawKaraokeLineText(line, W / 2, 900, 1500, getSubtitleFontSize(1500, 78), elapsedSeconds, shotDuration, "center");
  ctx.restore();
}

function getActiveCharacterIndex(text, elapsedSeconds, duration) {
  if (!text) return -1;
  if (!Number.isFinite(elapsedSeconds) || !Number.isFinite(duration) || duration <= 0) return -1;
  const chars = Array.from(text);
  if (!chars.length) return -1;
  const progress = Math.max(0, Math.min(1, elapsedSeconds / duration));
  if (progress >= 1) return chars.length - 1;  // 结束时高亮最后一字
  return Math.min(chars.length - 1, Math.floor(progress * chars.length));
}

function drawKaraokeLineText(text, x, y, maxWidth, fontSize, elapsedSeconds, duration, align = "center") {
  const chars = Array.from(text || "");
  if (!chars.length) return;

  ctx.save();
  let effectiveFontSize = fontSize;
  let widths = [];
  let totalWidth = 0;
  while (effectiveFontSize > 34) {
    ctx.font = `900 ${effectiveFontSize}px system-ui, sans-serif`;
    widths = chars.map((char) => ctx.measureText(char).width);
    totalWidth = widths.reduce((sum, width) => sum + width, 0);
    if (!Number.isFinite(maxWidth) || totalWidth <= maxWidth) break;
    effectiveFontSize -= 4;
  }

  const activeIndex = getActiveCharacterIndex(text, elapsedSeconds, duration);
  const startX = align === "center" ? x - totalWidth / 2 : x;
  let cursorX = startX;

  for (let i = 0; i < chars.length; i += 1) {
    const char = chars[i];
    const charWidth = widths[i];
    const color = i === activeIndex ? "#ffe11a" : "#f5fbff";
    drawOutlinedText(char, cursorX + charWidth / 2, y, color, effectiveFontSize);
    cursorX += charWidth;
  }

  ctx.restore();
}

function getCachedImageStatus(src) {
  const existing = imageCache.get(src);
  if (existing?.status === "ready") return "ready";
  if (existing?.status === "loading") return "loading";
  return null;
}

let pendingRedrawShot = -1;
let pendingRedrawTime = 0;

// Shot 切换 crossfade 状态
let crossfadeShotIndex = -1;       // 正在显示的 shot 索引
let crossfadeStartTime = 0;        // 该 shot 开始时间（performance.now() 单位）
let prevImageDataUrl = "";         // 上一张生成图片的 URL（用于 crossfade 淡出）
let currentImageDataUrl = "";      // 当前 shot 的图片 URL（切换时推入 prev）
const CROSSFADE_DURATION = 600;  // crossfade 过渡时长（毫秒）

// 请求对指定 shot 重新绘制（图片加载完成后触发）
function scheduleRedraw(shotIndex) {
  pendingRedrawShot = shotIndex;
  pendingRedrawTime = performance.now();
}

async function preloadImage(src) {
  if (!src) return null;
  const existing = imageCache.get(src);
  if (existing?.status === "ready") return existing.image;
  if (existing?.promise) return existing.promise;

  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      imageCache.set(src, { status: "ready", image });
      resolve(image);
      // 找到并通知等待该图片的 shot 触发重绘
      for (let i = 0; i < shots.length; i++) {
        if (shots[i].imageDataUrl === src) {
          scheduleRedraw(i);
          break;
        }
      }
    };
    image.onerror = () => reject(new Error("图片资源加载失败"));
    image.src = src;
  });
  imageCache.set(src, { status: "loading", promise });
  return promise;
}

function revokeGeneratedImages() {
  shots.forEach((shot) => {
    if (shot?.imageObjectUrl) URL.revokeObjectURL(shot.imageObjectUrl);
  });
  imageCache.clear();
  // 重置 crossfade 状态
  crossfadeShotIndex = -1;
  prevImageDataUrl = "";
  currentImageDataUrl = "";
}

function invalidateGeneratedImages() {
  revokeGeneratedImages();
  shots.forEach((shot) => {
    shot.imageUrl = "";
    shot.imageDataUrl = "";
    shot.imageObjectUrl = "";
    shot.imagePrompt = "";
    shot.imageStatus = "pending";
    shot.imageError = "";
  });
  renderTimeline();
  drawFrame(performance.now(), getShotIndexAtTime(getSyncedElapsed(songPlayer.currentTime || 0)));
}

function extractImageAsset(data) {
  const list = normalizeImageList(data);
  const item = list.find((entry) => {
    return Boolean(
      entry?.url ||
      entry?.image_url ||
      entry?.imageUrl ||
      entry?.imageDataUrl ||
      entry?.dataUrl ||
      entry?.b64_json ||
      entry?.base64 ||
      entry?.image_base64 ||
      entry?.image
    );
  });
  if (!item) return null;

  const imageUrl = item.url || item.image_url || item.imageUrl || item.image || "";
  const imageDataUrl =
    item.imageDataUrl ||
    item.dataUrl ||
    item.b64_json || item.base64 || item.image_base64 || item.imageBase64 || "";
  return {
    imageUrl,
    imageDataUrl: normalizeBase64Image(imageDataUrl),
    taskId: item.id || item.task_id || item.taskId || ""
  };
}

function normalizeImageList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.data?.data)) return data.data.data;
  if (Array.isArray(data?.data?.images)) return data.data.images;
  if (Array.isArray(data?.images)) return data.images;
  if (Array.isArray(data?.output)) return data.output;
  if (Array.isArray(data?.result)) return data.result;
  if (Array.isArray(data?.result?.images)) return data.result.images;
  if (Array.isArray(data?.result?.output)) return data.result.output;
  if (Array.isArray(data?.data?.output)) return data.data.output;
  if (data?.data && typeof data.data === "object") return [data.data];
  if (data?.result && typeof data.result === "object") return [data.result];
  return data ? [data] : [];
}

function extractImageTaskId(data) {
  return (
    data?.taskId ||
    data?.task_id ||
    data?.id ||
    data?.data?.taskId ||
    data?.data?.task_id ||
    data?.data?.id ||
    data?.result?.taskId ||
    data?.result?.task_id ||
    data?.result?.id ||
    ""
  );
}

function normalizeBase64Image(value) {
  if (!value || typeof value !== "string") return "";
  if (value.startsWith("data:image/")) return value;
  return `data:image/png;base64,${value}`;
}

function getSubtitleFontSize(maxWidth, preferredSize) {
  const texts = (shots.length ? shots : [{ rap: "输入歌词后生成视频" }]).map((shot) => shot.rap || shot.lyric);
  let fontSize = preferredSize;
  while (fontSize > 34) {
    ctx.font = `900 ${fontSize}px system-ui, sans-serif`;
    const widest = Math.max(...texts.map((text) => ctx.measureText(text).width));
    if (widest <= maxWidth) return fontSize;
    fontSize -= 4;
  }
  return fontSize;
}

function drawOutlinedText(text, x, y, color, fontSize) {
  ctx.save();
  ctx.font = `900 ${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(10, fontSize * 0.16);
  ctx.strokeStyle = "#1a1a1a";
  ctx.strokeText(text, x, y);
  ctx.lineWidth = Math.max(5, fontSize * 0.08);
  ctx.strokeStyle = "#89b7d5";
  ctx.strokeText(text, x, y + 3);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function getBottomTickerConfig() {
  return {
    enabled: Boolean(bottomTickerEnabledInput.checked),
    text: bottomTickerTextInput.value.trim()
  };
}

function drawBottomTicker(shotIndex, frame) {
  const { enabled, text } = getBottomTickerConfig();
  if (!enabled || !text) return;

  const bandTop = frame.y + frame.h - 126;
  const bandHeight = 126;
  const labelY = bandTop + bandHeight / 2;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(20,20,22,0.82)";
  ctx.fillRect(frame.x, bandTop, frame.w, bandHeight);
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fillRect(frame.x + 190, bandTop, 4, bandHeight);
  ctx.fillRect(frame.x + frame.w - 190, bandTop, 4, bandHeight);
  ctx.fillStyle = "#d9d9d9";
  ctx.font = "600 34px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, frame.x + frame.w / 2, labelY);
  ctx.restore();
}

function roundedClip(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
  ctx.clip();
}

function drawArrowHead(x, y, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = "#ffde22";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-70, -30);
  ctx.lineTo(-52, 36);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawHeatWaves(x, y, width) {
  ctx.strokeStyle = "rgba(255,255,255,0.62)";
  ctx.lineWidth = 8;
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath();
    const yy = y + i * 42;
    ctx.moveTo(x, yy);
    for (let cursor = x; cursor < x + width; cursor += 74) {
      ctx.quadraticCurveTo(cursor + 38, yy - 36, cursor + 74, yy);
    }
    ctx.stroke();
  }
}

function drawBackgroundGrid(palette, pulse) {
  ctx.save();
  ctx.globalAlpha = 0.15 + pulse * 0.08;
  ctx.strokeStyle = palette[1];
  ctx.lineWidth = 2;
  for (let x = -120; x < W + 120; x += 120) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 260, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += 90) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawKeywordVisual(keyword, palette, time) {
  const cx = W * 0.68;
  const cy = H * 0.46;
  const beat = Math.sin(time * 0.008) * 22;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineWidth = 18;
  ctx.strokeStyle = palette[1];
  ctx.fillStyle = palette[2];
  ctx.shadowColor = palette[1];
  ctx.shadowBlur = 35;

  if (keyword === "sun") {
    ctx.beginPath();
    ctx.arc(0, 0, 145 + beat, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 16; i += 1) {
      const a = (Math.PI * 2 * i) / 16 + time * 0.0008;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 190, Math.sin(a) * 190);
      ctx.lineTo(Math.cos(a) * 290, Math.sin(a) * 290);
      ctx.stroke();
    }
  } else if (keyword === "recycle") {
    for (let i = 0; i < 3; i += 1) {
      ctx.rotate((Math.PI * 2) / 3);
      drawArrow(0, -160 - beat * 0.2, 220, 70, palette);
    }
  } else if (keyword === "water") {
    for (let i = 0; i < 5; i += 1) {
      ctx.beginPath();
      ctx.ellipse(i * 78 - 160, Math.sin(time * 0.004 + i) * 45, 42, 110, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (keyword === "energy") {
    ctx.beginPath();
    ctx.moveTo(-40, -210);
    ctx.lineTo(100, -30);
    ctx.lineTo(24, -30);
    ctx.lineTo(80, 210);
    ctx.lineTo(-115, -5);
    ctx.lineTo(-20, -5);
    ctx.closePath();
    ctx.fill();
  } else if (keyword === "heat") {
    for (let i = 0; i < 5; i += 1) {
      ctx.beginPath();
      ctx.moveTo(i * 72 - 144, 170);
      ctx.bezierCurveTo(i * 72 - 230, 30, i * 72 - 70, -30 + beat, i * 72 - 144, -180);
      ctx.stroke();
    }
  } else if (keyword === "air") {
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.moveTo(-230, i * 62 - 90);
      ctx.bezierCurveTo(-60, i * 62 - 160, 70, i * 62 - 10, 230, i * 62 - 80);
      ctx.stroke();
    }
  } else if (keyword === "tech") {
    roundRect(-112, -180, 224, 360, 34);
    ctx.stroke();
    ctx.fillRect(-62, -88, 124, 176);
  } else if (keyword === "food") {
    ctx.beginPath();
    ctx.ellipse(0, 32, 210, 82, 0, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 8; i += 1) {
      ctx.beginPath();
      ctx.arc(Math.cos(i) * 105, Math.sin(i * 1.3) * 42 + 24, 24, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (keyword === "plant") {
    ctx.fillRect(-18, -10, 36, 250);
    for (let i = 0; i < 6; i += 1) {
      ctx.beginPath();
      ctx.ellipse(i % 2 ? 80 : -80, i * 38 - 120, 90, 42, i % 2 ? -0.45 : 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, 180 + beat, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 92, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 9; i += 1) {
      const a = (Math.PI * 2 * i) / 9 + time * 0.001;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 235, Math.sin(a) * 170, 18, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawArrow(x, y, width, height, palette) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(-width / 2, -height / 2);
  ctx.lineTo(width / 4, -height / 2);
  ctx.lineTo(width / 4, -height);
  ctx.lineTo(width / 2, 0);
  ctx.lineTo(width / 4, height);
  ctx.lineTo(width / 4, height / 2);
  ctx.lineTo(-width / 2, height / 2);
  ctx.closePath();
  ctx.fillStyle = palette[2];
  ctx.fill();
  ctx.restore();
}

function drawBeatBars(palette, time) {
  ctx.save();
  ctx.translate(130, H - 160);
  for (let i = 0; i < 18; i += 1) {
    const height = 40 + Math.abs(Math.sin(time * 0.01 + i * 0.7)) * 130;
    ctx.fillStyle = i % 3 === 0 ? palette[2] : palette[1];
    ctx.fillRect(i * 28, -height, 14, height);
  }
  ctx.restore();
}

function drawTextBlock(shot, palette, elapsedSeconds = 0, shotIndex = 0) {
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.46)";
  roundRect(92, 104, 810, 520, 28);
  ctx.fill();

  ctx.fillStyle = palette[2];
  ctx.font = "800 42px system-ui, sans-serif";
  ctx.fillText(titleInput.value || "Rap 科普短视频", 132, 178);

  ctx.fillStyle = palette[3];
  // 使用 shot 内相对时间，保证 Karaoke 高亮节奏正确
  const { localElapsed, shotDuration } = getShotLocalElapsed(elapsedSeconds, shotIndex);
  drawKaraokeLineText(shot.lyric || shot.rap || "", 132, 292, 720, 74, localElapsed, shotDuration, "left");

  ctx.fillStyle = palette[1];
  ctx.font = "700 34px system-ui, sans-serif";
  wrapText(shot.rap, 132, 520, 720, 46, 3);

  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.font = "800 30px system-ui, sans-serif";
  ctx.fillText(`BPM ${bpmInput.value || 96} / SHOT ${shot.id}`, 132, 704);
  ctx.restore();
}

// 计算全局时间在某个 shot 内的相对时间（用于 Karaoke 高亮计算）
// 返回 shot 内已过时间和真实时长（来自音频分析）
// 有真实音频分段数据时用真实时间，否则用 shot.duration 估算
function getShotLocalElapsed(globalElapsed, shotIndex) {
  if (!shots.length || shotIndex < 0) return { localElapsed: 0, shotDuration: 3.5 };
  if (globalElapsed <= 0) return { localElapsed: 0, shotDuration: shots[shotIndex]?.duration ?? 3.5 };

  const segs = currentAudioTiming?.shotSegments;
  if (segs && segs.length === shots.length && segs[shotIndex]) {
    const offset = currentAudioTiming?.startOffset ?? 0;
    const audioAbs = globalElapsed + offset;
    const seg = segs[shotIndex];
    const localElapsed = Math.max(0, audioAbs - seg.start);
    return { localElapsed, shotDuration: seg.end - seg.start };
  }

  // 回退：按固定 duration 累加
  let cursor = 0;
  for (let i = 0; i < shotIndex; i += 1) cursor += shots[i]?.duration ?? 3.5;
  const dur = shots[shotIndex]?.duration ?? 3.5;
  return { localElapsed: Math.max(0, globalElapsed - cursor), shotDuration: dur };
}

function drawProgress(shotIndex, palette) {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(92, H - 86, W - 184, 12);
  ctx.fillStyle = palette[2];
  const total = Math.max(shots.length, 1);
  ctx.fillRect(92, H - 86, ((shotIndex + 1) / total) * (W - 184), 12);
  ctx.restore();
}

function wrapText(text, x, y, maxWidth, lineHeight, maxLines) {
  const chars = Array.from(text);
  let line = "";
  let lines = 0;
  for (const char of chars) {
    const test = line + char;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      lines += 1;
      line = char;
      if (lines >= maxLines - 1) break;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
}

function roundRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

async function preview() {
  buildShots();
  cancelAnimationFrame(previewTimer);

  // 预览前预加载所有已生成的图片，保证动画一开始就能显示
  const pendingImages = [];
  const seen = new Set();
  for (const shot of shots) {
    const src = shot.imageDataUrl || shot.imageUrl;
    if (src && !seen.has(src)) {
      seen.add(src);
      if (getCachedImageStatus(src) !== "ready") {
        pendingImages.push(preloadImage(src));
      }
    }
  }
  if (pendingImages.length) {
    exportHint.textContent = `正在预加载 ${pendingImages.length} 张图片...`;
    await Promise.allSettled(pendingImages);
    exportHint.textContent = "";
  }

  const audioReady = await startPreviewAudio();
  if (audioReady) {
    renderTimeline();
  }

  function tick(now) {
    const elapsed = audioReady
      ? getSyncedElapsed(songPlayer.currentTime)
      : getSyncedElapsed(((now - start) / 1000) % getTotalDuration());
    const index = getShotIndexAtTime(elapsed);
    drawFrame(now, index, elapsed);
    updateActiveShot(index);
    // 有真实音频时用音频实际时长判断结束，没有时用 shot 估算时长
    const totalDuration = audioReady && currentAudioTiming?.duration > 0
      ? currentAudioTiming.duration
      : getTotalDuration();
    if (elapsed >= totalDuration - 0.02) {
      songPlayer.pause();
      cancelAnimationFrame(previewTimer);
      drawFrame(now, shots.length - 1, totalDuration);
      updateActiveShot(shots.length - 1);
      return;
    }
    previewTimer = requestAnimationFrame(tick);
  }
  const start = performance.now();
  previewTimer = requestAnimationFrame(tick);
}

async function startPreviewAudio() {
  if (!songPlayer.currentSrc) return false;
  try {
    const timing = await ensureAudioTiming();
    await waitForMediaMetadata(songPlayer);
    songPlayer.pause();
    songPlayer.currentTime = timing?.startOffset || 0;
    await songPlayer.play();
    return true;
  } catch (error) {
    exportHint.textContent = `音频无法自动播放：${error.message}。已改用画面预览。`;
    return false;
  }
}

function updateActiveShot(index) {
  [...timeline.children].forEach((item, itemIndex) => {
    item.classList.toggle("active", itemIndex === index);
  });
}

// 等待所有已生成的图片加载完成，确保导出视频时画面不为空
async function ensureImagesReady() {
  const pending = [];
  const seen = new Set();
  for (const shot of shots) {
    const src = shot.imageDataUrl || shot.imageUrl;
    if (!src || seen.has(src)) continue;
    seen.add(src);
    const status = getCachedImageStatus(src);
    if (status !== "ready") {
      pending.push(preloadImage(src));
    }
  }
  if (!pending.length) return;
  exportHint.textContent = `正在预加载 ${pending.length} 张图片...`;
  await Promise.allSettled(pending);
  exportHint.textContent = "图片预加载完成，开始录制...";
}

// 录制前确保 shot 时长已按 BPM 同步
async function exportVideo() {
  buildShots();
  cancelAnimationFrame(previewTimer);

  syncShotDurations(); // 先同步时长（后续录制 loop 依赖 shots[i].duration）
  await ensureImagesReady(); // 再预加载图片（导出时需要 imageDataUrl）

  setBusy(true);
  let audio;
  let audioLabel = "浏览器合成节拍";
  try {
    const recordingAudio = await resolveRecordingAudio();
    audio = recordingAudio.audio;
    audioLabel = recordingAudio.title;
  } catch (error) {
    exportHint.textContent = error.message;
    setBusy(false, true);
    return;
  }

  const stream = canvas.captureStream(30);
  audio.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
  if (!window.MediaRecorder) {
    exportHint.textContent = "当前浏览器不支持 MediaRecorder，无法直接导出视频。请换 Safari、Chrome 或 Edge。";
    audio.close();
    setBusy(false, true);
    return;
  }
  const candidates = [
    "video/mp4;codecs=h264",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm"
  ];
  const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type));

  if (!mimeType) {
    exportHint.textContent = "当前浏览器不支持 Canvas 视频录制，请换 Safari、Chrome 或 Edge。";
    audio.close();
    setBusy(false, true);
    return;
  }

  const extension = mimeType.includes("mp4") ? "mp4" : "webm";
  exportHint.textContent =
    extension === "mp4"
      ? "正在导出 MP4..."
      : "当前浏览器不支持 MP4 录制，正在导出 WebM。需要 MP4 时可用 Safari 打开本页。";

  const chunks = [];
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 9000000 });
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rap-science-video.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
    audio.close();
    exportHint.textContent = `已导出 ${extension.toUpperCase()} 文件，音频来自 ${audioLabel}。`;
    setBusy(false);
  };

  exportHint.textContent = "正在录制画面和人声 rap...";
  recorder.start();
  await audio.start();
  await playOnceForRecording();
  recorder.stop();
}

async function resolveRecordingAudio() {
  const manualSong = getManualSong();
  if (manualSong) {
    let timing = null;
    try {
      timing = await ensureAudioTiming();
    } catch (error) {
      exportHint.textContent = `音频起止点分析失败，已回退到完整音频：${error.message}`;
    }
    return {
      audio: await createSongAudioStream(manualSong.audioUrl, timing),
      title: manualSong.title
    };
  }

  if (isTestModeEnabled()) {
    exportHint.textContent =
      "测试模式已开启，未调用音乐 API。当前没有可用音频时，导出将使用浏览器合成节拍。";
    return {
      audio: createBeatStream(getTotalDuration()),
      title: "测试节拍"
    };
  }

  const shouldUseSuno = apiKeyInput.value.trim() || currentSong?.audioUrl;
  if (shouldUseSuno) {
    const song = await ensureSong();
    let timing = null;
    try {
      timing = await ensureAudioTiming();
    } catch (error) {
      exportHint.textContent = `音频起止点分析失败，已回退到完整音频：${error.message}`;
    }
    return {
      audio: await createSongAudioStream(song.audioUrl, timing),
      title: song.title || "Suno rap"
    };
  }

  exportHint.textContent = "未填写 API Key 或音频文件，正在使用浏览器合成节拍导出演示版。";
  return {
    audio: createBeatStream(getTotalDuration()),
    title: "浏览器合成节拍"
  };
}

async function generateSong() {
  buildShots();
  const manualSong = getManualSong();
  if (manualSong) {
    currentSong = manualSong;
    currentSongKey = getSongKey();
    songPlayer.src = manualSong.audioUrl;
    exportHint.textContent = "已使用手动提供的音频，可直接导出。";
    return;
  }

  if (isTestModeEnabled()) {
    currentSong = null;
    currentSongKey = getSongKey();
    songPlayer.removeAttribute("src");
    exportHint.textContent =
      "测试模式已开启：不调用音乐 API。请先接入本地音频，或直接导出使用浏览器合成节拍。";
    return;
  }

  setBusy(true);
  try {
    currentSong = await createSunoSong();
    currentSongKey = getSongKey();
    songPlayer.src = currentSong.audioUrl;
    exportHint.textContent = `说唱生成完成：${currentSong.title || "Rap 科普短视频"}`;
  } catch (error) {
    currentSong = null;
    currentSongKey = "";
    exportHint.textContent = error.message;
    setBusy(false, true);
    return;
  }
  setBusy(false);
}

async function ensureSong() {
  const manualSong = getManualSong();
  if (manualSong) {
    currentSong = manualSong;
    currentSongKey = getSongKey();
    songPlayer.src = manualSong.audioUrl;
    return manualSong;
  }

  if (isTestModeEnabled()) {
    currentSong = null;
    currentSongKey = getSongKey();
    songPlayer.removeAttribute("src");
    return null;
  }

  if (currentSong?.audioUrl && currentSongKey === getSongKey()) {
    return currentSong;
  }
  buildShots();
  exportHint.textContent = "正在生成带人声的 rap 音频...";
  currentSong = await createSunoSong();
  currentSongKey = getSongKey();
  songPlayer.src = currentSong.audioUrl;
  return currentSong;
}

function getManualSong() {
  const url = localAudioObjectUrl || manualAudioUrlInput.value.trim();
  if (!url) return null;
  return {
    id: "manual-audio",
    title: localAudioObjectUrl ? "本地音频" : "手动音频 URL",
    audioUrl: url,
    imageUrl: ""
  };
}

function updateManualAudioPreview() {
  const manualSong = getManualSong();
  if (manualSong) {
    songPlayer.src = manualSong.audioUrl;
  } else {
    if (!isTestModeEnabled()) songPlayer.removeAttribute("src");
  }
}

async function createSunoSong() {
  const apiBase = normalizeApiBase(apiBaseInput.value);
  const lyrics = getRapLyrics();
  const prompt = getMusicPrompt();
  if (!apiBase) throw new Error("请填写 Suno API 地址。");
  if (!lyrics) throw new Error("请先输入歌词。");
  if (!apiKeyInput.value.trim() && providerInput.value !== "custom") {
    throw new Error("请填写第三方代理服务商的 API Key。");
  }

  const customPayload = {
    prompt,
    tags: musicStyleInput.value.trim() || "Chinese rap, hip hop, clear vocal, science education",
    title: titleInput.value.trim() || "Rap 科普短视频",
    make_instrumental: false,
    wait_audio: false
  };

  exportHint.textContent = "正在提交 Suno 生成任务...";
  if (providerInput.value === "sunoapi") {
    return createSunoApiOrgSong(apiBase, customPayload);
  }
  if (providerInput.value === "sunoboard") {
    return createSunoboardSong(apiBase, customPayload);
  }

  const created = await createSongTask(apiBase, customPayload);
  const immediate = extractSong(created);
  if (immediate?.audioUrl) return immediate;

  const ids = extractIds(created);
  if (!ids.length) {
    throw new Error("Suno API 没有返回任务 id 或音频地址，请检查 /api/generate 返回格式。");
  }

  exportHint.textContent = `任务已提交，正在等待音频生成：${ids.join(", ")}`;
  return pollSunoSong(apiBase, ids);
}

async function createSongTask(apiBase, customPayload) {
  const attempts = [
    {
      url: `${apiBase}/api/custom_generate`,
      payload: customPayload
    },
    {
      url: `${apiBase}/api/generate`,
      payload: {
        prompt: customPayload.prompt,
        make_instrumental: false,
        wait_audio: false
      }
    },
    {
      url: `${apiBase}/api/generate`,
      payload: {
        prompt: customPayload.prompt,
        style: customPayload.tags,
        title: customPayload.title,
        customMode: true,
        instrumental: false,
        model: "V3_5"
      }
    },
    {
      url: `${apiBase}/api/generate`,
      payload: {
        prompt: customPayload.prompt,
        style: customPayload.tags,
        title: customPayload.title,
        customMode: true,
        instrumental: false,
        model: "V4"
      }
    }
  ];

  const errors = [];
  for (const attempt of attempts) {
    try {
      return await postJson(attempt.url, attempt.payload);
    } catch (error) {
      errors.push(error.message);
      if (!/404|405|422|400/.test(error.message)) throw error;
    }
  }
  if (errors.some((message) => /couldn'?t verify your request/i.test(message))) {
    throw new Error(
      "Suno 上游校验失败：你的 Vercel API 后端会话/Cookie/token 失效或未配置，前端请求格式已经不是主要问题。请更新该 API 服务端的 Suno Cookie 或鉴权配置；也可以先填“已有音频 URL”或上传本地音频后直接导出。"
    );
  }
  throw new Error(`Suno API 请求失败，已尝试多种格式：${errors.join(" | ")}`);
}

async function createSunoApiOrgSong(apiBase, customPayload) {
  const payload = {
    prompt: customPayload.prompt,
    style: customPayload.tags,
    title: customPayload.title,
    customMode: true,
    instrumental: false,
    model: "V4_5ALL",
    callBackUrl: "https://example.com/suno-callback"
  };

  const created = await postJson(`${apiBase}/api/v1/generate`, payload);
  assertSuccessfulProviderResponse(created, "sunoapi.org");
  const immediate = extractSong(created);
  if (immediate?.audioUrl) return immediate;

  const taskId = extractTaskId(created);
  if (!taskId) {
    throw new Error(`sunoapi.org 没有返回 taskId，返回摘要：${summarizeJson(created)}`);
  }

  exportHint.textContent = `任务已提交，正在等待音频生成：${taskId}`;
  return pollSunoApiOrgSong(apiBase, taskId);
}

async function pollSunoApiOrgSong(apiBase, taskId) {
  const startedAt = Date.now();
  const timeoutMs = 8 * 60 * 1000;
  while (Date.now() - startedAt < timeoutMs) {
    await delay(8000);
    const result = await getJson(
      `${apiBase}/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`
    );
    assertSuccessfulProviderResponse(result, "sunoapi.org");
    const song = extractSong(result);
    if (song?.audioUrl) return song;

    const status = extractStatus(result);
    if (/fail|error|reject/i.test(status)) {
      throw new Error(`sunoapi.org 生成失败：${status}`);
    }
    exportHint.textContent = `sunoapi.org 正在生成说唱音频... ${Math.round(
      (Date.now() - startedAt) / 1000
    )}s`;
  }
  throw new Error("sunoapi.org 生成超时，请检查任务状态、余额或稍后重试。");
}

async function createSunoboardSong(apiBase, customPayload) {
  const payload = {
    prompt: customPayload.prompt,
    style: customPayload.tags,
    title: customPayload.title,
    customMode: true,
    instrumental: false,
    model: "V3_5"
  };

  const attempts = [
    { url: `${apiBase}/api/v1/generate`, payload },
    { url: `${apiBase}/api/generate`, payload },
    {
      url: `${apiBase}/api/custom_generate`,
      payload: {
        prompt: customPayload.prompt,
        tags: customPayload.tags,
        title: customPayload.title,
        make_instrumental: false,
        wait_audio: false
      }
    }
  ];

  const errors = [];
  for (const attempt of attempts) {
    try {
      const created = await postJson(attempt.url, attempt.payload);
      const immediate = extractSong(created);
      if (immediate?.audioUrl) return immediate;
      const taskId = extractTaskId(created);
      const ids = extractIds(created);
      if (taskId) return pollSunoApiOrgSong(apiBase, taskId);
      if (ids.length) return pollSunoSong(apiBase, ids);
      throw new Error("Sunoboard 没有返回任务 id 或音频地址，请检查该服务商的接口文档。");
    } catch (error) {
      errors.push(error.message);
      if (!/404|405|422|400/.test(error.message)) throw error;
    }
  }
  throw new Error(`Sunoboard 请求失败：${errors.join(" | ")}`);
}

async function pollSunoSong(apiBase, ids) {
  const startedAt = Date.now();
  const timeoutMs = 7 * 60 * 1000;
  while (Date.now() - startedAt < timeoutMs) {
    await delay(8000);
    const result = await getJson(`${apiBase}/api/get?ids=${encodeURIComponent(ids.join(","))}`);
    const song = extractSong(result);
    if (song?.audioUrl) return song;

    const status = extractStatus(result);
    if (/fail|error|reject/i.test(status)) {
      throw new Error(`Suno 生成失败：${status}`);
    }
    exportHint.textContent = `正在生成说唱音频... ${Math.round((Date.now() - startedAt) / 1000)}s`;
  }
  throw new Error("Suno 生成超时，请稍后重试或检查 API 服务。");
}

async function postJson(url, payload, token = apiKeyInput.value.trim()) {
  const response = await fetch(url, {
    method: "POST",
    headers: buildRequestHeaders(true, token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`API 请求失败：${response.status} ${response.statusText}${detail ? ` - ${detail}` : ""}`);
  }
  return response.json();
}

async function postImageJson(url, payload, token) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token.toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`图像 API 请求失败：${response.status} ${response.statusText}${detail ? ` - ${detail}` : ""}`);
  }
  return response.json();
}

async function getJson(url, token = apiKeyInput.value.trim()) {
  const response = await fetch(url, { headers: buildRequestHeaders(false, token) });
  if (!response.ok) throw new Error(`API 查询失败：${response.status} ${response.statusText}`);
  return response.json();
}

async function getImageJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Authorization: token.toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}`
    }
  });
  if (!response.ok) throw new Error(`图像查询失败：${response.status} ${response.statusText}`);
  return response.json();
}

function assertSuccessfulProviderResponse(data, providerName) {
  if (data?.code === undefined || data.code === 200 || data.code === "200") return;
  const message = data?.msg || data?.message || data?.error || summarizeJson(data);
  throw new Error(`${providerName} 返回业务错误：${message}`);
}

function summarizeJson(data) {
  const text = JSON.stringify(data);
  return text.length > 420 ? `${text.slice(0, 420)}...` : text;
}

function buildRequestHeaders(hasBody, tokenValue = apiKeyInput.value.trim()) {
  const headers = {};
  if (hasBody) headers["Content-Type"] = "application/json";
  const token = tokenValue.trim();
  if (token) {
    headers.Authorization = token.toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}`;
    headers["x-api-key"] = token;
  }
  return headers;
}

function normalizeApiBase(value) {
  return (value || "").trim().replace(/\/+$/, "");
}

function extractSong(data) {
  const list = normalizeList(data);
  const item = list.find((entry) => {
    const url =
      entry?.audio_url ||
      entry?.audioUrl ||
      entry?.audio ||
      entry?.url ||
      entry?.sourceAudioUrl ||
      entry?.streamAudioUrl;
    return typeof url === "string" && /^https?:\/\//.test(url);
  });
  if (!item) return null;
  return {
    id: item.id || item.clip_id || item.task_id || item.taskId || "",
    title: item.title || titleInput.value.trim(),
    audioUrl:
      item.audio_url ||
      item.audioUrl ||
      item.audio ||
      item.url ||
      item.sourceAudioUrl ||
      item.streamAudioUrl,
    imageUrl: item.image_url || item.imageUrl || item.image || ""
  };
}

function extractTaskId(data) {
  return (
    (typeof data?.data === "string" ? data.data : "") ||
    data?.taskId ||
    data?.task_id ||
    data?.id ||
    data?.data?.taskId ||
    data?.data?.task_id ||
    data?.data?.id ||
    data?.result?.taskId ||
    data?.result?.task_id ||
    data?.result?.id ||
    ""
  );
}

function extractIds(data) {
  return normalizeList(data)
    .map((item) => item?.id || item?.clip_id || item?.task_id || item?.taskId)
    .filter(Boolean);
}

function extractStatus(data) {
  const direct = [
    data?.status,
    data?.state,
    data?.message,
    data?.msg,
    data?.data?.status,
    data?.data?.state,
    data?.data?.message,
    data?.data?.msg
  ].filter(Boolean);
  const nested = normalizeList(data)
    .map((item) => item?.status || item?.state || item?.message || item?.msg || "")
    .filter(Boolean);
  return [...direct, ...nested].join(", ");
}

function normalizeList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.data?.data)) return data.data.data;
  if (Array.isArray(data?.data?.records)) return data.data.records;
  if (Array.isArray(data?.data?.response?.sunoData)) return data.data.response.sunoData;
  if (Array.isArray(data?.response?.sunoData)) return data.response.sunoData;
  if (Array.isArray(data?.clips)) return data.clips;
  if (Array.isArray(data?.songs)) return data.songs;
  if (Array.isArray(data?.result)) return data.result;
  if (Array.isArray(data?.result?.sunoData)) return data.result.sunoData;
  if (Array.isArray(data?.result?.data)) return data.result.data;
  if (data?.data && typeof data.data === "object") return [data.data];
  if (data?.data?.response && typeof data.data.response === "object") return [data.data.response];
  if (data?.result && typeof data.result === "object") return [data.result];
  return data ? [data] : [];
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createSongAudioStream(audioUrl, timing = null) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const audioContext = new AudioContextClass();
  let audioBuffer;
  try {
    const response = await fetch(audioUrl);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const buffer = await response.arrayBuffer();
    audioBuffer = await audioContext.decodeAudioData(buffer);
  } catch (error) {
    await audioContext.close();
    throw new Error(
      `音频读取失败：${error.message}。如果这是远程音频 URL，请确认该地址允许浏览器跨域下载；也可以下载后用“本地音频文件”上传。`
    );
  }
  const destination = audioContext.createMediaStreamDestination();
  const source = audioContext.createBufferSource();
  const gain = audioContext.createGain();
  gain.gain.value = 1;
  source.buffer = audioBuffer;
  source.connect(gain);
  gain.connect(destination);

  return {
    stream: destination.stream,
    duration: timing?.duration > 0 ? timing.duration : audioBuffer.duration,
    start: async () => {
      if (audioContext.state === "suspended") await audioContext.resume();
      const startOffset = Math.max(0, timing?.startOffset || 0);
      const playbackDuration = timing?.duration > 0 ? timing.duration : undefined;
      source.start(audioContext.currentTime + 0.03, startOffset, playbackDuration);
    },
    close: () => audioContext.close()
  };
}

// 每句固定 4 拍（1 小节），时长 = 240 / BPM 秒，与 Suno 提示词中的约束保持一致
// 不再依赖音频时长或字符数分配，保证预览、录制、导出时 shot 时长完全一致
function syncShotDurations() {
  if (!shots.length) return 0;
  // 有真实音频分段数据时，以音频分析出的实际时长为准，不再按 BPM 重写
  const segs = currentAudioTiming?.shotSegments;
  if (segs && segs.length === shots.length) return currentAudioTiming.duration;

  const bpm = Math.max(70, Math.min(180, Number(bpmInput.value) || 96));
  const beatsPerShot = 4;
  const secondsPerShot = (beatsPerShot * 60) / bpm;
  const totalBeats = shots.length * beatsPerShot;
  const computedDuration = (totalBeats * 60) / bpm;
  shots = shots.map((shot) => ({
    ...shot,
    duration: secondsPerShot
  }));
  return computedDuration;
}

// 节拍按 BPM 均匀生成，同时在每个 shot 边界插入音效标记
function createBeatStream(totalDuration) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const audioContext = new AudioContextClass();
  const destination = audioContext.createMediaStreamDestination();
  const masterGain = audioContext.createGain();
  masterGain.gain.value = 0.32;
  masterGain.connect(destination);
  // 收集所有 shot 边界时间点（秒，相对于音频起点）
  const shotBoundaryTimes = [0];
  let cursor = 0;
  for (const shot of shots) {
    cursor += shot.duration;
    shotBoundaryTimes.push(cursor);
  }
  const bpm = Math.max(70, Math.min(180, Number(bpmInput.value) || 96));
  const beatLength = 60 / bpm;
  const startAt = audioContext.currentTime + 0.08;
  const audioEndAt = startAt + totalDuration;
  const beatTimes = [];
  for (let t = startAt; t < audioEndAt; t += beatLength / 2) {
    beatTimes.push(t);
  }

  for (let i = 0; i < beatTimes.length; i += 1) {
    const t = beatTimes[i];
    const stepIndex = i % 4;
    if (stepIndex === 0) scheduleKick(audioContext, masterGain, t);
    if (stepIndex === 2) scheduleSnare(audioContext, masterGain, t);
    scheduleHat(audioContext, masterGain, t);
  }

  // 在每个 shot 边界插入一个响亮的提示音，让画面切换可感知
  for (const boundaryTime of shotBoundaryTimes) {
    if (boundaryTime <= 0 || boundaryTime > totalDuration) continue;
    const t = startAt + boundaryTime;
    scheduleShotAccent(audioContext, masterGain, t);
  }

  return {
    stream: destination.stream,
    duration: totalDuration,
    start: async () => {
      if (audioContext.state === "suspended") await audioContext.resume();
    },
    close: () => audioContext.close()
  };
}

function scheduleKick(audioContext, output, time) {
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(135, time);
  osc.frequency.exponentialRampToValueAtTime(42, time + 0.16);
  gain.gain.setValueAtTime(0.9, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
  osc.connect(gain);
  gain.connect(output);
  osc.start(time);
  osc.stop(time + 0.24);
}

function scheduleSnare(audioContext, output, time) {
  const bufferSize = audioContext.sampleRate * 0.16;
  const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const noise = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();
  noise.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.value = 1900;
  gain.gain.setValueAtTime(0.42, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(output);
  noise.start(time);
}

function scheduleHat(audioContext, output, time) {
  const bufferSize = audioContext.sampleRate * 0.045;
  const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const noise = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();
  noise.buffer = buffer;
  filter.type = "highpass";
  filter.frequency.value = 6500;
  gain.gain.setValueAtTime(0.16, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.045);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(output);
  noise.start(time);
}

// shot 边界提示音：短促的升调滑音，提示观众画面即将切换
function scheduleShotAccent(audioContext, output, time) {
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(600, time);
  osc.frequency.exponentialRampToValueAtTime(900, time + 0.06);
  gain.gain.setValueAtTime(0.5, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
  osc.connect(gain);
  gain.connect(output);
  osc.start(time);
  osc.stop(time + 0.12);
}

function playOnceForRecording() {
  return new Promise((resolve) => {
    const start = performance.now();
    // 有真实音频时用音频实际时长，否则用 shot 估算时长
    const totalDuration = currentAudioTiming?.duration > 0
      ? currentAudioTiming.duration
      : getTotalDuration();

    function tick(now) {
      const rawElapsedSeconds = (now - start) / 1000;
      if (rawElapsedSeconds >= totalDuration) {
        drawFrame(now, shots.length - 1, totalDuration);
        resolve();
        return;
      }

      // 与预览逻辑保持一致：通过 getSyncedElapsed 计算（无音频时等价于 rawElapsedSeconds）
      const elapsed = getSyncedElapsed(rawElapsedSeconds);
      const index = getShotIndexAtTime(elapsed);
      drawFrame(now, index, elapsed);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

generateBtn.addEventListener("click", buildShots);
generateImageBtn.addEventListener("click", generateImages);
songBtn.addEventListener("click", generateSong);
previewBtn.addEventListener("click", preview);
exportBtn.addEventListener("click", exportVideo);
styleInput.addEventListener("change", () => drawFrame(performance.now(), 0));
linesPerImageInput.addEventListener("change", () => {
  currentSong = null;
  currentSongKey = "";
  invalidateGeneratedImages();
  drawFrame(performance.now(), 0);
});
syncOffsetInput.addEventListener("input", () => {
  drawFrame(performance.now(), getShotIndexAtTime(getSyncedElapsed(songPlayer.currentTime || 0)));
});
secondsInput.addEventListener("input", () => {
  buildShots();
});
providerInput.addEventListener("change", () => {
  if (providerInput.value === "sunoapi") apiBaseInput.value = "https://api.sunoapi.org";
  if (providerInput.value === "sunoboard") apiBaseInput.value = "https://api.sunoboard.com";
  currentSong = null;
  currentSongKey = "";
  saveSettings();
});
[lyricsInput, titleInput, providerInput, apiBaseInput, apiKeyInput, musicStyleInput, manualAudioUrlInput].forEach((input) => {
  input.addEventListener("input", () => {
    currentSong = null;
    currentSongKey = "";
    updateManualAudioPreview();
    saveSettings();
  });
});

testModeEnabledInput.addEventListener("change", () => {
  syncMusicModeState();
  currentSong = null;
  currentSongKey = "";
  updateManualAudioPreview();
  drawFrame(performance.now(), getShotIndexAtTime(getSyncedElapsed(songPlayer.currentTime || 0)));
  saveSettings();
});

[imageApiKeyInput, styleInput, lyricsInput, titleInput, imageProviderInput, bpmInput, linesPerImageInput].forEach((input) => {
  input.addEventListener("input", () => {
    invalidateGeneratedImages();
    saveSettings();
  });
  input.addEventListener("change", () => {
    invalidateGeneratedImages();
    saveSettings();
  });
});

[bottomTickerEnabledInput, bottomTickerTextInput, secondsInput].forEach((input) => {
  input.addEventListener("input", () => {
    drawFrame(performance.now(), getShotIndexAtTime(0));
    saveSettings();
  });
  input.addEventListener("change", () => {
    drawFrame(performance.now(), getShotIndexAtTime(0));
    saveSettings();
  });
});

audioFileInput.addEventListener("change", () => {
  if (localAudioObjectUrl) URL.revokeObjectURL(localAudioObjectUrl);
  const file = audioFileInput.files?.[0];
  localAudioObjectUrl = file ? URL.createObjectURL(file) : "";
  currentSong = null;
  currentSongKey = "";
  updateManualAudioPreview();
  exportHint.textContent = file ? "已加载本地音频，可直接导出。" : "已清空本地音频。";
});

const STORAGE_KEY = "rap-media-settings";

function loadSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    const settings = JSON.parse(saved);
    if (settings.apiKey !== undefined) apiKeyInput.value = settings.apiKey;
    if (settings.imageApiKey !== undefined) imageApiKeyInput.value = settings.imageApiKey;
    if (settings.imageProvider !== undefined) imageProviderInput.value = settings.imageProvider;
    if (settings.provider !== undefined) providerInput.value = settings.provider;
    if (settings.apiBase !== undefined) apiBaseInput.value = settings.apiBase;
    if (settings.musicStyle !== undefined) musicStyleInput.value = settings.musicStyle;
    if (settings.testMode !== undefined) testModeEnabledInput.checked = settings.testMode;
    if (settings.style !== undefined) styleInput.value = settings.style;
    if (settings.seconds !== undefined) secondsInput.value = settings.seconds;
    if (settings.bpm !== undefined) bpmInput.value = settings.bpm;
    if (settings.bottomTickerEnabled !== undefined) bottomTickerEnabledInput.checked = settings.bottomTickerEnabled;
    if (settings.bottomTickerText !== undefined) bottomTickerTextInput.value = settings.bottomTickerText;
    if (settings.linesPerImage !== undefined) linesPerImageInput.value = settings.linesPerImage;
  } catch {}
}

function saveSettings() {
  try {
    const settings = {
      apiKey: apiKeyInput.value,
      imageApiKey: imageApiKeyInput.value,
      imageProvider: imageProviderInput.value,
      provider: providerInput.value,
      apiBase: apiBaseInput.value,
      musicStyle: musicStyleInput.value,
      testMode: testModeEnabledInput.checked,
      style: styleInput.value,
      seconds: secondsInput.value,
      bpm: bpmInput.value,
      bottomTickerEnabled: bottomTickerEnabledInput.checked,
      bottomTickerText: bottomTickerTextInput.value,
      linesPerImage: linesPerImageInput.value
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

buildShots();
syncMusicModeState();
loadSettings();
