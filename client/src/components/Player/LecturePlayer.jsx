import React, { useState, useEffect, useRef, useCallback } from 'react';
import { formatTime, formatDuration, formatTimeRemaining } from '../../utils/formatters';
import { api } from '../../utils/api';
import ShortcutsModal from './ShortcutsModal';

const PRESET_SPEEDS = [1, 1.25, 1.5, 1.6, 1.75, 1.85, 2, 2.25, 2.5, 3];

export default function LecturePlayer({
  lecture,
  playlist = [],
  folderName = '',
  onSelectLecture,
  onBackToFolder,
  onToggleLectureCompleted,
  onUpdateLectureProgress,
  showToast
}) {
  const videoRef = useRef(null);
  const brownNoiseRef = useRef(null);
  const containerRef = useRef(null);
  const videoWrapperRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const resumeTimeRef = useRef(lecture.currentTime || 0);
  const lastSaveRef = useRef(0);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(lecture.currentTime || 0);
  const [duration, setDuration] = useState(lecture.duration || 0);
  const [playbackRate, setPlaybackRate] = useState(1.75);
  const [volume, setVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [showUnmuteBtn, setShowUnmuteBtn] = useState(false);
  const [showRealTimeLeft, setShowRealTimeLeft] = useState(true);
  const [isHideControls, setIsHideControls] = useState(false);

  // Bookmarks & Overlays
  const [bookmarks, setBookmarks] = useState(lecture.bookmarks || []);
  const [showBookmarksPopover, setShowBookmarksPopover] = useState(false);
  const [showCustomSpeedPopover, setShowCustomSpeedPopover] = useState(false);
  const [customSpeedInput, setCustomSpeedInput] = useState('1.75');
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [leftSeekActive, setLeftSeekActive] = useState(false);
  const [rightSeekActive, setRightSeekActive] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Brown noise state
  const [brownNoiseActive, setBrownNoiseActive] = useState(false);
  const [brownNoiseVolume, setBrownNoiseVolume] = useState(0.2);

  // Bookmark cycling state
  const savedTimelinePosRef = useRef(null);
  const isCyclingRef = useRef(false);

  // Double-tap tracking for touch devices
  const lastTapRef = useRef({ time: 0, x: 0 });

  // Stream URL
  const streamUrl = api.getVideoStreamUrl(lecture.id);

  // Initialize playback rate and settings from server
  useEffect(() => {
    api.getSettings().then(st => {
      if (st && st.defaultPlaybackSpeed) {
        setPlaybackRate(st.defaultPlaybackSpeed);
        setCustomSpeedInput(String(st.defaultPlaybackSpeed));
      }
      if (st && st.brownNoiseVolume) {
        setBrownNoiseVolume(st.brownNoiseVolume);
      }
    }).catch(() => {});
  }, []);

  // Update bookmarks and progress when lecture changes
  useEffect(() => {
    let isMounted = true;
    setBookmarks(lecture.bookmarks || []);
    const initialTime = lecture.currentTime || 0;
    setCurrentTime(initialTime);
    resumeTimeRef.current = initialTime;
    setDuration(lecture.duration || 0);
    savedTimelinePosRef.current = null;
    isCyclingRef.current = false;

    // Fetch authoritative saved progress & bookmarks from server
    api.getProgress(lecture.id).then((prog) => {
      if (!isMounted || !prog) return;
      if (prog.bookmarks) {
        setBookmarks(prog.bookmarks);
        onUpdateLectureProgress?.(lecture.id, { bookmarks: prog.bookmarks });
      }
      if (typeof prog.currentTime === 'number') {
        const serverTime = prog.currentTime;
        resumeTimeRef.current = serverTime;
        setCurrentTime(serverTime);
        if (videoRef.current && videoRef.current.readyState >= 1) {
          if (Math.abs(videoRef.current.currentTime - serverTime) > 1 && serverTime > 0) {
            videoRef.current.currentTime = serverTime;
          }
        }
      }
    }).catch(() => {});

    const handleBeforeUnload = () => {
      if (videoRef.current && videoRef.current.currentTime > 0) {
        const payload = JSON.stringify({
          key: lecture.id,
          currentTime: videoRef.current.currentTime,
          duration: videoRef.current.duration || duration || 0
        });
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/api/progress', new Blob([payload], { type: 'application/json' }));
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      isMounted = false;
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Automatically save position when switching to another lecture or exiting player
      if (videoRef.current && videoRef.current.currentTime > 0) {
        api.updateProgress(lecture.id, {
          currentTime: videoRef.current.currentTime,
          duration: videoRef.current.duration || 0
        }).catch(() => {});
      }
    };
  }, [lecture.id]);

  // Controls auto-hide on inactivity
  const resetControlsTimeout = useCallback(() => {
    setIsHideControls(false);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setIsHideControls(true);
      }
    }, 3500);
  }, []);

  // Play / Pause toggle
  const togglePlayPause = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
        if (brownNoiseActive && brownNoiseRef.current && brownNoiseRef.current.paused) {
          brownNoiseRef.current.play().catch(() => {});
        }
      }).catch(err => {
        if (err.name === 'NotAllowedError') {
          videoRef.current.muted = true;
          setIsMuted(true);
          setShowUnmuteBtn(true);
          videoRef.current.play();
        }
      });
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
      if (brownNoiseRef.current && !brownNoiseRef.current.paused) {
        brownNoiseRef.current.pause();
      }
    }
  }, [brownNoiseActive]);

  // Seek relative seconds with icon animation
  const seekRelative = useCallback((seconds) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + seconds));
    if (seconds > 0) {
      setRightSeekActive(true);
      setTimeout(() => setRightSeekActive(false), 500);
    } else {
      setLeftSeekActive(true);
      setTimeout(() => setLeftSeekActive(false), 500);
    }
  }, []);

  // Change playback speed
  const changeSpeed = useCallback((newSpeed) => {
    const clamped = Math.max(0.1, Math.min(5.0, Math.round(newSpeed * 100) / 100));
    setPlaybackRate(clamped);
    setCustomSpeedInput(String(clamped));
    if (videoRef.current) {
      videoRef.current.playbackRate = clamped;
    }
    showToast?.(`Speed: ${clamped}x`);
  }, [showToast]);

  // Cycle preset speeds
  const cycleSpeed = useCallback(() => {
    const idx = PRESET_SPEEDS.findIndex(s => Math.abs(s - playbackRate) < 0.05);
    const nextIdx = idx >= 0 ? (idx + 1) % PRESET_SPEEDS.length : 0;
    changeSpeed(PRESET_SPEEDS[nextIdx]);
  }, [playbackRate, changeSpeed]);

  // Fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  // Bookmarks handling
  const handleAddBookmark = useCallback(async () => {
    if (!videoRef.current) return;
    const time = Math.round(videoRef.current.currentTime * 10) / 10;
    try {
      const res = await api.saveBookmark(lecture.id, time);
      const updatedBookmarks = res.progress.bookmarks || [];
      setBookmarks(updatedBookmarks);
      onUpdateLectureProgress?.(lecture.id, { bookmarks: updatedBookmarks });
      showToast?.(`Bookmark added at ${formatTime(time)}`);
    } catch (e) {
      showToast?.('Failed to save bookmark', true);
    }
  }, [lecture.id, showToast, onUpdateLectureProgress]);

  const handleRemoveBookmark = useCallback(async (time) => {
    try {
      const res = await api.removeBookmark(lecture.id, time);
      const updatedBookmarks = res.progress.bookmarks || [];
      setBookmarks(updatedBookmarks);
      onUpdateLectureProgress?.(lecture.id, { bookmarks: updatedBookmarks });
      showToast?.('Bookmark removed');
    } catch (e) {
      showToast?.('Failed to delete bookmark', true);
    }
  }, [lecture.id, showToast, onUpdateLectureProgress]);

  const handleCycleBookmarks = useCallback(() => {
    if (!videoRef.current || bookmarks.length === 0) {
      showToast?.('No bookmarks saved for this lecture');
      return;
    }

    const curr = videoRef.current.currentTime;
    if (!isCyclingRef.current) {
      savedTimelinePosRef.current = curr;
      isCyclingRef.current = true;
    }

    let nextIdx = bookmarks.findIndex(b => b > curr + 1.2);
    if (nextIdx === -1) nextIdx = 0;

    const targetTime = bookmarks[nextIdx];
    videoRef.current.currentTime = targetTime;
    showToast?.(`Bookmark ${nextIdx + 1}/${bookmarks.length}: ${formatTime(targetTime)}`);
  }, [bookmarks, showToast]);

  const handleReturnToTimeline = useCallback(() => {
    if (!videoRef.current) return;
    if (savedTimelinePosRef.current !== null) {
      videoRef.current.currentTime = savedTimelinePosRef.current;
      showToast?.(`Returned to main timeline (${formatTime(savedTimelinePosRef.current)})`);
      savedTimelinePosRef.current = null;
      isCyclingRef.current = false;
    } else {
      showToast?.(`Already on main timeline`);
    }
  }, [showToast]);

  // Brown noise toggle
  const toggleBrownNoise = useCallback(() => {
    if (!brownNoiseRef.current) return;
    if (brownNoiseActive) {
      brownNoiseRef.current.pause();
      setBrownNoiseActive(false);
      showToast?.('Brown Noise: OFF');
    } else {
      brownNoiseRef.current.volume = brownNoiseVolume;
      brownNoiseRef.current.currentTime = 15;
      brownNoiseRef.current.play().then(() => {
        setBrownNoiseActive(true);
        showToast?.('Brown Noise: ON');
      }).catch(() => {});
    }
  }, [brownNoiseActive, brownNoiseVolume, showToast]);

  // Save progress before switching
  const handleSelectLecture = useCallback((nextLecture) => {
    if (videoRef.current && videoRef.current.currentTime > 0) {
      api.updateProgress(lecture.id, {
        currentTime: videoRef.current.currentTime,
        duration: videoRef.current.duration || duration || 0
      }).catch(() => {});
      onUpdateLectureProgress?.(lecture.id, {
        currentTime: videoRef.current.currentTime
      });
    }
    onSelectLecture(nextLecture);
  }, [lecture.id, duration, onSelectLecture, onUpdateLectureProgress]);

  // Next / Previous playlist lecture
  const playNextLecture = useCallback(() => {
    const idx = playlist.findIndex(l => l.id === lecture.id);
    if (idx >= 0 && idx < playlist.length - 1) {
      handleSelectLecture(playlist[idx + 1]);
    } else {
      showToast?.('No next lecture available in this folder');
    }
  }, [playlist, lecture.id, handleSelectLecture, showToast]);

  const playPrevLecture = useCallback(() => {
    const idx = playlist.findIndex(l => l.id === lecture.id);
    if (idx > 0) {
      handleSelectLecture(playlist[idx - 1]);
    } else {
      showToast?.('No previous lecture available in this folder');
    }
  }, [playlist, lecture.id, handleSelectLecture, showToast]);

  const handleBackToFolderWithSave = useCallback(() => {
    if (videoRef.current && videoRef.current.currentTime > 0) {
      api.updateProgress(lecture.id, {
        currentTime: videoRef.current.currentTime,
        duration: videoRef.current.duration || duration || 0
      }).catch(() => {});
      onUpdateLectureProgress?.(lecture.id, {
        currentTime: videoRef.current.currentTime
      });
    }
    onBackToFolder();
  }, [lecture.id, duration, onBackToFolder, onUpdateLectureProgress]);

  // Touch double-tap detection
  const handleTouchEnd = useCallback((e) => {
    const now = Date.now();
    const touch = e.changedTouches[0];
    if (!touch || !videoWrapperRef.current) return;

    const rect = videoWrapperRef.current.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const timeDiff = now - lastTapRef.current.time;

    if (timeDiff < 300 && timeDiff > 0) {
      // Double-tap detected
      e.preventDefault();
      if (x < rect.width / 2) {
        seekRelative(-10);
      } else {
        seekRelative(10);
      }
      lastTapRef.current = { time: 0, x: 0 };
    } else {
      lastTapRef.current = { time: now, x };
    }
  }, [seekRelative]);

  // Double-click on desktop
  const handleDoubleClick = useCallback((e) => {
    if (e.target.closest('.video-controls-container') || e.target.closest('.unmute-btn')) return;
    if (!videoWrapperRef.current) return;
    const rect = videoWrapperRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    if (clickX < rect.width / 2) {
      seekRelative(-10);
    } else {
      seekRelative(10);
    }
  }, [seekRelative]);

  // Mouse wheel seek
  const handleWheel = useCallback((e) => {
    if (e.target.closest('.video-controls-container') || e.target.closest('.lecture-menu')) return;
    e.preventDefault();
    if (e.deltaY < 0) {
      seekRelative(10);
    } else {
      seekRelative(-10);
    }
  }, [seekRelative]);

  // Global keyboard shortcuts listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore when focused inside text inputs
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      const key = e.key;

      if (key === 'Escape') {
        if (showShortcutsModal) {
          setShowShortcutsModal(false);
          return;
        }
        if (showBookmarksPopover) {
          setShowBookmarksPopover(false);
          return;
        }
        if (showCustomSpeedPopover) {
          setShowCustomSpeedPopover(false);
          return;
        }
      }

      if (key === '/') {
        e.preventDefault();
        setShowShortcutsModal(prev => !prev);
        return;
      }

      switch (key) {
        case ' ':
          e.preventDefault();
          togglePlayPause();
          break;

        case 'ArrowLeft':
          e.preventDefault();
          if (e.ctrlKey) {
            seekRelative(-30);
            showToast?.('-30s Rewind');
          } else {
            seekRelative(-10);
          }
          break;

        case 'ArrowRight':
          e.preventDefault();
          if (e.ctrlKey) {
            seekRelative(30);
            showToast?.('+30s Forward');
          } else {
            seekRelative(10);
          }
          break;

        case 'ArrowUp':
          e.preventDefault();
          if (videoRef.current) {
            const newVol = Math.min(1, Math.round((videoRef.current.volume + 0.02) * 100) / 100);
            videoRef.current.volume = newVol;
            setVolume(newVol);
            showToast?.(`Volume: ${Math.round(newVol * 100)}%`);
          }
          break;

        case 'ArrowDown':
          e.preventDefault();
          if (videoRef.current) {
            const newVol = Math.max(0, Math.round((videoRef.current.volume - 0.02) * 100) / 100);
            videoRef.current.volume = newVol;
            setVolume(newVol);
            showToast?.(`Volume: ${Math.round(newVol * 100)}%`);
          }
          break;

        case 'c':
        case 'C':
          e.preventDefault();
          changeSpeed(playbackRate + 0.1);
          break;

        case 'x':
        case 'X':
          e.preventDefault();
          changeSpeed(playbackRate - 0.1);
          break;

        case '[':
          e.preventDefault();
          cycleSpeed();
          break;

        case ']':
          e.preventDefault();
          cycleSpeed();
          break;

        case 'z':
        case 'Z':
          e.preventDefault();
          if (e.ctrlKey) {
            handleCycleBookmarks();
          } else {
            handleAddBookmark();
          }
          break;

        case 'p':
        case 'P':
          if (e.ctrlKey) {
            e.preventDefault();
            handleReturnToTimeline();
          } else {
            e.preventDefault();
            playPrevLecture();
          }
          break;

        case 't':
        case 'T':
          if (e.ctrlKey) {
            e.preventDefault();
            handleReturnToTimeline();
          }
          break;

        case 'n':
        case 'N':
          e.preventDefault();
          playNextLecture();
          break;

        case 'm':
        case 'M':
          e.preventDefault();
          if (videoRef.current) {
            const newMuted = !videoRef.current.muted;
            videoRef.current.muted = newMuted;
            setIsMuted(newMuted);
            setShowUnmuteBtn(false);
          }
          break;

        case 'b':
        case 'B':
          e.preventDefault();
          toggleBrownNoise();
          break;

        case 'PageUp':
          e.preventDefault();
          if (brownNoiseRef.current) {
            const newVol = Math.min(1, Math.round((brownNoiseVolume + 0.05) * 100) / 100);
            setBrownNoiseVolume(newVol);
            brownNoiseRef.current.volume = newVol;
            showToast?.(`Brown Noise Vol: ${Math.round(newVol * 100)}%`);
          }
          break;

        case 'PageDown':
          e.preventDefault();
          if (brownNoiseRef.current) {
            const newVol = Math.max(0, Math.round((brownNoiseVolume - 0.05) * 100) / 100);
            setBrownNoiseVolume(newVol);
            brownNoiseRef.current.volume = newVol;
            showToast?.(`Brown Noise Vol: ${Math.round(newVol * 100)}%`);
          }
          break;

        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;

        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    togglePlayPause, seekRelative, changeSpeed, cycleSpeed, handleAddBookmark,
    handleCycleBookmarks, handleReturnToTimeline, playNextLecture, playPrevLecture,
    toggleBrownNoise, toggleFullscreen, playbackRate, brownNoiseVolume,
    showShortcutsModal, showBookmarksPopover, showCustomSpeedPopover, showToast
  ]);

  // Video element events
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const cur = videoRef.current.currentTime;
    const dur = videoRef.current.duration || duration || 0;
    setCurrentTime(cur);

    // Skip intro button visibility
    if (cur <= 25 && dur > 25) {
      setShowSkipIntro(true);
    } else {
      setShowSkipIntro(false);
    }

    // Throttled periodic progress saving to server every 2 seconds
    const now = Date.now();
    if (now - lastSaveRef.current > 2000 && cur > 0) {
      lastSaveRef.current = now;
      api.updateProgress(lecture.id, { currentTime: cur, duration: dur }).catch(() => {});
      onUpdateLectureProgress?.(lecture.id, { currentTime: cur, duration: dur });
    }
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    const metaDur = Math.round(videoRef.current.duration || 0);
    if (metaDur > 0) {
      setDuration(metaDur);
      if (!lecture.duration || Math.abs(lecture.duration - metaDur) > 2) {
        api.reportDuration(lecture.id, metaDur).catch(() => {});
      }
    }

    videoRef.current.playbackRate = playbackRate;

    // Resume from where left off (if > 1s and not at the very end of video)
    const targetTime = resumeTimeRef.current || lecture.currentTime || 0;
    if (targetTime > 1 && targetTime < (metaDur || 999999) - 3) {
      videoRef.current.currentTime = targetTime;
      setCurrentTime(targetTime);
    }

    // Autoplay immediately upon clicking or opening lecture
    const playPromise = videoRef.current.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        setIsPlaying(true);
      }).catch((err) => {
        if (err.name === 'NotAllowedError') {
          // Browser audio policy prevented unmuted sound; mute to start playing immediately
          videoRef.current.muted = true;
          setIsMuted(true);
          setShowUnmuteBtn(true);
          videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
        }
      });
    }
  };

  const handlePause = () => {
    setIsPlaying(false);
    if (videoRef.current && videoRef.current.currentTime > 0) {
      api.updateProgress(lecture.id, {
        currentTime: videoRef.current.currentTime,
        duration: videoRef.current.duration || duration || 0
      }).catch(() => {});
      onUpdateLectureProgress?.(lecture.id, {
        currentTime: videoRef.current.currentTime
      });
    }
  };

  const handleVideoEnded = () => {
    setIsPlaying(false);
    if (brownNoiseRef.current) brownNoiseRef.current.pause();
    // Mark completed automatically when video reaches end
    onToggleLectureCompleted(lecture.id, true);
    // Auto advance to next lecture if available
    playNextLecture();
  };

  // Timeline scrub handling
  const handleTimelineInput = (e) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (videoRef.current) {
      videoRef.current.currentTime = val;
    }
  };

  const handleTimelineChange = (e) => {
    const val = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = val;
    }
    api.updateProgress(lecture.id, { currentTime: val, duration: duration || 0 }).catch(() => {});
    onUpdateLectureProgress?.(lecture.id, { currentTime: val });
  };

  // Calculate stats for playlist header
  const completedLecturesCount = playlist.filter(l => l.completed).length;
  const totalPlaylistLectures = playlist.length;
  const totalPlaylistDuration = playlist.reduce((acc, l) => acc + (l.duration || 0), 0);
  const remainingPlaylistDuration = playlist.reduce((acc, l) => acc + (l.completed ? 0 : (l.duration || 0)), 0);
  const progressPercentage = totalPlaylistLectures > 0 
    ? Math.round((completedLecturesCount / totalPlaylistLectures) * 100) 
    : 0;

  // Real-time vs Standard duration display calculations
  const effectiveDuration = duration || 1;
  const remainingRealTime = Math.max(0, (effectiveDuration - currentTime) / Math.max(0.1, playbackRate));
  const remainingStandardTime = Math.max(0, effectiveDuration - currentTime);
  const timelineProgressPercent = Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100));

  // Estimated end time calculation
  const estimatedEndTime = () => {
    if (!duration) return '';
    const date = new Date(Date.now() + remainingRealTime * 1000);
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `Ends at ${hours}:${minutes} ${ampm}`;
  };

  return (
    <div className="player-view" ref={containerRef}>
      {/* Background Brown Noise Audio */}
      <audio
        ref={brownNoiseRef}
        src="/brown.dat"
        loop
        preload="auto"
        style={{ display: 'none' }}
      />

      {/* Collapsible Lecture Playlist Sidebar */}
      <div className={`lecture-menu ${isSidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="menu-header">
          <div className="menu-header-top">
            <button className="menu-back-link" onClick={handleBackToFolderWithSave}>
              <i className="fas fa-arrow-left"></i> Back to Folder
            </button>
            <button
              className="btn-icon"
              onClick={() => setShowShortcutsModal(true)}
              title="Keyboard Shortcuts (/)"
              style={{ width: '28px', height: '28px', fontSize: '0.8rem' }}
            >
              <i className="fas fa-keyboard"></i>
            </button>
          </div>

          <div className="menu-course-title">
            {folderName || 'Lectures'}
          </div>

          <div className="menu-course-stats">
            {formatDuration(totalPlaylistDuration)} total • {formatDuration(remainingPlaylistDuration)} remaining
          </div>

          <div className="menu-progress-container">
            <div className="progress-bar-container">
              <div
                className="progress-bar-fill"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            <div className="menu-progress-text">
              <span>{completedLecturesCount}/{totalPlaylistLectures} completed</span>
              <span>{progressPercentage}%</span>
            </div>
          </div>
        </div>

        {/* Playlist Items */}
        <div className="chapter-list">
          {playlist.map((lec) => {
            const isActive = lec.id === lecture.id;
            return (
              <div
                key={lec.id}
                className={`playlist-lecture-item ${isActive ? 'active' : ''}`}
                onClick={() => handleSelectLecture(lec)}
              >
                <input
                  type="checkbox"
                  className="playlist-lecture-checkbox"
                  checked={!!lec.completed}
                  onChange={(e) => {
                    e.stopPropagation();
                    onToggleLectureCompleted(lec.id, !lec.completed);
                  }}
                  title={lec.completed ? 'Mark uncompleted' : 'Mark completed'}
                />

                <div className="playlist-lecture-info">
                  <div className={`playlist-lecture-title ${lec.completed ? 'completed' : ''}`}>
                    {lec.name}
                  </div>
                  <div className="playlist-lecture-meta">
                    <span>{formatDuration(lec.duration)}</span>
                    {lec.currentTime > 0 && !lec.completed && (
                      <span>• {formatTime(lec.currentTime)} watched</span>
                    )}
                  </div>
                </div>

                {isActive && (
                  <div className="playlist-playing-icon">
                    <i className="fas fa-volume-up"></i>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Sidebar Toggle Tab Button */}
      <button
        className={`sidebar-toggle-btn ${isSidebarCollapsed ? 'collapsed' : ''}`}
        onClick={() => setIsSidebarCollapsed(prev => !prev)}
        title={isSidebarCollapsed ? 'Expand Playlist' : 'Collapse Playlist'}
      >
        <i className={`fas fa-chevron-${isSidebarCollapsed ? 'right' : 'left'}`}></i>
      </button>

      {/* Main Video View Area */}
      <div className="player-content-wrapper">
        <div className="video-wrapper-container">
          <div
            className={`video-wrapper ${isHideControls ? 'hide-controls' : ''}`}
            ref={videoWrapperRef}
            onClick={(e) => {
              if (e.target.closest('.video-controls-container') || e.target.closest('.unmute-btn')) return;
              togglePlayPause();
            }}
            onDoubleClick={handleDoubleClick}
            onTouchEnd={handleTouchEnd}
            onWheel={handleWheel}
            onMouseMove={resetControlsTimeout}
            onMouseEnter={resetControlsTimeout}
          >
            {/* Native Video Element */}
            <video
              ref={videoRef}
              src={streamUrl}
              className="video-player-element"
              autoPlay
              playsInline
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={handleVideoEnded}
              onPlay={() => setIsPlaying(true)}
              onPause={handlePause}
            />

            {/* Unmute Overlay Button */}
            {showUnmuteBtn && (
              <button
                className="unmute-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  if (videoRef.current) {
                    videoRef.current.muted = false;
                    setIsMuted(false);
                    setShowUnmuteBtn(false);
                  }
                }}
              >
                <i className="fas fa-volume-mute"></i> Click to Unmute
              </button>
            )}

            {/* Seek Feedback Overlays (-10s / +10s) */}
            <div className={`seek-overlay left ${leftSeekActive ? 'show-icon' : ''}`}>
              <i className="fas fa-backward"></i>
            </div>
            <div className={`seek-overlay right ${rightSeekActive ? 'show-icon' : ''}`}>
              <i className="fas fa-forward"></i>
            </div>

            {/* Skip Intro Button */}
            {showSkipIntro && (
              <button
                className="skip-intro-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  seekRelative(25);
                  setShowSkipIntro(false);
                  showToast?.('Skipped Intro');
                }}
              >
                Skip Intro <i className="fas fa-forward"></i>
              </button>
            )}

            {/* Bottom Controls Bar */}
            <div className="video-controls-container">
              {/* Timeline with Bookmarks */}
              <div className="timeline-container">
                <input
                  type="range"
                  className="timeline"
                  min="0"
                  max={duration || 100}
                  step="0.1"
                  value={currentTime}
                  onInput={handleTimelineInput}
                  onChange={handleTimelineChange}
                  style={{
                    background: `linear-gradient(to right, var(--accent-primary) ${timelineProgressPercent}%, rgba(255, 255, 255, 0.25) ${timelineProgressPercent}%)`
                  }}
                />

                {/* Bookmark Flag Dots on Timeline */}
                <div id="bookmarks-container">
                  {bookmarks.map((bTime) => (
                    <BookmarkDot
                      key={bTime}
                      bTime={bTime}
                      duration={duration}
                      onSeek={(time) => {
                        if (videoRef.current) {
                          videoRef.current.currentTime = time;
                          showToast?.(`Jumped to bookmark: ${formatTime(time)}`);
                        }
                      }}
                      onRemove={handleRemoveBookmark}
                      formatTime={formatTime}
                    />
                  ))}
                </div>
              </div>

              {/* Controls Row */}
              <div className="controls-row">
                <div className="left-controls">
                  {/* Previous Lecture */}
                  <button
                    className="control-btn"
                    onClick={(e) => { e.stopPropagation(); playPrevLecture(); }}
                    title="Previous Lecture (P)"
                  >
                    <i className="fas fa-step-backward"></i>
                  </button>

                  {/* Play / Pause */}
                  <button
                    className="control-btn"
                    onClick={(e) => { e.stopPropagation(); togglePlayPause(); }}
                    title="Play / Pause (Space)"
                  >
                    <i className={`fas fa-${isPlaying ? 'pause' : 'play'}`}></i>
                  </button>

                  {/* Next Lecture */}
                  <button
                    className="control-btn"
                    onClick={(e) => { e.stopPropagation(); playNextLecture(); }}
                    title="Next Lecture (N)"
                  >
                    <i className="fas fa-step-forward"></i>
                  </button>

                  {/* Time & Duration Toggle */}
                  <div className="time-display">
                    <span>{formatTime(currentTime)}</span>
                    <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>/</span>
                    <span
                      className="clickable-duration"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowRealTimeLeft(prev => !prev);
                      }}
                      title="Click to toggle time format"
                    >
                      {showRealTimeLeft
                        ? formatTimeRemaining(remainingRealTime)
                        : formatTimeRemaining(remainingStandardTime)}
                    </span>
                  </div>
                </div>

                {/* Center Estimated End Time */}
                {duration > 0 && (
                  <div className="estimated-end-time">
                    {estimatedEndTime()}
                  </div>
                )}

                <div className="right-controls">
                  {/* Bookmarks Popover Panel */}
                  {showBookmarksPopover && (
                    <div
                      className="bookmarks-popover"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="bookmarks-popover-header">
                        <div className="bookmarks-popover-title">
                          <i className="fas fa-bookmark"></i> Lecture Bookmarks
                        </div>
                        <button
                          className="btn-icon"
                          onClick={() => setShowBookmarksPopover(false)}
                          style={{ width: '24px', height: '24px', fontSize: '0.75rem' }}
                        >
                          &times;
                        </button>
                      </div>

                      <div className="bookmarks-popover-list">
                        {bookmarks.length === 0 ? (
                          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '12px 0' }}>
                            No bookmarks saved yet. Press <kbd style={kbdSm}>Z</kbd> to add!
                          </div>
                        ) : (
                          bookmarks.map((time) => (
                            <div key={time} className="bookmark-popover-item">
                              <span
                                className="bookmark-jump-link"
                                onClick={() => {
                                  if (videoRef.current) {
                                    videoRef.current.currentTime = time;
                                    showToast?.(`Jumped to bookmark: ${formatTime(time)}`);
                                  }
                                }}
                              >
                                <i className="fas fa-play" style={{ fontSize: '0.65rem' }}></i> {formatTime(time)}
                              </span>
                              <button
                                className="bookmark-delete-btn"
                                onClick={() => handleRemoveBookmark(time)}
                                title="Remove bookmark"
                              >
                                <i className="fas fa-trash"></i>
                              </button>
                            </div>
                          ))
                        )}
                      </div>

                      <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid var(--border-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          Press <kbd style={kbdSm}>Z</kbd> to add
                        </span>
                        {bookmarks.length > 0 && (
                          <button
                            onClick={async () => {
                              await api.clearBookmarks(lecture.id);
                              setBookmarks([]);
                              showToast?.('Cleared all bookmarks');
                            }}
                            style={{ background: 'none', border: 'none', color: 'var(--accent-danger)', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}
                          >
                            Clear All
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Custom Speed Popover Panel */}
                  {showCustomSpeedPopover && (
                    <div
                      className="custom-speed-popover"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="number"
                        className="custom-speed-input"
                        step="0.1"
                        min="0.1"
                        max="5.0"
                        value={customSpeedInput}
                        onChange={(e) => setCustomSpeedInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = parseFloat(customSpeedInput);
                            if (val && val >= 0.1 && val <= 5.0) {
                              changeSpeed(val);
                            }
                            setShowCustomSpeedPopover(false);
                          }
                        }}
                      />
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>x</span>
                      <button
                        className="btn btn-primary"
                        style={{ padding: '4px 10px', fontSize: '0.82rem' }}
                        onClick={() => {
                          const val = parseFloat(customSpeedInput);
                          if (val && val >= 0.1 && val <= 5.0) {
                            changeSpeed(val);
                          }
                          setShowCustomSpeedPopover(false);
                        }}
                      >
                        Set
                      </button>
                    </div>
                  )}

                  {/* Bookmarks Popover Toggle Button */}
                  <button
                    className="control-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowBookmarksPopover(prev => !prev);
                      setShowCustomSpeedPopover(false);
                    }}
                    title="View Bookmarks / Press Z to add"
                  >
                    <i className="fas fa-bookmark"></i>
                  </button>

                  {/* Brown Noise Toggle Button */}
                  <button
                    className="control-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleBrownNoise();
                    }}
                    title={`Brown Noise Background (B) - ${brownNoiseActive ? 'ON' : 'OFF'}`}
                    style={{ color: brownNoiseActive ? 'var(--accent-primary)' : 'inherit' }}
                  >
                    <i className="fas fa-wave-square"></i>
                  </button>

                  {/* Keyboard Shortcuts Dialog Button */}
                  <button
                    className="control-btn keyboard-shortcuts-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowShortcutsModal(true);
                    }}
                    title="Keyboard Shortcuts (/)"
                  >
                    <i className="fas fa-keyboard"></i>
                  </button>

                  {/* Speed Cycling Button */}
                  <button
                    className="control-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      cycleSpeed();
                    }}
                    title="Change Speed (C/X)"
                    style={{ fontWeight: '700', fontSize: '0.88rem', minWidth: '42px' }}
                  >
                    {playbackRate}x
                  </button>

                  {/* Custom Speed Slider Popover Button */}
                  <button
                    className="control-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowCustomSpeedPopover(prev => !prev);
                      setShowBookmarksPopover(false);
                    }}
                    title="Custom Speed"
                  >
                    <i className="fas fa-sliders-h" style={{ fontSize: '0.9rem' }}></i>
                  </button>

                  {/* Fullscreen Button */}
                  <button
                    className="control-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFullscreen();
                    }}
                    title="Fullscreen (F)"
                  >
                    <i className="fas fa-expand"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Keyboard Shortcuts Modal */}
      <ShortcutsModal
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
      />
    </div>
  );
}

function BookmarkDot({ bTime, duration, onSeek, onRemove, formatTime }) {
  const [isDeletable, setIsDeletable] = useState(false);
  const hoverTimerRef = useRef(null);

  const handleMouseEnter = () => {
    hoverTimerRef.current = setTimeout(() => {
      setIsDeletable(true);
    }, 2000);
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setIsDeletable(false);
  };

  const handleClick = (e) => {
    e.stopPropagation();
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (isDeletable) {
      setIsDeletable(false);
      onRemove(bTime);
    } else {
      onSeek(bTime);
    }
  };

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  const bPercent = duration > 0 ? (bTime / duration) * 100 : 0;

  return (
    <div
      className={`bookmark-dot ${isDeletable ? 'deletable' : ''}`}
      style={{ left: `${bPercent}%` }}
      title={isDeletable ? 'Click to delete bookmark' : `Bookmark at ${formatTime(bTime)} (Hover 2s to delete)`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      <i className={`fas fa-${isDeletable ? 'trash' : 'flag'}`}></i>
    </div>
  );
}

const kbdSm = {
  background: 'var(--bg-tertiary)',
  padding: '1px 5px',
  borderRadius: '4px',
  border: '1px solid var(--border-secondary)',
  fontSize: '0.72rem'
};
