import fs from 'fs';
import path from 'path';
import { metadataService } from './metadata.js';
import { configManager } from './configManager.js';

const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.webm', '.mov', '.avi', '.m4v', '.ts', '.ogv', '.flv'
]);

const SUBTITLE_EXTENSIONS = new Set([
  '.srt', '.vtt', '.sub', '.ass', '.ssa'
]);

const IGNORED_NAMES = new Set([
  '$recycle.bin', 'system volume information', '.git', '.vscode',
  'node_modules', '.ds_store', 'thumbs.db'
]);

/**
 * Natural sort comparator for alphanumeric strings (e.g. Lecture 2 before Lecture 10)
 */
export function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Checks if a filename has a supported video extension
 */
export function isVideoFile(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  return VIDEO_EXTENSIONS.has(ext);
}

/**
 * Checks if a filename has a supported subtitle extension
 */
export function isSubtitleFile(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  return SUBTITLE_EXTENSIONS.has(ext);
}

/**
 * Checks if a file or folder should be ignored
 */
export function isIgnored(name) {
  if (name.startsWith('.')) return true;
  return IGNORED_NAMES.has(name.toLowerCase());
}

/**
 * Generates a stable lecture key for progress tracking
 */
export function generateLectureKey(rootId, relativePath) {
  // Normalize slashes to forward slashes for cross-platform stability
  const normalized = relativePath.split(path.sep).join('/');
  return `${rootId}::${normalized}`;
}

/**
 * Safely resolves a relative path within a media root, preventing directory traversal.
 * @returns {string} Fully resolved absolute path
 * @throws {Error} if path escapes root directory
 */
export function resolveSecurePath(rootPath, relativeSubPath = '') {
  const resolvedRoot = path.resolve(rootPath);
  const targetPath = path.resolve(resolvedRoot, relativeSubPath || '');

  // Must start with the root path directory prefix
  if (!targetPath.startsWith(resolvedRoot)) {
    throw new Error('Access denied: directory traversal detected');
  }

  return targetPath;
}

