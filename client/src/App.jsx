import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from './utils/api';
import Navbar from './components/Navbar';
import MobileNavBar from './components/MobileNavBar';
import Breadcrumbs from './components/Breadcrumbs';
import CourseGrid from './components/CourseGrid';
import LectureList from './components/LectureList';
import LecturePlayer from './components/Player/LecturePlayer';
import SetupView from './components/SetupView';
import SettingsModal from './components/SettingsModal';
import { formatDuration } from './utils/formatters';

// Parse route from URL hash: e.g. #/folder/sub%2Fpath or #/play/key?folder=sub%2Fpath
function parseHashRoute() {
  const hash = window.location.hash || '';
  if (hash.startsWith('#/play/')) {
    const rest = hash.slice('#/play/'.length);
    const [keyPart, queryPart] = rest.split('?');
    const lectureId = decodeURIComponent(keyPart || '');
    const params = new URLSearchParams(queryPart || '');
    const folder = params.get('folder') ? decodeURIComponent(params.get('folder')) : '';
    return { type: 'play', lectureId, folder };
  }
  if (hash.startsWith('#/folder/')) {
    const folder = decodeURIComponent(hash.slice('#/folder/'.length));
    return { type: 'folder', folder };
  }
  return { type: 'root', folder: '' };
}

