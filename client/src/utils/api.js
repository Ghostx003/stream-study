// Base URL for API requests. In production, relative '/api' hits the same Express origin.
const API_BASE = '/api';

export async function fetchJson(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error ${response.status}`);
  }

  return response.json();
}

export const api = {
  // Network info
  getNetwork: () => fetchJson('/network'),
  getCandidatePorts: () => fetchJson('/network/candidate-ports'),

  // Media roots
  getRoots: () => fetchJson('/roots'),
  addRoot: (path, label) => fetchJson('/roots', {
    method: 'POST',
    body: JSON.stringify({ path, label })
  }),
  selectRoot: (rootId) => fetchJson('/roots/select', {
    method: 'POST',
    body: JSON.stringify({ rootId })
  }),
  removeRoot: (rootId) => fetchJson(`/roots/${rootId}`, {
    method: 'DELETE'
  }),

  // Windows native folder dialog
  pickFolderDialog: () => fetchJson('/system/pick-folder', {
    method: 'POST'
  }),

  // Host Directory Explorer (Works directly on mobile phones & remote access)
  getDrives: () => fetchJson('/system/drives'),
  browseDirectory: (targetPath = '') => fetchJson(`/system/browse?path=${encodeURIComponent(targetPath)}`),

  // Filesystem scanning
  scanFolder: (rootId = null, subPath = '') => {
    const params = new URLSearchParams();
    if (rootId) params.append('rootId', rootId);
    if (subPath) params.append('path', subPath);
    return fetchJson(`/scan?${params.toString()}`);
  },

  // Video streaming stream URL
  getVideoStreamUrl: (key, options = {}) => {
    const params = new URLSearchParams();
    params.append('key', key);
    if (options.audio !== undefined && options.audio !== null) {
      params.append('audio', options.audio);
    }
    if (options.startTime !== undefined && options.startTime !== null && options.startTime > 0) {
      params.append('startTime', options.startTime);
    }
    if (options.remux) {
      params.append('remux', '1');
    }
    if (options.direct) {
      params.append('direct', '1');
    }
    return `${API_BASE}/stream?${params.toString()}`;
  },

  // Audio and embedded subtitle tracks
  getMediaTracks: (key) => fetchJson(`/media/tracks?key=${encodeURIComponent(key)}`),

  // Progress and bookmarks
  getProgress: (key) => fetchJson(`/progress?key=${encodeURIComponent(key)}`),
  updateProgress: (key, updates) => fetchJson('/progress', {
    method: 'POST',
    body: JSON.stringify({ key, ...updates })
  }),
  toggleCompleted: (key, completed = null) => fetchJson('/progress/toggle', {
    method: 'POST',
    body: JSON.stringify({ key, completed })
  }),
  saveBookmark: (key, time) => fetchJson('/progress/bookmark', {
    method: 'POST',
    body: JSON.stringify({ key, time })
  }),
  removeBookmark: (key, time) => fetchJson('/progress/bookmark', {
    method: 'DELETE',
    body: JSON.stringify({ key, time })
  }),
  clearBookmarks: (key) => fetchJson('/progress/bookmarks/clear', {
    method: 'DELETE',
    body: JSON.stringify({ key })
  }),
  reportDuration: (key, duration) => fetchJson('/progress/duration', {
    method: 'POST',
    body: JSON.stringify({ key, duration })
  }),

  // Settings
  getSettings: () => fetchJson('/settings'),
  updateSettings: (settings) => fetchJson('/settings', {
    method: 'POST',
    body: JSON.stringify(settings)
  })
};