// Asynchronous background pre-warmer that fills metadata cache for unprobed videos
function warmFolderMetadataInBackground(dirPath, rootId, relativeBase = '') {
  setTimeout(async () => {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (isIgnored(entry.name)) continue;
        const full = path.join(dirPath, entry.name);
        const rel = relativeBase ? `${relativeBase}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          warmFolderMetadataInBackground(full, rootId, rel);
        } else if (entry.isFile() && isVideoFile(entry.name)) {
          try {
            const stat = fs.statSync(full);
            const cacheKey = `${full}::${stat.size}::${stat.mtimeMs}`;
            if (!metadataService.cache[cacheKey] || !metadataService.cache[cacheKey].duration) {
              await metadataService.getVideoDuration(full);
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
  }, 500);
}

/**
 * Quick recursive counter for subfolder stats without parsing deep metadata every time
 */
export function getFolderSummaryQuick(dirPath, rootId, relativeBase) {
  let totalVideos = 0;
  let totalSubfolders = 0;
  let totalDuration = 0;
  let completedCount = 0;

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (isIgnored(entry.name)) continue;

      if (entry.isDirectory()) {
        totalSubfolders++;
        const subRel = relativeBase ? `${relativeBase}/${entry.name}` : entry.name;
        const subSummary = getFolderSummaryQuick(path.join(dirPath, entry.name), rootId, subRel);
        totalVideos += subSummary.totalVideos;
        totalDuration += subSummary.totalDuration;
        completedCount += subSummary.completedCount;
      } else if (entry.isFile() && isVideoFile(entry.name)) {
        totalVideos++;
        const fileRel = relativeBase ? `${relativeBase}/${entry.name}` : entry.name;
        const lectureKey = generateLectureKey(rootId, fileRel);
        const progress = configManager.getLectureProgress(lectureKey);

        // Try getting cached duration if known
        let duration = progress.duration || 0;
        if (!duration) {
          try {
            const stat = fs.statSync(path.join(dirPath, entry.name));
            const cacheKey = `${path.join(dirPath, entry.name)}::${stat.size}::${stat.mtimeMs}`;
            if (metadataService.cache[cacheKey]) {
              duration = metadataService.cache[cacheKey].duration || 0;
            }
          } catch (e) {}
        }
        totalDuration += duration;
        if (progress.completed) {
          completedCount++;
        }
      }
    }
  } catch (err) {}

  return { totalVideos, totalSubfolders, totalDuration, completedCount };
}

// In-memory folder scan cache for instantaneous library/folder switching
const scanResultCache = new Map();
const SCAN_CACHE_TTL_MS = 25000; // 25 seconds TTL

export function invalidateScanCache(rootId) {
  if (rootId) {
    for (const key of scanResultCache.keys()) {
      if (key.startsWith(`${rootId}::`)) {
        scanResultCache.delete(key);
      }
    }
  } else {
    scanResultCache.clear();
  }
}

function rehydrateScanResult(data, rootId) {
  let currentFolderTotalDuration = 0;
  let currentFolderCompletedDuration = 0;
  let currentFolderCompletedCount = 0;

  const rehydratedLectures = (data.lectures || []).map((lec) => {
    const progress = configManager.getLectureProgress(lec.id);
    const completed = !!progress.completed;
    const currentTime = progress.currentTime || 0;
    const lectureDuration = lec.duration || progress.duration || 0;
    const remainingTime = completed ? 0 : Math.max(0, lectureDuration - currentTime);

    currentFolderTotalDuration += lectureDuration;
    if (completed) {
      currentFolderCompletedCount++;
      currentFolderCompletedDuration += lectureDuration;
    }

    return {
      ...lec,
      currentTime,
      remainingTime,
      completed,
      bookmarks: progress.bookmarks || [],
      lastWatched: progress.lastWatched || null
    };
  });

  let aggregateTotalVideos = rehydratedLectures.length;
  let aggregateTotalDuration = currentFolderTotalDuration;
  let aggregateCompletedCount = currentFolderCompletedCount;
  let aggregateCompletedDuration = currentFolderCompletedDuration;

  for (const f of (data.folders || [])) {
    aggregateTotalVideos += (f.videoCount || 0);
    aggregateTotalDuration += (f.totalDuration || 0);
    aggregateCompletedCount += (f.completedCount || 0);
    aggregateCompletedDuration += Math.max(0, (f.totalDuration || 0) - (f.remainingDuration || 0));
  }

  const aggregateRemainingDuration = Math.max(0, aggregateTotalDuration - aggregateCompletedDuration);
  const aggregateCompletionPercentage = aggregateTotalVideos > 0
    ? Math.round((aggregateCompletedCount / aggregateTotalVideos) * 100)
    : 0;

  return {
    ...data,
    lectures: rehydratedLectures,
    stats: {
      ...data.stats,
      totalDuration: aggregateTotalDuration,
      completedDuration: aggregateCompletedDuration,
      remainingDuration: aggregateRemainingDuration,
      totalLectures: aggregateTotalVideos,
      completedLectures: aggregateCompletedCount,
      completionPercentage: aggregateCompletionPercentage,
      directLecturesCount: rehydratedLectures.length
    }
  };
}

/**
 * Scans a specific folder level and returns folders and lectures with dynamic stats.
 */
export async function scanFolder(root, relativeSubPath = '') {
  const cacheKey = `${root.id}::${relativeSubPath}`;
  const now = Date.now();
  if (scanResultCache.has(cacheKey)) {
    const cached = scanResultCache.get(cacheKey);
    if (now - cached.timestamp < SCAN_CACHE_TTL_MS) {
      return rehydrateScanResult(cached.data, root.id);
    }
  }

  const rootPath = root.path;
  const targetDir = resolveSecurePath(rootPath, relativeSubPath);

  if (!fs.existsSync(targetDir)) {
    throw new Error(`Directory not found: "${targetDir}"`);
  }

  const stat = fs.statSync(targetDir);
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: "${targetDir}"`);
  }

  const entries = fs.readdirSync(targetDir, { withFileTypes: true });

  const rawFolders = [];
  const rawVideos = [];
  const rawSubtitles = [];

  for (const entry of entries) {
    if (isIgnored(entry.name)) continue;
    if (entry.isDirectory()) {
      rawFolders.push(entry.name);
    } else if (entry.isFile()) {
      if (isVideoFile(entry.name)) {
        rawVideos.push(entry.name);
      } else if (isSubtitleFile(entry.name)) {
        rawSubtitles.push(entry.name);
      }
    }
  }

  // Sort naturally
  rawFolders.sort(naturalCompare);
  rawVideos.sort(naturalCompare);

  // Process subfolders
  const folders = [];
  for (const folderName of rawFolders) {
    const folderRelPath = relativeSubPath ? `${relativeSubPath}/${folderName}` : folderName;
    const fullFolderPath = path.join(targetDir, folderName);
    const summary = getFolderSummaryQuick(fullFolderPath, root.id, folderRelPath);

    const remainingDuration = Math.max(0, summary.totalDuration - (summary.completedCount > 0 ? (summary.totalDuration * (summary.completedCount / Math.max(1, summary.totalVideos))) : 0));
    const completionPercentage = summary.totalVideos > 0 
      ? Math.round((summary.completedCount / summary.totalVideos) * 100) 
      : 0;

    folders.push({
      name: folderName,
      relativePath: folderRelPath,
      subfoldersCount: summary.totalSubfolders,
      videoCount: summary.totalVideos,
      totalDuration: summary.totalDuration,
      completedCount: summary.completedCount,
      remainingDuration: Math.round(remainingDuration),
      completionPercentage
    });
  }

  // Process video lectures in current folder
  const lectures = [];
  let currentFolderTotalDuration = 0;
  let currentFolderCompletedDuration = 0;
  let currentFolderCompletedCount = 0;

  for (const videoName of rawVideos) {
    const videoRelPath = relativeSubPath ? `${relativeSubPath}/${videoName}` : videoName;
    const fullVideoPath = path.join(targetDir, videoName);
    const lectureKey = generateLectureKey(root.id, videoRelPath);

    // Get duration (cached or probe)
    const duration = await metadataService.getVideoDuration(fullVideoPath);
    const progress = configManager.getLectureProgress(lectureKey);

    // Keep duration updated in progress if available
    if (duration > 0 && progress.duration !== duration) {
      configManager.updateLectureProgress(lectureKey, { duration });
    }

    const completed = !!progress.completed;
    const currentTime = progress.currentTime || 0;
    const lectureDuration = duration || progress.duration || 0;
    const remainingTime = completed ? 0 : Math.max(0, lectureDuration - currentTime);

    currentFolderTotalDuration += lectureDuration;
    if (completed) {
      currentFolderCompletedCount++;
      currentFolderCompletedDuration += lectureDuration;
    }

    // Associate subtitles matching this video
    const videoBase = path.parse(videoName).name.toLowerCase();
    const subtitles = [];
    for (const subName of rawSubtitles) {
      const subBase = path.parse(subName).name.toLowerCase();
      // Match if subtitle filename starts with video basename or if single video in directory
      if (subBase.startsWith(videoBase) || subBase === videoBase || rawVideos.length === 1) {
        const langMatch = subName.match(/\.([a-z]{2,3})\.[^.]+$/i);
        const langCode = langMatch ? langMatch[1].toLowerCase() : 'en';
        const label = langMatch 
          ? `Subtitle (${langMatch[1].toUpperCase()})` 
          : `${subName}`;
        subtitles.push({
          id: subName,
          fileName: subName,
          label,
          srclang: langCode,
          src: `/api/subtitles?key=${encodeURIComponent(lectureKey)}&file=${encodeURIComponent(subName)}`
        });
      }
    }

    // Associate embedded subtitles if cached in metadataService (avoiding duplicates)
    try {
      const vStat = fs.statSync(fullVideoPath);
      const cacheKey = `${fullVideoPath}::${vStat.size}::${vStat.mtimeMs}`;
      const cached = metadataService.cache[cacheKey];
      if (cached && cached.subtitles && cached.subtitles.length > 0) {
        for (const s of cached.subtitles) {
          const subId = `embedded_${s.streamIndex}`;
          if (!subtitles.some(x => x.id === subId || x.streamIndex === s.streamIndex)) {
            subtitles.push({
              id: subId,
              isEmbedded: true,
              streamIndex: s.streamIndex,
              label: s.label,
              srclang: s.language || 'en',
              src: `/api/subtitles/embedded?key=${encodeURIComponent(lectureKey)}&streamIndex=${s.streamIndex}`
            });
          }
        }
      }
    } catch (e) {}

    lectures.push({
      id: lectureKey,
      name: path.parse(videoName).name,
      fileName: videoName,
      relativePath: videoRelPath,
      duration: lectureDuration,
      currentTime,
      remainingTime,
      completed,
      bookmarks: progress.bookmarks || [],
      lastWatched: progress.lastWatched || null,
      subtitles
    });
  }

  // Calculate breadcrumbs
  const breadcrumbs = [{ name: root.label || 'Home', path: '' }];
  if (relativeSubPath) {
    const segments = relativeSubPath.split('/').filter(Boolean);
    let accum = '';
    for (const segment of segments) {
      accum = accum ? `${accum}/${segment}` : segment;
      breadcrumbs.push({ name: segment, path: accum });
    }
  }

  // Kick off background cache warmer on root scan
  if (!relativeSubPath) {
    warmFolderMetadataInBackground(rootPath, root.id);
  }

  // Calculate aggregate summary stats (direct lectures + all subfolders)
  let aggregateTotalVideos = lectures.length;
  let aggregateTotalDuration = currentFolderTotalDuration;
  let aggregateCompletedCount = currentFolderCompletedCount;
  let aggregateCompletedDuration = currentFolderCompletedDuration;

  for (const f of folders) {
    aggregateTotalVideos += (f.videoCount || 0);
    aggregateTotalDuration += (f.totalDuration || 0);
    aggregateCompletedCount += (f.completedCount || 0);
    aggregateCompletedDuration += Math.max(0, (f.totalDuration || 0) - (f.remainingDuration || 0));
  }

  const aggregateRemainingDuration = Math.max(0, aggregateTotalDuration - aggregateCompletedDuration);
  const aggregateCompletionPercentage = aggregateTotalVideos > 0
    ? Math.round((aggregateCompletedCount / aggregateTotalVideos) * 100)
    : 0;

  const result = {
    rootId: root.id,
    rootLabel: root.label,
    currentPath: relativeSubPath,
    breadcrumbs,
    stats: {
      totalDuration: aggregateTotalDuration,
      completedDuration: aggregateCompletedDuration,
      remainingDuration: aggregateRemainingDuration,
      totalLectures: aggregateTotalVideos,
      completedLectures: aggregateCompletedCount,
      completionPercentage: aggregateCompletionPercentage,
      totalFolders: folders.length,
      directLecturesCount: lectures.length
    },
    folders,
    lectures
  };

  scanResultCache.set(cacheKey, { timestamp: Date.now(), data: result });
  return result;
}