export default function App() {
  const [networkInfo, setNetworkInfo] = useState(null);
  const [roots, setRoots] = useState([]);
  const [activeRoot, setActiveRoot] = useState(null);
  const [currentPath, setCurrentPath] = useState('');
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [folders, setFolders] = useState([]);
  const [lectures, setLectures] = useState([]);
  const [stats, setStats] = useState(null);
  const [activeLecture, setActiveLecture] = useState(null);

  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState(null);
  const [mobileTab, setMobileTab] = useState('home');

  const activeRootRef = useRef(null);
  activeRootRef.current = activeRoot;
  const folderCacheRef = useRef(new Map());
  const isSwitchingRootRef = useRef(false);

  // Helper for displaying toast notifications
  const showToast = useCallback((message, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => {
      setToast(null);
    }, 3200);
  }, []);

  const computeAggregatedStats = (data) => {
    if (!data) return null;
    let computedStats = data.stats;
    if (computedStats && computedStats.totalLectures === 0 && data.folders && data.folders.length > 0) {
      const totalVids = data.folders.reduce((acc, f) => acc + (f.videoCount || 0), 0);
      const totalDur = data.folders.reduce((acc, f) => acc + (f.totalDuration || 0), 0);
      const compCount = data.folders.reduce((acc, f) => acc + (f.completedCount || 0), 0);
      const remDur = data.folders.reduce((acc, f) => acc + (f.remainingDuration || 0), 0);
      const compDur = Math.max(0, totalDur - remDur);
      const pct = totalVids > 0 ? Math.round((compCount / totalVids) * 100) : 0;
      computedStats = {
        ...computedStats,
        totalLectures: totalVids,
        totalDuration: totalDur,
        completedLectures: compCount,
        completedDuration: compDur,
        remainingDuration: remDur,
        completionPercentage: pct
      };
    }
    return computedStats || null;
  };

  // Load contents of a folder with instantaneous client cache and background revalidation
  const loadFolderContents = useCallback(async (rootId, path = '', useCache = true) => {
    const cacheKey = `${rootId}::${path}`;
    if (useCache && folderCacheRef.current.has(cacheKey)) {
      const cached = folderCacheRef.current.get(cacheKey);
      setFolders(cached.folders || []);
      setLectures(cached.lectures || []);
      setBreadcrumbs(cached.breadcrumbs || []);
      setStats(cached.stats || null);
      setCurrentPath(path);
      setIsLoading(false);

      // Background silent revalidation without blocking UI
      api.scanFolder(rootId, path).then((data) => {
        if (!data || data.noRootConfigured) return;
        const computed = computeAggregatedStats(data);
        folderCacheRef.current.set(cacheKey, { ...data, stats: computed });
        setFolders(data.folders || []);
        setLectures(data.lectures || []);
        setBreadcrumbs(data.breadcrumbs || []);
        setStats(computed);
      }).catch(() => {});

      return cached;
    }

    setIsLoading(true);
    setErrorMsg('');
    try {
      const data = await api.scanFolder(rootId, path);
      if (data.noRootConfigured) {
        setActiveRoot(null);
        setFolders([]);
        setLectures([]);
        setStats(null);
        return null;
      }

      const computedStats = computeAggregatedStats(data);
      folderCacheRef.current.set(cacheKey, { ...data, stats: computedStats });
      setFolders(data.folders || []);
      setLectures(data.lectures || []);
      setBreadcrumbs(data.breadcrumbs || []);
      setStats(computedStats || null);
      setCurrentPath(path);
      return data;
    } catch (err) {
      setErrorMsg(err.message || 'Could not scan directory');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Route navigation applicator
  const applyRoute = useCallback(async (route, root) => {
    if (!root) return;

    if (route.type === 'play' && route.lectureId) {
      const folderPath = route.folder || '';
      const data = await loadFolderContents(root.id, folderPath);
      if (data && data.lectures) {
        const found = data.lectures.find(l => l.id === route.lectureId);
        if (found) {
          setActiveLecture(found);
        } else {
          // Fallback if opened via direct link
          const fileName = route.lectureId.split('::').pop()?.split('/').pop() || 'Lecture';
          setActiveLecture({
            id: route.lectureId,
            name: fileName.replace(/\.[^/.]+$/, ''),
            fileName,
            relativePath: route.lectureId.split('::').slice(1).join('::'),
            duration: 0,
            currentTime: 0,
            bookmarks: []
          });
        }
      }
    } else if (route.type === 'folder') {
      setActiveLecture(null);
      await loadFolderContents(root.id, route.folder || '');
    } else {
      setActiveLecture(null);
      await loadFolderContents(root.id, '');
    }
  }, [loadFolderContents]);

  // Initial application setup
  const initApp = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const net = await api.getNetwork();
      setNetworkInfo(net);

      const rootsData = await api.getRoots();
      setRoots(rootsData.roots || []);
      const root = rootsData.activeRoot || null;
      setActiveRoot(root);

      if (root) {
        const route = parseHashRoute();
        await applyRoute(route, root);
      }
    } catch (err) {
      setErrorMsg('Failed to connect to Courseflix LAN server.');
    } finally {
      setIsLoading(false);
    }
  }, [applyRoute]);

  useEffect(() => {
    initApp();
  }, [initApp]);

  // Listen to browser URL hash changes (back/forward buttons)
  useEffect(() => {
    const handleHashChange = () => {
      if (isSwitchingRootRef.current) {
        // Skip duplicate route application while optimistic root switch is handling it
        return;
      }
      const root = activeRootRef.current;
      if (root) {
        const route = parseHashRoute();
        applyRoute(route, root);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [applyRoute]);

  // Navigate into a subfolder
  const handleSelectFolder = (folderRelPath) => {
    window.location.hash = `#/folder/${encodeURIComponent(folderRelPath)}`;
  };

  // Breadcrumb navigation
  const handleNavigateBreadcrumb = (path) => {
    window.location.hash = path ? `#/folder/${encodeURIComponent(path)}` : '#/';
  };

  // Play lecture action
  const handlePlayLecture = (lec) => {
    setActiveLecture(lec);
    window.location.hash = `#/play/${encodeURIComponent(lec.id)}?folder=${encodeURIComponent(currentPath)}`;
  };

  // Shuffle play all content in the current folder / library
  const handleShufflePlay = useCallback(async () => {
    if (!activeRoot) {
      showToast('No active library selected to shuffle', true);
      return;
    }

    // If current folder has direct lectures and no subfolders, shuffle immediately
    if (folders.length === 0 && lectures.length > 0) {
      const shuffled = [...lectures];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const first = shuffled[0];
      setLectures(shuffled);
      setActiveLecture(first);
      window.location.hash = `#/play/${encodeURIComponent(first.id)}?folder=${encodeURIComponent(currentPath)}`;
      showToast(`Shuffled ${shuffled.length} videos`);
      return;
    }

    // Otherwise, fetch all content recursively in this folder/library
    showToast('Gathering and shuffling all videos...');
    try {
      const data = await api.scanAllLectures(activeRoot.id, currentPath);
      if (!data || !data.lectures || data.lectures.length === 0) {
        showToast('No videos found to shuffle in this folder', true);
        return;
      }
      const shuffled = [...data.lectures];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const first = shuffled[0];
      setLectures(shuffled);
      setActiveLecture(first);
      window.location.hash = `#/play/${encodeURIComponent(first.id)}?folder=${encodeURIComponent(first.parentFolder || currentPath)}`;
      showToast(`Shuffled ${shuffled.length} videos. Playing: ${first.name}`);
    } catch (err) {
      showToast(`Shuffle failed: ${err.message}`, true);
    }
  }, [activeRoot, currentPath, folders.length, lectures, showToast]);

  // Toggle lecture completion checkbox
  const handleToggleCompleted = async (lectureId, newStatus) => {
    try {
      await api.toggleCompleted(lectureId, newStatus);

      // Instantly update lecture in state for immediate feedback
      setLectures((prev) =>
        prev.map((lec) => {
          if (lec.id === lectureId) {
            return {
              ...lec,
              completed: newStatus,
              remainingTime: newStatus ? 0 : Math.max(0, (lec.duration || 0) - (lec.currentTime || 0))
            };
          }
          return lec;
        })
      );

      // Recalculate dynamic folder stats instantly
      setStats((prev) => {
        if (!prev) return prev;
        const target = lectures.find((l) => l.id === lectureId);
        const dur = target ? target.duration || 0 : 0;
        const newCompletedCount = newStatus ? prev.completedLectures + 1 : Math.max(0, prev.completedLectures - 1);
        const newCompletedDur = newStatus ? prev.completedDuration + dur : Math.max(0, prev.completedDuration - dur);
        const newRemainingDur = Math.max(0, prev.totalDuration - newCompletedDur);
        const newPct = prev.totalLectures > 0 ? Math.round((newCompletedCount / prev.totalLectures) * 100) : 0;

        return {
          ...prev,
          completedLectures: newCompletedCount,
          completedDuration: newCompletedDur,
          remainingDuration: newRemainingDur,
          completionPercentage: newPct
        };
      });

      showToast(newStatus ? 'Lecture marked as completed' : 'Lecture marked as uncompleted');
      folderCacheRef.current.clear();
    } catch (err) {
      showToast('Failed to update completion state', true);
    }
  };

  // Update lecture progress & bookmarks in memory
  const handleUpdateLectureProgress = useCallback((lectureId, updates) => {
    setLectures((prev) =>
      prev.map((l) => (l.id === lectureId ? { ...l, ...updates } : l))
    );
  }, []);

  // Return to folder from player
  const handleBackToFolder = () => {
    setActiveLecture(null);
    window.location.hash = currentPath ? `#/folder/${encodeURIComponent(currentPath)}` : '#/';
  };

  // Switch active media root directly from chips with instant optimistic UI update
  const handleSelectRoot = useCallback(async (rootId) => {
    const targetRoot = roots.find((r) => r.id === rootId);
    if (!targetRoot) return;

    // 1. Instant Optimistic UI Update (0ms visual latency)
    setActiveRoot(targetRoot);
    activeRootRef.current = targetRoot;
    setActiveLecture(null);
    setCurrentPath('');
    setBreadcrumbs([{ name: targetRoot.label || 'Home', path: '' }]);

    // Instant switch to cached view if available
    const cacheKey = `${targetRoot.id}::`;
    if (folderCacheRef.current.has(cacheKey)) {
      const cached = folderCacheRef.current.get(cacheKey);
      setFolders(cached.folders || []);
      setLectures(cached.lectures || []);
      setStats(cached.stats || null);
      setIsLoading(false);
    } else {
      setFolders([]);
      setLectures([]);
      setStats(null);
      setIsLoading(true);
    }

    isSwitchingRootRef.current = true;
    if (window.location.hash !== '#/' && window.location.hash !== '') {
      window.location.hash = '#/';
    }

    try {
      // 2. Parallel server root switch and folder load
      const [selectRes, scanData] = await Promise.all([
        api.selectRoot(rootId).catch(() => null),
        loadFolderContents(targetRoot.id, '', true)
      ]);

      if (selectRes && selectRes.roots) {
        setRoots(selectRes.roots);
      }
      showToast(`Switched library: ${targetRoot.label}`);
    } catch (err) {
      showToast(err.message || 'Failed to switch folder', true);
    } finally {
      setIsLoading(false);
      isSwitchingRootRef.current = false;
    }
  }, [roots, loadFolderContents, showToast]);

  // Root changed from setup or settings
  const handleRootConfigured = async (newRoot) => {
    setActiveRoot(newRoot);
    const rootsData = await api.getRoots();
    setRoots(rootsData.roots || []);
    window.location.hash = '#/';
    await loadFolderContents(newRoot.id, '');
  };

  return (
    <div className="app-container">
      {/* Toast Notification */}
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.isError ? 'toast-error' : 'toast-success'}`}>
            <i className={`fas fa-${toast.isError ? 'exclamation-circle' : 'check-circle'}`}></i>
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Top Navbar (Hidden while in immersive Netflix player) */}
      {!activeLecture && (
        <Navbar
          networkInfo={networkInfo}
          activeRoot={activeRoot}
          onOpenSettings={() => setShowSettings(true)}
          onGoHome={() => {
            window.location.hash = '#/';
          }}
          showToast={showToast}
        />
      )}

      {/* When playing a lecture, render the Netflix Player View */}
      {activeLecture ? (
        <LecturePlayer
          lecture={activeLecture}
          playlist={lectures}
          folderName={breadcrumbs[breadcrumbs.length - 1]?.name || activeRoot?.label}
          onSelectLecture={(lec) => {
            setActiveLecture(lec);
            window.location.hash = `#/play/${encodeURIComponent(lec.id)}?folder=${encodeURIComponent(currentPath)}`;
          }}
          onBackToFolder={handleBackToFolder}
          onToggleLectureCompleted={handleToggleCompleted}
          onUpdateLectureProgress={handleUpdateLectureProgress}
          showToast={showToast}
        />
      ) : (
        <main className="main-content">
          {/* First run / No Root Configured */}
          {!activeRoot ? (
            <SetupView
              networkInfo={networkInfo}
              onFolderConfigured={handleRootConfigured}
              showToast={showToast}
            />
          ) : (
            <>
              {/* Library / Media Folder Switcher Bar (Always visible on phone & desktop) */}
              {roots.length > 0 && (
                <div className="library-switcher-bar">
                  <div className="switcher-chips-scroll">
                    <span className="switcher-prefix">
                      <i className="fas fa-layer-group" style={{ color: 'var(--accent-primary)' }}></i>
                      <span>Folders:</span>
                    </span>
                    {roots.map((r) => {
                      const isActive = activeRoot && activeRoot.id === r.id;
                      return (
                        <button
                          key={r.id}
                          className={`switcher-chip ${isActive ? 'active' : ''}`}
                          onClick={() => !isActive && handleSelectRoot(r.id)}
                          title={r.path}
                        >
                          <i className={`fas ${isActive ? 'fa-check-circle' : 'fa-folder'}`}></i>
                          <span className="switcher-chip-name">{r.label}</span>
                        </button>
                      );
                    })}
                    <button
                      className="switcher-chip add-folder-chip"
                      onClick={() => setShowSettings(true)}
                      title="Add or browse more folders"
                    >
                      <i className="fas fa-plus"></i>
                      <span>Add Folder</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Breadcrumb Navigation */}
              <Breadcrumbs
                breadcrumbs={breadcrumbs}
                onNavigate={handleNavigateBreadcrumb}
              />

              {/* Error message */}
              {errorMsg && (
                <div style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: 'var(--accent-danger)',
                  padding: '16px 20px',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <i className="fas fa-exclamation-triangle"></i>
                    <span>{errorMsg}</span>
                  </div>
                  <button className="btn btn-secondary" onClick={() => setShowSettings(true)}>
                    Select Folder
                  </button>
                </div>
              )}

              {/* Folder Summary & Dynamic Duration Header */}
              {stats && (stats.totalLectures > 0 || stats.totalFolders > 0) && (
                <div className="folder-header-summary">
                  <div className="folder-header-top">
                    <div>
                      <div className="folder-header-title-row">
                        <div className="folder-header-title">
                          {breadcrumbs[breadcrumbs.length - 1]?.name || activeRoot?.label}
                        </div>
                        <button
                          className="btn-shuffle-folder"
                          onClick={handleShufflePlay}
                          title="Shuffle play all content in this folder"
                        >
                          <i className="fas fa-random"></i>
                          <span>Shuffle</span>
                        </button>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        {currentPath ? `/${currentPath}` : 'Root Library'}
                      </div>
                    </div>

                    <div className="folder-stats-pills">
                      <div className="stat-pill">
                        <i className="fas fa-video" style={{ color: 'var(--accent-primary)' }}></i>
                        <span>Lectures: <strong>{stats.completedLectures}/{stats.totalLectures}</strong></span>
                      </div>
                      <div className="stat-pill">
                        <i className="fas fa-hourglass-half" style={{ color: 'var(--accent-blue)' }}></i>
                        <span>Remaining: <strong>{formatDuration(stats.remainingDuration)}</strong></span>
                      </div>
                      <div className="stat-pill">
                        <i className="fas fa-clock" style={{ color: 'var(--accent-purple)' }}></i>
                        <span>Total: <strong>{formatDuration(stats.totalDuration)}</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* Overall completion progress bar */}
                  <div className="progress-bar-container">
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${stats.completionPercentage}%` }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    <span>{stats.completedLectures} of {stats.totalLectures} completed</span>
                    <span>{stats.completionPercentage}% complete</span>
                  </div>
                </div>
              )}

              {/* Subfolders Grid */}
              <CourseGrid
                folders={folders}
                onSelectFolder={handleSelectFolder}
                onShuffle={handleShufflePlay}
                title={currentPath ? 'Subfolders' : 'Subjects'}
              />

              {/* Video Lectures List */}
              <LectureList
                lectures={lectures}
                onPlayLecture={handlePlayLecture}
                onToggleCompleted={handleToggleCompleted}
                title={folders.length > 0 ? 'Videos in this Folder' : 'Lectures'}
              />

              {/* Empty state */}
              {!isLoading && folders.length === 0 && lectures.length === 0 && (
                <div style={{
                  textAlign: 'center',
                  padding: '3rem 1.5rem',
                  backgroundColor: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px dashed var(--border-secondary)'
                }}>
                  <i className="fas fa-folder-open" style={{ fontSize: '3rem', color: 'var(--text-muted)', marginBottom: '1rem' }}></i>
                  <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>No Video Lectures Found</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '420px', margin: '0 auto 1.5rem' }}>
                    This folder does not contain any video files (.mp4, .mkv, .webm, .mov, .avi) or subfolders.
                  </p>
                  <button className="btn btn-secondary" onClick={() => setShowSettings(true)}>
                    Choose Another Folder
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        roots={roots}
        activeRoot={activeRoot}
        networkInfo={networkInfo}
        onRootChanged={() => {
          initApp();
        }}
        showToast={showToast}
      />

      {/* Mobile Bottom Navigation (Visible on phone when player is not full screen) */}
      {!activeLecture && (
        <MobileNavBar
          activeTab={mobileTab}
          onTabChange={setMobileTab}
          networkInfo={networkInfo}
          onOpenSettings={() => setShowSettings(true)}
          onGoHome={() => handleSelectFolder('')}
          showToast={showToast}
        />
      )}
    </div>
  );
}
