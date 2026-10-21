import React, { useState, useEffect, useRef, useCallback } from 'react';
import { formatTime, formatDuration, formatTimeRemaining } from '../../utils/formatters';
import { api } from '../../utils/api';
import ShortcutsModal from './ShortcutsModal';

const PRESET_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5];

const trimTitle = (str, maxLen = 42) => {
  if (!str) return '';
  const trimmed = str.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen).trim() + '…';
};

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
  const altAudioRef = useRef(null);
  const containerRef = useRef(null);
  const videoWrapperRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const singleTapTimerRef = useRef(null);
  const touchHandledRef = useRef(false);
  const resumeTimeRef = useRef(lecture.currentTime || 0);
  const lastSaveRef = useRef(0);

  // Pinch-to-zoom seeking lock refs
  const isPinchingRef = useRef(false);
  const lastPinchTimeRef = useRef(0);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(lecture.currentTime || 0);
  const [duration, setDuration] = useState(lecture.duration || 0);
  const [playbackRate, setPlaybackRate] = useState(1.75);
  const [volume, setVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [showUnmuteBtn, setShowUnmuteBtn] = useState(false);
  const [timeDisplayMode, setTimeDisplayMode] = useState(() => {
    const saved = localStorage.getItem('courseflix_time_mode');
    return saved === 'standard' ? 'standard' : 'real';
  });
  const [isHideControls, setIsHideControls] = useState(false);

  // Screen Lock Feature
  const [isLocked, setIsLocked] = useState(false);
  const [showUnlockPrompt, setShowUnlockPrompt] = useState(false);
  const unlockTimeoutRef = useRef(null);

  // Gesture Controls (Brightness, Volume, Slide to Seek)
  const [brightness, setBrightness] = useState(1.0);
  const [showBrightnessSlider, setShowBrightnessSlider] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [slideSeek, setSlideSeek] = useState({ active: false, delta: 0, targetTime: 0 });
  const touchStartRef = useRef({ x: 0, y: 0, time: 0, isVertical: null, moved: false });
  const sliderFadeTimerRef = useRef(null);

  // Netflix Bottom Drawers ('moments' | 'speed' | 'episodes' | 'audioSub' | null)
  const [activeDrawer, setActiveDrawer] = useState(null);

  // Subtitles & Audio Tracks
  const [availableSubtitles, setAvailableSubtitles] = useState(lecture.subtitles || []);
  const [selectedSubtitle, setSelectedSubtitle] = useState(null);
  const [subFontSize, setSubFontSize] = useState(() => {
    return localStorage.getItem('courseflix_sub_fontsize') || 'md';
  });
  const [availableAudioTracks, setAvailableAudioTracks] = useState([]);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState(0);

  // Bookmarks & Overlays
  const [bookmarks, setBookmarks] = useState(lecture.bookmarks || []);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [leftSeekActive, setLeftSeekActive] = useState(false);
  const [rightSeekActive, setRightSeekActive] = useState(false);

  // Brown noise state
  const [brownNoiseActive, setBrownNoiseActive] = useState(false);
  const [brownNoiseVolume, setBrownNoiseVolume] = useState(0.2);

  // Bookmark cycling state
  const savedTimelinePosRef = useRef(null);
  const isCyclingRef = useRef(false);
  const lastTapRef = useRef({ time: 0, x: 0 });

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Immersive Fullscreen (Hides Android status bar and navigation bar)
  const requestImmersiveFullscreen = useCallback(async () => {
    try {
      const el = containerRef.current || document.documentElement;
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (el.requestFullscreen) {
          await el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
        } else if (el.webkitRequestFullscreen) {
          await el.webkitRequestFullscreen().catch(() => {});
        }
      }
      if (window.screen?.orientation?.lock) {
        window.screen.orientation.lock('landscape').catch(() => {});
      }
    } catch (e) {}
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      requestImmersiveFullscreen();
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen().catch(() => {});
      }
    }
  }, [requestImmersiveFullscreen]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement || !!document.webkitFullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Aspect Ratio Screen Fit ('fit' | 'fill' | 'stretch' | 'zoom')
  const [aspectMode, setAspectMode] = useState(() => {
    return localStorage.getItem('courseflix_aspect_ratio') || 'fit';
  });
  const [aspectNotification, setAspectNotification] = useState(null);
  const aspectNotifyTimerRef = useRef(null);
  const pinchStartRef = useRef(null);

  const showAspectHud = useCallback((text) => {
    setAspectNotification(text);
    if (aspectNotifyTimerRef.current) clearTimeout(aspectNotifyTimerRef.current);
    aspectNotifyTimerRef.current = setTimeout(() => {
      setAspectNotification(null);
    }, 1800);
  }, []);

  const cycleAspectMode = useCallback((e) => {
    e?.stopPropagation?.();
    const modes = [
      { id: 'fit', label: 'Fit (Original 16:9)' },
      { id: 'fill', label: 'Fill (Notch Covered)' },
      { id: 'stretch', label: 'Stretch (Full Screen)' },
      { id: 'zoom', label: 'Zoom (122% Punch-In)' }
    ];
    setAspectMode((prev) => {
      const curIdx = modes.findIndex(m => m.id === prev);
      const next = modes[(curIdx + 1) % modes.length];
      localStorage.setItem('courseflix_aspect_ratio', next.id);
      showAspectHud(next.label);
      return next.id;
    });
  }, [showAspectHud]);

  // Master Seek Handler (Standard native byte-range seeking for all formats)
  const seekTo = useCallback((targetTime) => {
    const dur = duration || (videoRef.current ? videoRef.current.duration : 0) || 0;
    const clamped = Math.max(0, Math.min(dur || 999999, targetTime));
    if (videoRef.current) {
      videoRef.current.currentTime = clamped;
    }
    if (altAudioRef.current && altAudioRef.current.src) {
      altAudioRef.current.currentTime = clamped;
    }
    setCurrentTime(clamped);
    api.updateProgress(lecture.id, { currentTime: clamped, duration: dur }).catch(() => {});
    onUpdateLectureProgress?.(lecture.id, { currentTime: clamped });
  }, [duration, lecture.id, onUpdateLectureProgress]);

  // Audio Track Selection Handler (supports both native Safari and Chrome/Firefox synchronized stream fallback)
  const handleSelectAudioTrack = useCallback((at) => {
    setSelectedAudioTrack(at.index);
    showToast?.(`Audio: ${at.label}`);

    // Safari / WebKit native audioTracks API
    if (videoRef.current && videoRef.current.audioTracks && videoRef.current.audioTracks.length > 0) {
      for (let i = 0; i < videoRef.current.audioTracks.length; i++) {
        videoRef.current.audioTracks[i].enabled = (i === at.index);
      }
      return;
    }

    // Chrome / Edge / Firefox / Android fallback via synchronized audio element
    if (!videoRef.current) return;
    const curTime = videoRef.current.currentTime || 0;
    const isCurrentlyPlaying = !videoRef.current.paused;

    if (at.index === 0) {
      // Revert to primary audio track in native video element
      videoRef.current.muted = isMuted;
      videoRef.current.volume = volume;
      if (altAudioRef.current) {
        altAudioRef.current.oncanplay = null;
        altAudioRef.current.onerror = null;
        altAudioRef.current.pause();
        altAudioRef.current.removeAttribute('src');
        altAudioRef.current.load();
      }
    } else {
      // Switch to secondary audio track via synchronized audio element
      if (altAudioRef.current) {
        const audioEl = altAudioRef.current;
        const audioUrl = `/api/audio/track?key=${encodeURIComponent(lecture.id)}&streamIndex=${at.streamIndex}`;

        audioEl.oncanplay = null;
        audioEl.onerror = null;

        audioEl.pause();
        audioEl.src = audioUrl;
        audioEl.volume = volume;
        audioEl.muted = isMuted;
        audioEl.playbackRate = videoRef.current.playbackRate || playbackRate;

        let hasStarted = false;
        const syncAndPlay = () => {
          if (hasStarted) return;
          hasStarted = true;
          try {
            audioEl.currentTime = videoRef.current ? videoRef.current.currentTime : curTime;
          } catch (e) {
            console.warn('Could not set currentTime on alt audio:', e);
          }
          if (videoRef.current) {
            videoRef.current.muted = true;
          }
          if (isCurrentlyPlaying && !videoRef.current?.paused) {
            audioEl.play().catch((err) => {
              if (err.name !== 'AbortError') {
                console.warn('Alternate audio play failed:', err);
              }
            });
          }
        };

        audioEl.oncanplay = syncAndPlay;

        audioEl.onerror = () => {
          if (!audioEl.src || audioEl.src.endsWith('/')) return;
          console.error('Alternate audio error, falling back to primary track:', audioEl.error);
          if (videoRef.current) {
            videoRef.current.muted = isMuted;
          }
          setSelectedAudioTrack(0);
          showToast?.('Audio switch failed, reverting to primary');
        };

        audioEl.load();
      }
    }
  }, [lecture.id, isMuted, volume, playbackRate, showToast]);

  // Subtitle Cycling Handler (Off -> Sub 1 -> Sub 2 -> ... -> Off)
  const cycleSubtitle = useCallback(() => {
    if (!availableSubtitles || availableSubtitles.length === 0) {
      showToast?.('No subtitles found in this file');
      return;
    }

    const list = [null, ...availableSubtitles];
    const currentIndex = selectedSubtitle
      ? list.findIndex(s => s && s.id === selectedSubtitle.id)
      : 0;

    const nextIndex = (currentIndex + 1) % list.length;
    const nextSub = list[nextIndex];
    setSelectedSubtitle(nextSub);
    if (nextSub) {
      localStorage.setItem('courseflix_subtitles', nextSub.id);
      showToast?.(`Subtitles: ${nextSub.label}`);
    } else {
      localStorage.setItem('courseflix_subtitles', 'off');
      showToast?.('Subtitles: OFF');
    }
  }, [availableSubtitles, selectedSubtitle, showToast]);

  // Audio Track / Language Cycling Handler ('l' key / toggle)
  const cycleAudioTrack = useCallback(() => {
    if (!availableAudioTracks || availableAudioTracks.length === 0) {
      showToast?.('Default audio track in use');
      return;
    }
    const curIdx = selectedAudioTrack;
    const nextIdx = (curIdx + 1) % availableAudioTracks.length;
    const nextTrack = availableAudioTracks[nextIdx];
    handleSelectAudioTrack(nextTrack);
  }, [availableAudioTracks, selectedAudioTrack, handleSelectAudioTrack, showToast]);

  // Ensure HTML5 textTrack mode is set to 'showing' so cues render on screen
  useEffect(() => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const activate = () => {
      if (video.textTracks && video.textTracks.length > 0) {
        for (let i = 0; i < video.textTracks.length; i++) {
          const t = video.textTracks[i];
          if (selectedSubtitle) {
            t.mode = 'showing';
          } else {
            t.mode = 'disabled';
          }
        }
      }
    };
    activate();
    const t = setTimeout(activate, 100);
    return () => clearTimeout(t);
  }, [selectedSubtitle]);

  // Direct native stream URL without conversion
  const streamUrl = api.getVideoStreamUrl(lecture.id);

  // Initialize playback rate and settings from server
  useEffect(() => {
    api.getSettings().then(st => {
      if (st && st.defaultPlaybackSpeed) {
        setPlaybackRate(st.defaultPlaybackSpeed);
      }
      if (st && st.brownNoiseVolume) {
        setBrownNoiseVolume(st.brownNoiseVolume);
      }
    }).catch(() => {});
  }, []);

  // Update lecture data when lecture changes
  useEffect(() => {
    let isMounted = true;
    setBookmarks(lecture.bookmarks || []);
    setAvailableSubtitles(lecture.subtitles || []);
    setSelectedSubtitle(null);
    setSelectedAudioTrack(0);
    if (altAudioRef.current) {
      altAudioRef.current.pause();
      altAudioRef.current.src = '';
    }
    const localResume = parseFloat(localStorage.getItem('courseflix_resume_' + lecture.id) || '0');
    const initialTime = localResume || lecture.currentTime || 0;
    setCurrentTime(initialTime);
    resumeTimeRef.current = initialTime;
    setDuration(lecture.duration || 0);
    savedTimelinePosRef.current = null;
    isCyclingRef.current = false;
    setActiveDrawer(null);

    // Fetch authoritative saved progress & bookmarks from server
    api.getProgress(lecture.id).then((prog) => {
      if (!isMounted || !prog) return;
      if (prog.bookmarks) {
        setBookmarks(prog.bookmarks);
        onUpdateLectureProgress?.(lecture.id, { bookmarks: prog.bookmarks });
      }
      if (typeof prog.currentTime === 'number' && prog.currentTime > 0) {
        const serverTime = prog.currentTime;
        // If local resume wasn't set or server time is significantly ahead
        if (!localResume || Math.abs(serverTime - localResume) > 5) {
          resumeTimeRef.current = serverTime;
          setCurrentTime(serverTime);
          if (videoRef.current && videoRef.current.readyState >= 1) {
            videoRef.current.currentTime = serverTime;
          }
        }
      }
    }).catch(() => {});

    // Query media streams (audio tracks, embedded subtitles)
    api.getMediaTracks(lecture.id).then((info) => {
      if (!isMounted || !info) return;
      if (info.audioTracks && info.audioTracks.length > 0) {
        setAvailableAudioTracks(info.audioTracks);
        setSelectedAudioTrack(0);
      }
      // Combine and strictly deduplicate subtitles (prevent identical duplicate entries)
      const rawSubs = [...(info.subtitles || []), ...(lecture.subtitles || [])];
      const seenSubs = new Set();
      const uniqueSubs = [];
      for (const s of rawSubs) {
        const uniqueKey = s.src || s.id || (s.streamIndex !== undefined ? `stream_${s.streamIndex}` : s.label);
        if (!seenSubs.has(uniqueKey)) {
          seenSubs.add(uniqueKey);
          uniqueSubs.push(s);
        }
      }

      setAvailableSubtitles(uniqueSubs);
      if (uniqueSubs.length > 0) {
        const savedSubPref = localStorage.getItem('courseflix_subtitles');
        if (savedSubPref !== 'off') {
          const defaultSub = uniqueSubs.find(s => (s.srclang || '').toLowerCase().startsWith('en')) || uniqueSubs[0];
          setSelectedSubtitle(defaultSub);
        }
      }
      if (info.duration && !duration) {
        setDuration(info.duration);
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
      if (videoRef.current && videoRef.current.currentTime > 0) {
        api.updateProgress(lecture.id, {
          currentTime: videoRef.current.currentTime,
          duration: videoRef.current.duration || 0
        }).catch(() => {});
      }
    };
  }, [lecture.id]);

  // Controls auto-hide after 2.5s of inactivity
  const resetControlsTimeout = useCallback(() => {
    if (isLocked) return;
    setIsHideControls(false);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused && !activeDrawer) {
        setIsHideControls(true);
      }
    }, 2500); // Auto-hide after 2.5s of no interaction
  }, [isLocked, activeDrawer]);

  // Master tap/click handler for viewport and screen
  const handleViewportTap = useCallback((e) => {
    // Attempt immersive fullscreen on mobile to eliminate Android status bar & notch bar
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      requestImmersiveFullscreen();
    }

    // If the tap was directly on an interactive button, input, drawer, or sidebar, do not toggle controls
    if (
      e?.target?.closest?.('button') ||
      e?.target?.closest?.('input') ||
      e?.target?.closest?.('.netflix-drawer') ||
      e?.target?.closest?.('.netflix-episodes-sidebar') ||
      e?.target?.closest?.('.unmute-btn') ||
      e?.target?.closest?.('.netflix-unlock-pill-btn')
    ) {
      resetControlsTimeout();
      return;
    }

    if (isLocked) {
      setShowUnlockPrompt(true);
      if (unlockTimeoutRef.current) clearTimeout(unlockTimeoutRef.current);
      unlockTimeoutRef.current = setTimeout(() => setShowUnlockPrompt(false), 2500);
      return;
    }

    if (activeDrawer) {
      setActiveDrawer(null);
      resetControlsTimeout();
      return;
    }

    // Toggle controls visibility:
    // If hidden -> show controls & start 2.5s auto-hide timer
    // If visible -> immediately hide controls
    setIsHideControls((prev) => {
      const willHide = !prev;
      if (!willHide) {
        // Just shown -> start 2.5s timer
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = setTimeout(() => {
          if (videoRef.current && !videoRef.current.paused && !activeDrawer) {
            setIsHideControls(true);
          }
        }, 2500);
      } else {
        // Just hidden -> clear timer
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      }
      return willHide;
    });
  }, [isLocked, activeDrawer, resetControlsTimeout]);

  // Play / Pause toggle
  const togglePlayPause = useCallback(() => {
    if (!videoRef.current || isLocked) return;
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
        if (altAudioRef.current && altAudioRef.current.src && altAudioRef.current.paused) {
          altAudioRef.current.currentTime = videoRef.current.currentTime;
          altAudioRef.current.play().catch(() => {});
        }
        if (brownNoiseActive && brownNoiseRef.current && brownNoiseRef.current.paused) {
          brownNoiseRef.current.play().catch(() => {});
        }
      }).catch(err => {
        if (err.name === 'NotAllowedError') {
          videoRef.current.muted = true;
          setIsMuted(true);
          setShowUnmuteBtn(true);
          videoRef.current.play().catch(() => {});
        }
      });
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
      if (altAudioRef.current && !altAudioRef.current.paused) {
        altAudioRef.current.pause();
      }
      if (brownNoiseRef.current && !brownNoiseRef.current.paused) {
        brownNoiseRef.current.pause();
      }
    }
    resetControlsTimeout();
  }, [isLocked, brownNoiseActive, resetControlsTimeout]);

  // Seek relative seconds with icon animation
  const seekRelative = useCallback((seconds) => {
    if (!videoRef.current || isLocked) return;
    const dur = duration || (videoRef.current ? videoRef.current.duration : 0) || 0;
    const cur = videoRef.current.currentTime;
    const newTime = Math.max(0, Math.min(dur, cur + seconds));
    seekTo(newTime);
    if (seconds > 0) {
      setRightSeekActive(true);
      setTimeout(() => setRightSeekActive(false), 550);
    } else {
      setLeftSeekActive(true);
      setTimeout(() => setLeftSeekActive(false), 550);
    }
    resetControlsTimeout();
  }, [isLocked, duration, seekTo, resetControlsTimeout]);

  // Change playback speed
  const changeSpeed = useCallback((newSpeed) => {
    const clamped = Math.max(0.1, Math.min(5.0, Math.round(newSpeed * 100) / 100));
    setPlaybackRate(clamped);
    if (videoRef.current) {
      videoRef.current.playbackRate = clamped;
    }
    if (altAudioRef.current) {
      altAudioRef.current.playbackRate = clamped;
    }
    showToast?.(`Speed: ${clamped}x`);
  }, [showToast]);

  // Bookmarks / Moments handling
  const handleAddBookmark = useCallback(async () => {
    if (!videoRef.current) return;
    const time = Math.round(videoRef.current.currentTime * 10) / 10;
    try {
      const res = await api.saveBookmark(lecture.id, time);
      const updatedBookmarks = res.progress.bookmarks || [];
      setBookmarks(updatedBookmarks);
      onUpdateLectureProgress?.(lecture.id, { bookmarks: updatedBookmarks });
      showToast?.(`Saved Moment at ${formatTime(time)}`);
    } catch (e) {
      showToast?.('Failed to save moment', true);
    }
  }, [lecture.id, showToast, onUpdateLectureProgress]);

  const handleRemoveBookmark = useCallback(async (time) => {
    try {
      const res = await api.removeBookmark(lecture.id, time);
      const updatedBookmarks = res.progress.bookmarks || [];
      setBookmarks(updatedBookmarks);
      onUpdateLectureProgress?.(lecture.id, { bookmarks: updatedBookmarks });
      showToast?.('Moment removed');
    } catch (e) {
      showToast?.('Failed to remove moment', true);
    }
  }, [lecture.id, showToast, onUpdateLectureProgress]);

  // Playlist navigation
  const currentIdx = playlist.findIndex(l => l.id === lecture.id);
  const hasNextLecture = currentIdx >= 0 && currentIdx < playlist.length - 1;
  const hasPrevLecture = currentIdx > 0;

  const playNextLecture = useCallback(() => {
    if (hasNextLecture) {
      const nextLec = playlist[currentIdx + 1];
      if (videoRef.current && videoRef.current.currentTime > 0) {
        api.updateProgress(lecture.id, {
          currentTime: videoRef.current.currentTime,
          duration: videoRef.current.duration || 0
        }).catch(() => {});
      }
      onSelectLecture(nextLec);
      showToast?.(`Next: ${nextLec.name}`);
    } else {
      showToast?.('Reached end of playlist');
    }
  }, [hasNextLecture, playlist, currentIdx, lecture.id, onSelectLecture, showToast]);

  const playPrevLecture = useCallback(() => {
    if (hasPrevLecture) {
      const prevLec = playlist[currentIdx - 1];
      if (videoRef.current && videoRef.current.currentTime > 0) {
        api.updateProgress(lecture.id, {
          currentTime: videoRef.current.currentTime,
          duration: videoRef.current.duration || 0
        }).catch(() => {});
      }
      onSelectLecture(prevLec);
      showToast?.(`Previous: ${prevLec.name}`);
    }
  }, [hasPrevLecture, playlist, currentIdx, lecture.id, onSelectLecture, showToast]);

  const handleBackToFolderWithSave = useCallback(() => {
    if (videoRef.current && videoRef.current.currentTime > 0) {
      const cur = videoRef.current.currentTime;
      localStorage.setItem('courseflix_resume_' + lecture.id, cur.toString());
      api.updateProgress(lecture.id, {
        currentTime: cur,
        duration: videoRef.current.duration || 0
      }).catch(() => {});
      onUpdateLectureProgress?.(lecture.id, {
        currentTime: cur
      });
    }
    onBackToFolder();
  }, [lecture.id, onBackToFolder, onUpdateLectureProgress]);

  // ==========================================
  // TOUCH GESTURES (Brightness, Volume, Slide Seek, Pinch Zoom)
  // ==========================================
  const handleTouchStart = (e) => {
    if (isLocked) {
      setShowUnlockPrompt(true);
      if (unlockTimeoutRef.current) clearTimeout(unlockTimeoutRef.current);
      unlockTimeoutRef.current = setTimeout(() => setShowUnlockPrompt(false), 3000);
      return;
    }

    // Do NOT intercept gestures if touch began inside the playlist sidebar or drawers
    if (
      e.target.closest('.netflix-episodes-sidebar') ||
      e.target.closest('.netflix-drawer') ||
      e.target.closest('.modal-container')
    ) {
      return;
    }

    if (e.touches.length >= 2) {
      // 2-finger pinch gesture init - lock out all seeking immediately
      isPinchingRef.current = true;
      lastPinchTimeRef.current = Date.now();
      setSlideSeek({ active: false, delta: 0, targetTime: 0 });
      touchStartRef.current.moved = true;

      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      pinchStartRef.current = { dist, triggered: false };
      return;
    }

    if (e.touches.length === 1 && videoWrapperRef.current) {
      // If we recently completed a pinch, ignore new single touch for 650ms to prevent accidental seeks
      if (isPinchingRef.current || Date.now() - lastPinchTimeRef.current < 650) {
        return;
      }

      const t = e.touches[0];
      const rect = videoWrapperRef.current.getBoundingClientRect();
      const relX = t.clientX - rect.left;
      const isLeftSide = relX < rect.width * 0.45;
      const isRightSide = relX > rect.width * 0.55;

      touchStartRef.current = {
        x: t.clientX,
        y: t.clientY,
        time: Date.now(),
        startVolume: videoRef.current ? videoRef.current.volume : volume,
        startBrightness: brightness,
        startTime: videoRef.current ? videoRef.current.currentTime : currentTime,
        isLeftSide,
        isRightSide,
        isVertical: null,
        moved: false
      };
    }
  };

  const handleTouchMove = (e) => {
    if (
      isLocked ||
      !videoWrapperRef.current ||
      e.target.closest('.netflix-episodes-sidebar') ||
      e.target.closest('.netflix-drawer') ||
      e.target.closest('.modal-container')
    ) {
      return;
    }

    // Handle 2-finger pinch gesture (Pinch in -> Fit, Pinch out -> Fill)
    if (e.touches.length >= 2) {
      isPinchingRef.current = true;
      lastPinchTimeRef.current = Date.now();
      setSlideSeek({ active: false, delta: 0, targetTime: 0 });

      if (pinchStartRef.current && !pinchStartRef.current.triggered) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        const ratio = dist / pinchStartRef.current.dist;
        if (ratio > 1.15) {
          pinchStartRef.current.triggered = true;
          setAspectMode('fill');
          localStorage.setItem('courseflix_aspect_ratio', 'fill');
          showAspectHud('Fill (Covering Notch)');
        } else if (ratio < 0.85) {
          pinchStartRef.current.triggered = true;
          setAspectMode('fit');
          localStorage.setItem('courseflix_aspect_ratio', 'fit');
          showAspectHud('Fit (Original)');
        }
      }
      return;
    }

    // Lockout 1-finger gestures during or shortly after a pinch
    if (isPinchingRef.current || Date.now() - lastPinchTimeRef.current < 650) {
      setSlideSeek({ active: false, delta: 0, targetTime: 0 });
      return;
    }

    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const start = touchStartRef.current;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;

    // Detect direction after passing 12px threshold
    if (start.isVertical === null && (Math.abs(dx) > 12 || Math.abs(dy) > 12)) {
      start.isVertical = Math.abs(dy) > Math.abs(dx);
    }

    if (start.isVertical === true) {
      // Vertical gesture: Brightness on left, Volume on right
      start.moved = true;
      const rect = videoWrapperRef.current.getBoundingClientRect();
      const deltaRatio = -dy / (rect.height * 0.55);

      if (start.isLeftSide) {
        const newBright = Math.max(0.25, Math.min(1.5, start.startBrightness + deltaRatio));
        setBrightness(newBright);
        setShowBrightnessSlider(true);
        setShowVolumeSlider(false);
      } else if (start.isRightSide) {
        const newVol = Math.max(0, Math.min(1.0, start.startVolume + deltaRatio));
        setVolume(newVol);
        if (videoRef.current) {
          if (selectedAudioTrack === 0) {
            videoRef.current.volume = newVol;
            if (newVol > 0 && videoRef.current.muted) {
              videoRef.current.muted = false;
              setIsMuted(false);
            }
          }
        }
        if (altAudioRef.current) {
          altAudioRef.current.volume = newVol;
          if (newVol > 0 && altAudioRef.current.muted) {
            altAudioRef.current.muted = false;
          }
        }
        setShowVolumeSlider(true);
        setShowBrightnessSlider(false);
      }
    } else if (start.isVertical === false) {
      // Horizontal gesture: Slide to skip 10 seconds / scrub!
      start.moved = true;
      const seekDeltaSeconds = Math.round((dx / 10) * 10) / 10;
      const dur = duration || (videoRef.current ? videoRef.current.duration : 0) || 0;
      const target = Math.max(0, Math.min(dur, start.startTime + seekDeltaSeconds));
      setSlideSeek({
        active: true,
        delta: seekDeltaSeconds,
        targetTime: target
      });
    }
  };

  const handleTouchEnd = (e) => {
    pinchStartRef.current = null;
    if (isLocked) return;

    if (
      e.target.closest('.netflix-episodes-sidebar') ||
      e.target.closest('.netflix-drawer') ||
      e.target.closest('.modal-container')
    ) {
      return;
    }

    if (e && e.touches && e.touches.length >= 1) {
      // Partial lift off during pinch - maintain pinch lockout!
      isPinchingRef.current = true;
      lastPinchTimeRef.current = Date.now();
      setSlideSeek({ active: false, delta: 0, targetTime: 0 });
      return;
    }

    if (isPinchingRef.current || Date.now() - lastPinchTimeRef.current < 650) {
      isPinchingRef.current = false;
      lastPinchTimeRef.current = Date.now();
      setSlideSeek({ active: false, delta: 0, targetTime: 0 });
      return;
    }

    const start = touchStartRef.current;

    // Apply slide seek if active
    if (slideSeek.active) {
      if (typeof slideSeek.targetTime === 'number') {
        seekTo(slideSeek.targetTime);
      }
      setSlideSeek({ active: false, delta: 0, targetTime: 0 });
    }

    // Schedule fadeout for brightness & volume sliders
    if (showBrightnessSlider || showVolumeSlider) {
      if (sliderFadeTimerRef.current) clearTimeout(sliderFadeTimerRef.current);
      sliderFadeTimerRef.current = setTimeout(() => {
        setShowBrightnessSlider(false);
        setShowVolumeSlider(false);
      }, 1200);
    }

    // Double-tap seek or single-tap controls toggle
    if (!start.moved && Date.now() - start.time < 300 && videoWrapperRef.current) {
      const now = Date.now();
      const lastTap = lastTapRef.current;
      const rect = videoWrapperRef.current.getBoundingClientRect();
      const tapX = start.x - rect.left;

      touchHandledRef.current = true;

      if (now - lastTap.time < 280 && Math.abs(start.x - lastTap.x) < 50) {
        // Double tap on edges -> 10s seek
        if (singleTapTimerRef.current) {
          clearTimeout(singleTapTimerRef.current);
          singleTapTimerRef.current = null;
        }
        if (tapX < rect.width * 0.35) {
          seekRelative(-10);
        } else if (tapX > rect.width * 0.65) {
          seekRelative(10);
        } else {
          togglePlayPause();
        }
        lastTapRef.current = { time: 0, x: 0 };
      } else {
        lastTapRef.current = { time: now, x: start.x };
        if (isHideControls) {
          handleViewportTap(e);
        } else {
          if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
          singleTapTimerRef.current = setTimeout(() => {
            handleViewportTap(e);
            singleTapTimerRef.current = null;
          }, 180);
        }
      }
    }
  };

  // Video element events
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const cur = videoRef.current.currentTime;
    const dur = videoRef.current.duration || duration || 0;
    setCurrentTime(cur);

    if (cur <= 25 && dur > 25) {
      setShowSkipIntro(true);
    } else {
      setShowSkipIntro(false);
    }

    // Synchronize and drift check alternate audio track if active
    if (selectedAudioTrack > 0 && altAudioRef.current && altAudioRef.current.src && !videoRef.current.paused) {
      const diff = Math.abs(altAudioRef.current.currentTime - cur);
      if (diff > 0.3) {
        try {
          altAudioRef.current.currentTime = cur;
        } catch {}
      }
      if (altAudioRef.current.paused) {
        altAudioRef.current.play().catch(() => {});
      }
    }

    // Throttled periodic progress saving to server and localStorage every 2 seconds
    const now = Date.now();
    if (now - lastSaveRef.current > 2000 && cur > 0) {
      lastSaveRef.current = now;
      localStorage.setItem('courseflix_resume_' + lecture.id, cur.toString());
      api.updateProgress(lecture.id, { currentTime: cur, duration: dur }).catch(() => {});
      onUpdateLectureProgress?.(lecture.id, { currentTime: cur, duration: dur });
    }
  };

  const handlePlay = () => {
    setIsPlaying(true);
    if (selectedAudioTrack > 0 && altAudioRef.current && altAudioRef.current.src && videoRef.current) {
      try {
        altAudioRef.current.currentTime = videoRef.current.currentTime;
      } catch {}
      altAudioRef.current.play().catch(() => {});
    }
    if (brownNoiseActive && brownNoiseRef.current && brownNoiseRef.current.paused) {
      brownNoiseRef.current.play().catch(() => {});
    }
  };

  const handlePause = () => {
    setIsPlaying(false);
    if (altAudioRef.current && !altAudioRef.current.paused) {
      altAudioRef.current.pause();
    }
    if (brownNoiseRef.current && !brownNoiseRef.current.paused) {
      brownNoiseRef.current.pause();
    }
    if (videoRef.current && currentTime > 0) {
      api.updateProgress(lecture.id, {
        currentTime: currentTime,
        duration: videoRef.current.duration || duration || 0
      }).catch(() => {});
      onUpdateLectureProgress?.(lecture.id, { currentTime });
    }
  };

  const handleSeeked = () => {
    if (selectedAudioTrack > 0 && altAudioRef.current && altAudioRef.current.src && videoRef.current) {
      try {
        altAudioRef.current.currentTime = videoRef.current.currentTime;
      } catch {}
      if (!videoRef.current.paused && altAudioRef.current.paused) {
        altAudioRef.current.play().catch(() => {});
      }
    }
  };

  const handleWaiting = () => {
    if (altAudioRef.current && !altAudioRef.current.paused) {
      altAudioRef.current.pause();
    }
  };

  const handlePlaying = () => {
    setIsPlaying(true);
    if (selectedAudioTrack > 0 && altAudioRef.current && altAudioRef.current.src && videoRef.current) {
      if (Math.abs(altAudioRef.current.currentTime - videoRef.current.currentTime) > 0.25) {
        try {
          altAudioRef.current.currentTime = videoRef.current.currentTime;
        } catch {}
      }
      if (altAudioRef.current.paused) {
        altAudioRef.current.play().catch(() => {});
      }
    }
  };

  const handleRateChange = () => {
    if (altAudioRef.current && videoRef.current) {
      altAudioRef.current.playbackRate = videoRef.current.playbackRate;
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

    // Detect browser native audio tracks if exposed and we don't have tracks from server
    if (availableAudioTracks.length === 0) {
      if (videoRef.current.audioTracks && videoRef.current.audioTracks.length > 0) {
        const tracks = [];
        for (let i = 0; i < videoRef.current.audioTracks.length; i++) {
          const at = videoRef.current.audioTracks[i];
          tracks.push({
            id: i,
            streamIndex: i,
            label: at.label || `Audio Track ${i + 1} (${at.language || 'Default'})`,
            language: at.language
          });
        }
        setAvailableAudioTracks(tracks);
      } else {
        setAvailableAudioTracks([
          { id: 0, streamIndex: 0, label: 'Default / Stereo Audio', language: 'default' }
        ]);
      }
    }

    // Resume from where left off via native HTML5 seeking
    const localResume = parseFloat(localStorage.getItem('courseflix_resume_' + lecture.id) || '0');
    const targetTime = localResume || resumeTimeRef.current || lecture.currentTime || 0;
    if (targetTime > 1 && targetTime < (metaDur || 999999) - 3) {
      videoRef.current.currentTime = targetTime;
      setCurrentTime(targetTime);
      showToast?.(`Resumed at ${formatTime(targetTime)}`);
    }

    videoRef.current.play().then(() => {
      setIsPlaying(true);
    }).catch((err) => {
      if (err.name === 'NotAllowedError') {
        videoRef.current.muted = true;
        setIsMuted(true);
        setShowUnmuteBtn(true);
        videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    });
  };


  const handleVideoEnded = () => {
    setIsPlaying(false);
    if (brownNoiseRef.current) brownNoiseRef.current.pause();
    if (altAudioRef.current) altAudioRef.current.pause();
    onToggleLectureCompleted(lecture.id, true);
    playNextLecture();
  };

  // Timeline scrub handling
  const handleTimelineInput = (e) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (videoRef.current) {
      videoRef.current.currentTime = val;
    }
    if (altAudioRef.current && altAudioRef.current.src) {
      altAudioRef.current.currentTime = val;
    }
  };

  const handleTimelineChange = (e) => {
    const val = parseFloat(e.target.value);
    seekTo(val);
  };

  // Calculate duration formats
  const effectiveDuration = duration || 1;
  const remainingRealTime = Math.max(0, (effectiveDuration - currentTime) / Math.max(0.1, playbackRate));
  const remainingStandardTime = Math.max(0, effectiveDuration - currentTime);
  const timelineProgressPercent = Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100));

  // Exact clock time the video will finish based on real remaining time & speed
  const endsAtDate = new Date(Date.now() + remainingRealTime * 1000);
  const endsAtClockTime = endsAtDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });

  const cycleTimeDisplayMode = useCallback(() => {
    const modes = ['real', 'standard'];
    setTimeDisplayMode(prev => {
      const curIdx = modes.indexOf(prev);
      const next = modes[(curIdx + 1) % modes.length];
      localStorage.setItem('courseflix_time_mode', next);

      if (next === 'real') {
        const approxMins = Math.max(1, Math.round(remainingRealTime / 60));
        showToast?.(`Speed-adjusted remaining: ${formatTime(remainingRealTime)} (~${approxMins}m at ${playbackRate}x)`);
      } else {
        showToast?.(`Standard video remaining: ${formatTime(remainingStandardTime)} (at 1x pace)`);
      }
      return next;
    });
  }, [remainingRealTime, remainingStandardTime, playbackRate, showToast]);

  const getTimeRemainingLabel = () => {
    if (timeDisplayMode === 'standard') {
      return formatTime(remainingStandardTime);
    }
    // 'real' mode (scaled by playback speed)
    return formatTime(remainingRealTime);
  };

  // Brown noise
  const toggleBrownNoise = useCallback(() => {
    if (!brownNoiseRef.current) return;
    if (brownNoiseActive) {
      brownNoiseRef.current.pause();
      setBrownNoiseActive(false);
      showToast?.('Brown Noise: OFF');
    } else {
      brownNoiseRef.current.volume = brownNoiseVolume;
      brownNoiseRef.current.play().then(() => {
        setBrownNoiseActive(true);
        showToast?.('Brown Noise: ON');
      }).catch(() => {
        showToast?.('Could not start brown noise', true);
      });
    }
  }, [brownNoiseActive, brownNoiseVolume, showToast]);

  // Mute / Unmute
  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (selectedAudioTrack === 0) {
      videoRef.current.muted = nextMuted;
    }
    if (altAudioRef.current) {
      altAudioRef.current.muted = nextMuted;
    }
    setShowUnmuteBtn(false);
    showToast?.(nextMuted ? 'Muted' : 'Unmuted');
  }, [isMuted, selectedAudioTrack, showToast]);

  // Global Keyboard Shortcuts (Space, Left/Right, V/S for Subtitles, F for Fullscreen, M for Mute, B for Brown Noise)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't intercept if user is typing in an input, textarea or select
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return;
      if (isLocked) return;

      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          togglePlayPause();
          break;
        case 'ArrowLeft':
        case 'j':
        case 'J':
          e.preventDefault();
          seekRelative(-10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          seekRelative(10);
          break;
        case 'c':
        case 'C':
          e.preventDefault();
          changeSpeed(parseFloat((playbackRate + 0.1).toFixed(2)));
          break;
        case 'x':
        case 'X':
          e.preventDefault();
          changeSpeed(parseFloat((playbackRate - 0.1).toFixed(2)));
          break;
        case 's':
        case 'S':
        case 'v':
        case 'V':
          e.preventDefault();
          cycleSubtitle();
          break;
        case 'l':
        case 'L':
          e.preventDefault();
          cycleAudioTrack();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          toggleMute();
          break;
        case 'b':
        case 'B':
          e.preventDefault();
          toggleBrownNoise();
          break;
        case '?':
          e.preventDefault();
          setShowShortcutsModal(prev => !prev);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayPause, seekRelative, changeSpeed, playbackRate, cycleSubtitle, cycleAudioTrack, toggleFullscreen, toggleMute, toggleBrownNoise, isLocked]);

  // Mouse Wheel Scroll on Window to Seek Video Forward and Backward (PotPlayer / VLC style)
  useEffect(() => {
    let lastWheelTime = 0;
    let accumulatedDelta = 0;

    const handleWheel = (e) => {
      // Don't intercept if screen is locked
      if (isLocked) return;

      // Don't intercept if scrolling inside a sidebar, drawer, modal, or episodes list
      if (e.target && (e.target.closest('.netflix-episodes-sidebar') || e.target.closest('.netflix-drawer') || e.target.closest('.modal-container') || e.target.closest('.netflix-episodes-list'))) {
        return;
      }

      e.preventDefault();

      accumulatedDelta += e.deltaY;
      const now = Date.now();

      // Fire seek after threshold reached or cooldown elapsed
      if (Math.abs(accumulatedDelta) >= 35 || now - lastWheelTime > 90) {
        const step = Math.abs(accumulatedDelta) > 90 ? 10 : 5;
        if (accumulatedDelta < 0) {
          // Scrolled UP -> Seek Forward
          seekRelative(step);
          showToast?.(`+${step}s`);
        } else if (accumulatedDelta > 0) {
          // Scrolled DOWN -> Seek Backward
          seekRelative(-step);
          showToast?.(`-${step}s`);
        }
        accumulatedDelta = 0;
        lastWheelTime = now;
        resetControlsTimeout();
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [isLocked, seekRelative, resetControlsTimeout, showToast]);

  return (
    <div className={`netflix-player-root sub-size-${subFontSize} ${activeDrawer === 'episodes' ? 'sidebar-open' : ''}`} ref={containerRef}>
      {/* Dynamic Subtitle Font Size Override */}
      <style>{`
        ::cue, video::cue {
          font-size: ${
            subFontSize === 'sm' ? '1.05rem' :
            subFontSize === 'lg' ? '1.85rem' :
            subFontSize === 'xl' ? '2.35rem' : '1.38rem'
          } !important;
        }
      `}</style>
      {/* Background Brown Noise Audio */}
      <audio
        ref={brownNoiseRef}
        src="/brown.dat"
        loop
        preload="auto"
        style={{ display: 'none' }}
      />

      {/* Synchronized Alternate Audio Track */}
      <audio
        ref={altAudioRef}
        playsInline
        preload="auto"
        style={{ display: 'none' }}
      />

      {/* Main Video Wrapper */}
      <div
        className={`netflix-video-viewport ${isHideControls && !activeDrawer && !isLocked ? 'hide-controls' : ''}`}
        ref={videoWrapperRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseMove={resetControlsTimeout}
        onMouseEnter={resetControlsTimeout}
        onClick={(e) => {
          if (touchHandledRef.current) {
            touchHandledRef.current = false;
            return;
          }
          handleViewportTap(e);
        }}
      >
        {/* Video Element with CSS Brightness & Aspect Ratio filter */}
        <video
          ref={videoRef}
          src={streamUrl}
          className={`netflix-video-element aspect-${aspectMode}`}
          autoPlay
          playsInline
          crossOrigin="anonymous"
          style={{
            filter: `brightness(${brightness})`,
            objectFit: activeDrawer === 'episodes' ? 'contain' : (aspectMode === 'fit' ? 'contain' : aspectMode === 'fill' ? 'cover' : aspectMode === 'stretch' ? 'fill' : 'cover'),
            transform: activeDrawer === 'episodes' ? 'scale(0.92)' : (aspectMode === 'zoom' ? 'scale(1.22)' : 'none'),
            width: '100%',
            height: '100%',
            borderRadius: activeDrawer === 'episodes' ? '12px' : '0px',
            boxShadow: activeDrawer === 'episodes' ? '0 12px 48px rgba(0, 0, 0, 0.9)' : 'none',
            transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), object-fit 0.3s ease, border-radius 0.3s ease, box-shadow 0.3s ease'
          }}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleVideoEnded}
          onPlay={handlePlay}
          onPause={handlePause}
          onSeeked={handleSeeked}
          onWaiting={handleWaiting}
          onPlaying={handlePlaying}
          onRateChange={handleRateChange}
        >
          {selectedSubtitle && (
            <track
              key={selectedSubtitle.id}
              kind="subtitles"
              src={selectedSubtitle.src}
              srcLang={selectedSubtitle.srclang || 'en'}
              label={selectedSubtitle.label}
              default
              onLoad={() => {
                if (videoRef.current && videoRef.current.textTracks) {
                  for (let i = 0; i < videoRef.current.textTracks.length; i++) {
                    videoRef.current.textTracks[i].mode = 'showing';
                  }
                }
              }}
            />
          )}
        </video>

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
              if (altAudioRef.current && selectedAudioTrack > 0) {
                altAudioRef.current.muted = false;
              }
            }}
          >
            <i className="fas fa-volume-up"></i>
            <span>Click to Unmute</span>
          </button>
        )}

        {/* Double-Tap Seeking Wave Overlays */}
        <div className={`seek-overlay left ${leftSeekActive ? 'show-icon' : ''}`}>
          <svg viewBox="0 0 24 24" width="56" height="56" fill="currentColor">
            <path d="M12.5 3a9 9 0 1 0 7.8 4.5l-1.5.8A7.2 7.2 0 1 1 12.5 4.8V7l4-3.5L12.5 0v3z"/>
            <text x="12" y="16.5" fontSize="7.5" fontWeight="bold" textAnchor="middle" fill="currentColor">10</text>
          </svg>
        </div>
        <div className={`seek-overlay right ${rightSeekActive ? 'show-icon' : ''}`}>
          <svg viewBox="0 0 24 24" width="56" height="56" fill="currentColor">
            <path d="M11.5 3a9 9 0 1 1-7.8 4.5l1.5.8A7.2 7.2 0 1 0 11.5 4.8V7l-4-3.5L11.5 0v3z"/>
            <text x="12" y="16.5" fontSize="7.5" fontWeight="bold" textAnchor="middle" fill="currentColor">10</text>
          </svg>
        </div>

        {/* Horizontal Slide to Skip HUD Overlay */}
        {slideSeek.active && (
          <div className="netflix-slide-hud">
            <div className="slide-hud-icon">
              {slideSeek.delta >= 0 ? <i className="fas fa-forward"></i> : <i className="fas fa-backward"></i>}
            </div>
            <div className="slide-hud-delta">
              {slideSeek.delta >= 0 ? `+${Math.round(slideSeek.delta)}s` : `${Math.round(slideSeek.delta)}s`}
            </div>
            <div className="slide-hud-time">
              {formatTime(slideSeek.targetTime)} <span style={{ opacity: 0.6 }}>/ {formatTime(duration)}</span>
            </div>
          </div>
        )}

        {/* Aspect Ratio Screen Fit HUD Notification */}
        {aspectNotification && (
          <div className="netflix-aspect-hud">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
            </svg>
            <span>{aspectNotification}</span>
          </div>
        )}

        {/* Vertical Brightness Slider Indicator (Left Side) */}
        <div className={`netflix-vertical-slider brightness-slider ${showBrightnessSlider ? 'visible' : ''}`}>
          <div className="slider-icon"><i className="fas fa-sun"></i></div>
          <div className="slider-track">
            <div className="slider-fill" style={{ height: `${Math.round(((brightness - 0.25) / 1.25) * 100)}%` }}></div>
          </div>
        </div>

        {/* Vertical Volume Slider Indicator (Right Side) */}
        <div className={`netflix-vertical-slider volume-slider ${showVolumeSlider ? 'visible' : ''}`}>
          <div className="slider-icon"><i className={`fas fa-${volume === 0 || isMuted ? 'volume-mute' : 'volume-up'}`}></i></div>
          <div className="slider-track">
            <div className="slider-fill" style={{ height: `${Math.round((isMuted ? 0 : volume) * 100)}%` }}></div>
          </div>
        </div>

        {/* Skip Intro Button */}
        {showSkipIntro && (
          <button
            className="netflix-skip-intro-btn"
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

        {/* SCREEN LOCKED FLOATING UNLOCK PROMPT */}
        {isLocked && (
          <div className={`netflix-locked-overlay ${showUnlockPrompt ? 'active' : ''}`} onClick={(e) => e.stopPropagation()}>
            <button
              className="netflix-unlock-pill-btn"
              onClick={() => {
                setIsLocked(false);
                setShowUnlockPrompt(false);
                showToast?.('Screen Unlocked');
              }}
            >
              <i className="fas fa-lock"></i>
              <span>Screen Locked</span>
              <span className="unlock-subtext">Tap to unlock</span>
            </button>
          </div>
        )}

        {/* ==========================================
            NETFLIX CONTROLS OVERLAY LAYER
           ========================================== */}
        {!isLocked && (
          <div className="netflix-controls-layer" onClick={handleViewportTap}>
            {/* Top Bar: Back, Title, Cast, Lock */}
            <div className="netflix-top-bar">
              <button
                className="netflix-top-btn back-btn"
                onClick={handleBackToFolderWithSave}
                title="Back to lectures"
              >
                <i className="fas fa-arrow-left"></i>
              </button>

              <div className="netflix-title-info">
                <div className="netflix-title-row">
                  <span className="netflix-ends-at-prefix">Ends at {endsAtClockTime}</span>
                  <span className="netflix-title-dot">•</span>
                  <span className="netflix-series-title" title={folderName || 'Courseflix'}>
                    {trimTitle(folderName || 'Courseflix', 28)}
                  </span>
                </div>
                <span
                  className="netflix-episode-title"
                  title={currentIdx >= 0 ? `S1:E${currentIdx + 1} "${lecture.name}"` : lecture.name}
                >
                  {currentIdx >= 0
                    ? `S1:E${currentIdx + 1} "${trimTitle(lecture.name, 45)}"`
                    : trimTitle(lecture.name, 45)}
                </span>
              </div>

              <div className="netflix-top-actions">
                {/* CC / Subtitles Quick Cycle Button */}
                <button
                  className={`netflix-top-btn ${selectedSubtitle ? 'active-sub' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    cycleSubtitle();
                  }}
                  title={selectedSubtitle ? `Subtitles: ${selectedSubtitle.label} (Tap to cycle)` : 'Subtitles: Off (Tap to cycle)'}
                  style={{ color: selectedSubtitle ? '#E50914' : 'rgba(255, 255, 255, 0.85)' }}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M19 4H5c-1.11 0-2 .9-2 2v12a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6a2 2 0 0 0-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1z"/>
                  </svg>
                </button>

                {/* Brown Noise */}
                <button
                  className="netflix-top-btn"
                  onClick={toggleBrownNoise}
                  title={`Brown Noise (${brownNoiseActive ? 'ON' : 'OFF'})`}
                  style={{ color: brownNoiseActive ? 'var(--accent-primary)' : 'inherit' }}
                >
                  <i className="fas fa-wave-square"></i>
                </button>

                {/* Gear Settings: Subtitle & Playback Options */}
                <button
                  className={`netflix-top-btn ${activeDrawer === 'subSettings' ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveDrawer(prev => prev === 'subSettings' ? null : 'subSettings');
                  }}
                  title="Subtitle & Playback Settings"
                  style={{ color: activeDrawer === 'subSettings' ? '#E50914' : 'inherit' }}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                  </svg>
                </button>

                {/* Fullscreen Toggle */}
                <button
                  className="netflix-top-btn"
                  onClick={toggleFullscreen}
                  title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                    {isFullscreen ? (
                      <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
                    ) : (
                      <path d="M15 3h6v6M9 21H3v-6M21 9V3m0 0l-7 7M3 15v6m0 0l7-7"/>
                    )}
                  </svg>
                </button>

                {/* Aspect Ratio Screen-Fit (Fit, Fill Notch, Stretch, Zoom) */}
                <button
                  className="netflix-top-btn aspect-btn"
                  onClick={cycleAspectMode}
                  title={`Aspect Ratio: ${aspectMode.toUpperCase()} (Tap to switch between Fit, Fill Notch, Stretch, Zoom)`}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                    {aspectMode === 'fit' && <path d="M4 8V4h4m8 0h4v4m0 8v4h-4m-8 0H4v-4"/>}
                    {aspectMode === 'fill' && <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>}
                    {aspectMode === 'stretch' && <path d="M8 7l4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4M17 8l4 4-4 4"/>}
                    {aspectMode === 'zoom' && <path d="M15 15l6 6m-11-4a7 7 0 1 1 0-14 7 7 0 0 1 0 14zm-3-7h6m-3-3v6"/>}
                  </svg>
                  <span className="aspect-badge-text">
                    {aspectMode === 'fit' ? 'FIT' : aspectMode === 'fill' ? 'FILL' : aspectMode === 'stretch' ? 'WIDE' : 'ZOOM'}
                  </span>
                </button>

                {/* Lock Screen Button */}
                <button
                  className="netflix-top-btn lock-btn"
                  onClick={() => {
                    setIsLocked(true);
                    setIsHideControls(true);
                    showToast?.('Screen Locked. Tap unlock icon to restore.');
                  }}
                  title="Lock Screen"
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* Center Controls: 10s Rewind, Big Play/Pause, 10s Forward */}
            <div className="netflix-center-controls">
              {/* Rewind 10s */}
              <button
                className="netflix-seek-circle-btn"
                onClick={() => seekRelative(-10)}
                title="Rewind 10s"
              >
                <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
                  <path d="M12.5 3a9 9 0 1 0 7.8 4.5l-1.5.8A7.2 7.2 0 1 1 12.5 4.8V7l4-3.5L12.5 0v3z"/>
                  <text x="12" y="16.5" fontSize="7.5" fontWeight="bold" textAnchor="middle" fill="currentColor">10</text>
                </svg>
              </button>

              {/* Big Play / Pause (Netflix Pure Geometric Icon) */}
              <button
                className="netflix-main-play-btn"
                onClick={togglePlayPause}
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <svg viewBox="0 0 24 24" width="46" height="46" fill="currentColor">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="52" height="52" fill="currentColor" style={{ marginLeft: '4px' }}>
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                )}
              </button>

              {/* Forward 10s */}
              <button
                className="netflix-seek-circle-btn"
                onClick={() => seekRelative(10)}
                title="Forward 10s"
              >
                <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
                  <path d="M11.5 3a9 9 0 1 1-7.8 4.5l1.5.8A7.2 7.2 0 1 0 11.5 4.8V7l-4-3.5L11.5 0v3z"/>
                  <text x="12" y="16.5" fontSize="7.5" fontWeight="bold" textAnchor="middle" fill="currentColor">10</text>
                </svg>
              </button>
            </div>

            {/* Bottom Controls Container */}
            <div className="netflix-bottom-controls">
              {/* Timeline Container with Netflix Red Bar */}
              <div className="netflix-timeline-wrapper">
                <input
                  type="range"
                  className="netflix-timeline-slider"
                  min="0"
                  max={duration || 100}
                  step="0.1"
                  value={currentTime}
                  onInput={handleTimelineInput}
                  onChange={handleTimelineChange}
                  style={{
                    background: `linear-gradient(to right, #E50914 ${timelineProgressPercent}%, rgba(255, 255, 255, 0.25) ${timelineProgressPercent}%)`
                  }}
                />

                {/* Bookmark dots on timeline */}
                <div className="netflix-timeline-bookmarks">
                  {bookmarks.map((bTime) => {
                    const bPercent = duration > 0 ? (bTime / duration) * 100 : 0;
                    return (
                      <div
                        key={bTime}
                        className="netflix-timeline-bookmark-dot"
                        style={{ left: `${bPercent}%` }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (videoRef.current) {
                            videoRef.current.currentTime = bTime;
                            showToast?.(`Moment: ${formatTime(bTime)}`);
                          }
                        }}
                      />
                    );
                  })}
                </div>

                {/* Remaining Time Display (NO '--', cycles Real-Time / Standard Video Time / Ends At on click) */}
                <div
                  className="netflix-time-remaining"
                  onClick={cycleTimeDisplayMode}
                  title="Click to toggle time format: Real-Time / Standard Video Time / Ends At"
                >
                  {getTimeRemainingLabel()}
                </div>
              </div>

              {/* Bottom 5 Action Buttons (Matching exact Netflix mobile UI) */}
              <div className="netflix-action-bar">
                {/* 1. Moments */}
                <button
                  className={`netflix-bar-btn ${activeDrawer === 'moments' ? 'active' : ''}`}
                  onClick={() => setActiveDrawer(prev => prev === 'moments' ? null : 'moments')}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                  </svg>
                  <span>Moments</span>
                </button>

                {/* 2. Speed */}
                <button
                  className={`netflix-bar-btn ${activeDrawer === 'speed' ? 'active' : ''}`}
                  onClick={() => setActiveDrawer(prev => prev === 'speed' ? null : 'speed')}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 14.93V17a1 1 0 0 1-2 0v-.07a8 8 0 0 1-4.93-4.93H6a1 1 0 0 1 0-2h.07A8 8 0 0 1 11 5.07V5a1 1 0 0 1 2 0v.07a8 8 0 0 1 4.93 4.93H18a1 1 0 0 1 0 2h-.07a8 8 0 0 1-4.93 4.93zM12 8a4 4 0 1 0 4 4 4 4 0 0 0-4-4zm-1 3h2v2h-2z"/>
                  </svg>
                  <span>Speed ({playbackRate}x)</span>
                </button>

                {/* 3. Episodes */}
                <button
                  className={`netflix-bar-btn ${activeDrawer === 'episodes' ? 'active' : ''}`}
                  onClick={() => setActiveDrawer(prev => prev === 'episodes' ? null : 'episodes')}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="7" width="16" height="13" rx="2"/>
                    <path d="M6 3h14a2 2 0 0 1 2 2v12"/>
                  </svg>
                  <span>Episodes</span>
                </button>

                {/* 4. Audio & Subtitles */}
                <button
                  className={`netflix-bar-btn ${activeDrawer === 'audioSub' ? 'active' : ''}`}
                  onClick={() => setActiveDrawer(prev => prev === 'audioSub' ? null : 'audioSub')}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <path d="M20 2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4l4 4 4-4h4a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm-9 10H7v-2h4v2zm6 0h-4v-2h4v2zm0-4H7V6h10v2z"/>
                  </svg>
                  <span>Audio & Subtitles</span>
                </button>

                {/* 5. Prev Ep. */}
                <button
                  className="netflix-bar-btn"
                  onClick={playPrevLecture}
                  disabled={!hasPrevLecture}
                  style={{ opacity: hasPrevLecture ? 1 : 0.4 }}
                  title={hasPrevLecture ? "Previous Episode" : "No previous episode"}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
                  </svg>
                  <span>Prev Ep.</span>
                </button>

                {/* 6. Next Ep. */}
                <button
                  className="netflix-bar-btn"
                  onClick={playNextLecture}
                  disabled={!hasNextLecture}
                  style={{ opacity: hasNextLecture ? 1 : 0.4 }}
                  title={hasNextLecture ? "Next Episode" : "No next episode"}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                  </svg>
                  <span>Next Ep.</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==========================================
            NETFLIX BOTTOM SHEETS / DRAWERS
           ========================================== */}

        {/* 1. Moments Drawer */}
        {activeDrawer === 'moments' && (
          <div className="netflix-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="netflix-drawer-header">
              <div className="drawer-title">
                <i className="fas fa-bookmark" style={{ color: '#E50914' }}></i>
                <span>Saved Moments</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="netflix-drawer-btn-sm" onClick={handleAddBookmark}>
                  <i className="fas fa-plus"></i> Add Current Time
                </button>
                <button className="netflix-drawer-close" onClick={() => setActiveDrawer(null)}>
                  &times;
                </button>
              </div>
            </div>

            <div className="netflix-drawer-content">
              {bookmarks.length === 0 ? (
                <div className="netflix-empty-drawer">
                  <p>No saved moments yet for this lecture.</p>
                  <button className="btn btn-primary" style={{ marginTop: '8px' }} onClick={handleAddBookmark}>
                    <i className="fas fa-plus"></i> Save Moment at {formatTime(currentTime)}
                  </button>
                </div>
              ) : (
                <div className="netflix-moments-grid">
                  {bookmarks.map((time) => (
                    <div key={time} className="netflix-moment-chip">
                      <div
                        className="moment-click-target"
                        onClick={() => {
                          if (videoRef.current) {
                            videoRef.current.currentTime = time;
                            showToast?.(`Jumped to ${formatTime(time)}`);
                          }
                          setActiveDrawer(null);
                        }}
                      >
                        <i className="fas fa-play-circle" style={{ color: '#E50914' }}></i>
                        <span className="moment-timestamp">{formatTime(time)}</span>
                      </div>
                      <button
                        className="moment-del-btn"
                        onClick={() => handleRemoveBookmark(time)}
                        title="Delete moment"
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 2. Speed Drawer */}
        {activeDrawer === 'speed' && (
          <div className="netflix-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="netflix-drawer-header">
              <div className="drawer-title">
                <i className="fas fa-tachometer-alt" style={{ color: '#E50914' }}></i>
                <span>Playback Speed</span>
              </div>
              <button className="netflix-drawer-close" onClick={() => setActiveDrawer(null)}>
                &times;
              </button>
            </div>

            <div className="netflix-drawer-content">
              <div className="netflix-speed-list">
                {PRESET_SPEEDS.map((s) => {
                  const isSelected = Math.abs(s - playbackRate) < 0.05;
                  return (
                    <div
                      key={s}
                      className={`netflix-speed-row ${isSelected ? 'selected' : ''}`}
                      onClick={() => {
                        changeSpeed(s);
                        setActiveDrawer(null);
                      }}
                    >
                      <span>{s}x {s === 1 ? '(Normal)' : ''}</span>
                      {isSelected && <i className="fas fa-check" style={{ color: '#E50914' }}></i>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 4. Audio & Subtitles Track Selection Drawer */}
        {activeDrawer === 'audioSub' && (
          <div className="netflix-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="netflix-drawer-header">
              <div className="drawer-title">
                <i className="fas fa-closed-captioning" style={{ color: '#E50914' }}></i>
                <span>Audio & Subtitles</span>
              </div>
              <button className="netflix-drawer-close" onClick={() => setActiveDrawer(null)}>
                &times;
              </button>
            </div>

            <div className="netflix-drawer-content" style={{ maxHeight: '68vh', overflowY: 'auto', paddingBottom: '20px' }}>
              {/* Subtitle & Audio Columns */}
              <div className="netflix-audio-sub-columns">
                {/* Audio Column */}
                <div className="audio-sub-column">
                  <div className="column-title">AUDIO</div>
                  <div className="column-options">
                    {availableAudioTracks.map((at) => (
                      <div
                        key={at.streamIndex ?? at.index}
                        className={`column-option-row ${selectedAudioTrack === at.index ? 'selected' : ''}`}
                        onClick={() => handleSelectAudioTrack(at)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>{at.label}</span>
                          {at.language && at.language !== 'und' && (
                            <span style={{
                              fontSize: '0.62rem',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              background: 'rgba(255, 255, 255, 0.1)',
                              color: 'rgba(255, 255, 255, 0.8)',
                              textTransform: 'uppercase',
                              fontWeight: '600'
                            }}>
                              {at.language}
                            </span>
                          )}
                        </div>
                        {selectedAudioTrack === at.index && <i className="fas fa-check" style={{ color: '#E50914' }}></i>}
                      </div>
                    ))}
                    {availableAudioTracks.length === 0 && (
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '8px 0' }}>
                        Default Audio Track
                      </div>
                    )}
                  </div>
                </div>

                {/* Subtitles Column */}
                <div className="audio-sub-column">
                  <div className="column-title">SUBTITLES</div>
                  <div className="column-options">
                    {/* Off */}
                    <div
                      className={`column-option-row ${selectedSubtitle === null ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedSubtitle(null);
                        localStorage.setItem('courseflix_subtitles', 'off');
                        showToast?.('Subtitles: OFF');
                      }}
                    >
                      <span>Off</span>
                      {selectedSubtitle === null && <i className="fas fa-check" style={{ color: '#E50914' }}></i>}
                    </div>

                    {/* Detected Subtitle files (deduplicated) */}
                    {availableSubtitles.map((sub) => {
                      const isSelected = selectedSubtitle && (selectedSubtitle.id === sub.id || selectedSubtitle.src === sub.src);
                      return (
                        <div
                          key={sub.id || sub.src}
                          className={`column-option-row ${isSelected ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedSubtitle(sub);
                            localStorage.setItem('courseflix_subtitles', sub.id || sub.src);
                            showToast?.(`Subtitles: ${sub.label}`);
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>{sub.label}</span>
                            {sub.isEmbedded && (
                              <span style={{
                                fontSize: '0.62rem',
                                padding: '1px 5px',
                                borderRadius: '3px',
                                background: 'rgba(229, 9, 20, 0.2)',
                                color: '#ff6b6b',
                                border: '1px solid rgba(229, 9, 20, 0.4)',
                                fontWeight: '600'
                              }}>
                                EMBEDDED
                              </span>
                            )}
                          </div>
                          {isSelected && <i className="fas fa-check" style={{ color: '#E50914' }}></i>}
                        </div>
                      );
                    })}

                    {availableSubtitles.length === 0 && (
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '8px 0' }}>
                        No subtitles available in this file or folder.
                      </div>
                    )}

                    {/* Quick Link to Subtitle Styling & Font Size Gear */}
                    <button
                      className="sub-gear-jump-btn"
                      onClick={() => setActiveDrawer('subSettings')}
                    >
                      <i className="fas fa-cog"></i>
                      <span>Subtitle Font & Style Settings</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 5. Dedicated Subtitle Settings Gear Drawer */}
        {activeDrawer === 'subSettings' && (
          <div className="netflix-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="netflix-drawer-header">
              <div className="drawer-title">
                <i className="fas fa-cog" style={{ color: '#E50914' }}></i>
                <span>Subtitle Settings & Font</span>
              </div>
              <button className="netflix-drawer-close" onClick={() => setActiveDrawer(null)}>
                &times;
              </button>
            </div>

            <div className="netflix-drawer-content" style={{ maxHeight: '68vh', overflowY: 'auto', paddingBottom: '20px' }}>
              {/* Subtitle Font Size Presets */}
              <div className="sub-settings-section">
                <div className="sub-settings-label">
                  <span>SUBTITLE FONT SIZE</span>
                  <span style={{ color: '#E50914', fontSize: '0.8rem' }}>{subFontSize.toUpperCase()}</span>
                </div>
                <div className="sub-size-pills">
                  {[
                    { id: 'sm', label: 'Small (80%)' },
                    { id: 'md', label: 'Normal (100%)' },
                    { id: 'lg', label: 'Large (130%)' },
                    { id: 'xl', label: 'Huge (160%)' }
                  ].map((opt) => (
                    <div
                      key={opt.id}
                      className={`sub-size-pill ${subFontSize === opt.id ? 'active' : ''}`}
                      onClick={() => {
                        setSubFontSize(opt.id);
                        localStorage.setItem('courseflix_sub_fontsize', opt.id);
                        showToast?.(`Subtitle Size: ${opt.label}`);
                      }}
                    >
                      {opt.label}
                    </div>
                  ))}
                </div>

                {/* Subtitle Style Info */}
                <div style={{ marginTop: '12px', fontSize: '0.78rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="fas fa-info-circle" style={{ color: '#E50914' }}></i>
                  <span>Font: Comic Sans MS • Color: White • Outline: Black • Background: None</span>
                </div>

                {/* Anime Subtitle Live Preview Box */}
                <div className="sub-preview-card">
                  <div
                    className="sub-preview-text"
                    style={{
                      fontSize: subFontSize === 'sm' ? '1.05rem' :
                                subFontSize === 'lg' ? '1.75rem' :
                                subFontSize === 'xl' ? '2.25rem' : '1.35rem'
                    }}
                  >
                    H-h-hey! Not this way!
                  </div>
                </div>

                {/* Shortcut button back to track selection */}
                <button
                  className="sub-gear-jump-btn"
                  onClick={() => setActiveDrawer('audioSub')}
                  style={{ marginTop: '16px' }}
                >
                  <i className="fas fa-closed-captioning"></i>
                  <span>Switch Audio / Subtitle Tracks</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right-Hand Side Episode Playlist Sidebar (Sacrifices video space, isolated touch & wheel scroll) */}
      {activeDrawer === 'episodes' && (
        <aside
          className="netflix-episodes-sidebar"
          onClick={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          <div className="netflix-sidebar-header">
            <div className="sidebar-title">
              <i className="fas fa-layer-group" style={{ color: '#E50914' }}></i>
              <span>Episodes & Lectures</span>
              <span className="sidebar-count">({playlist.length})</span>
            </div>
            <button
              className="netflix-sidebar-close-btn"
              onClick={() => setActiveDrawer(null)}
              title="Close Playlist"
            >
              &times;
            </button>
          </div>

          <div
            className="netflix-sidebar-content scrollable"
            onWheel={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            {playlist.map((lec, idx) => {
              const isActive = lec.id === lecture.id;
              return (
                <div
                  key={lec.id}
                  className={`netflix-sidebar-episode-row ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    if (!isActive) {
                      onSelectLecture(lec);
                    }
                  }}
                >
                  <div className="sidebar-episode-idx">{idx + 1}</div>
                  <div className="sidebar-episode-info">
                    <div className="sidebar-episode-title">{lec.name}</div>
                    <div className="sidebar-episode-meta">
                      <span>{formatDuration(lec.duration)}</span>
                      {lec.completed && (
                        <span className="sidebar-episode-completed">
                          <i className="fas fa-check-circle"></i> Completed
                        </span>
                      )}
                    </div>
                  </div>
                  {isActive ? (
                    <div className="sidebar-playing-badge" title="Playing">
                      <span className="eq-bar"></span>
                      <span className="eq-bar"></span>
                      <span className="eq-bar"></span>
                    </div>
                  ) : (
                    <button className="sidebar-play-btn" title="Play">
                      <i className="fas fa-play"></i>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </aside>
      )}

      {/* Keyboard Shortcuts Modal */}
      <ShortcutsModal
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
      />
    </div>
  );
}
