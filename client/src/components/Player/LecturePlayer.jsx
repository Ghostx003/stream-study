import React, { useState, useEffect, useRef, useCallback } from 'react';
import { formatTime, formatDuration, formatTimeRemaining } from '../../utils/formatters';
import { api } from '../../utils/api';
import ShortcutsModal from './ShortcutsModal';

const PRESET_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5];

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

  // Stream URL
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
    const initialTime = lecture.currentTime || 0;
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
    if (isLocked) return;
    setIsHideControls(false);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused && !activeDrawer) {
        setIsHideControls(true);
      }
    }, 4000);
  }, [isLocked, activeDrawer]);

  // Play / Pause toggle
  const togglePlayPause = useCallback(() => {
    if (!videoRef.current || isLocked) return;
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
          videoRef.current.play().catch(() => {});
        }
      });
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
      if (brownNoiseRef.current && !brownNoiseRef.current.paused) {
        brownNoiseRef.current.pause();
      }
    }
    resetControlsTimeout();
  }, [isLocked, brownNoiseActive, resetControlsTimeout]);

  // Seek relative seconds with icon animation
  const seekRelative = useCallback((seconds) => {
    if (!videoRef.current || isLocked) return;
    const dur = videoRef.current.duration || duration || 0;
    const newTime = Math.max(0, Math.min(dur, videoRef.current.currentTime + seconds));
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
    if (seconds > 0) {
      setRightSeekActive(true);
      setTimeout(() => setRightSeekActive(false), 550);
    } else {
      setLeftSeekActive(true);
      setTimeout(() => setLeftSeekActive(false), 550);
    }
    resetControlsTimeout();
  }, [isLocked, duration, resetControlsTimeout]);

  // Change playback speed
  const changeSpeed = useCallback((newSpeed) => {
    const clamped = Math.max(0.1, Math.min(5.0, Math.round(newSpeed * 100) / 100));
    setPlaybackRate(clamped);
    if (videoRef.current) {
      videoRef.current.playbackRate = clamped;
    }
    showToast?.(`Speed: ${clamped}x`);
  }, [showToast]);

  // Fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen().catch(() => {});
      } else if (containerRef.current.webkitRequestFullscreen) {
        containerRef.current.webkitRequestFullscreen().catch(() => {});
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen().catch(() => {});
      }
    }
  }, []);

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
      api.updateProgress(lecture.id, {
        currentTime: videoRef.current.currentTime,
        duration: videoRef.current.duration || 0
      }).catch(() => {});
      onUpdateLectureProgress?.(lecture.id, {
        currentTime: videoRef.current.currentTime
      });
    }
    onBackToFolder();
  }, [lecture.id, onBackToFolder, onUpdateLectureProgress]);

  // ==========================================
  // TOUCH GESTURES (Brightness, Volume, Slide Seek)
  // ==========================================
  const handleTouchStart = (e) => {
    if (isLocked) {
      setShowUnlockPrompt(true);
      if (unlockTimeoutRef.current) clearTimeout(unlockTimeoutRef.current);
      unlockTimeoutRef.current = setTimeout(() => setShowUnlockPrompt(false), 3000);
      return;
    }

    if (e.touches.length === 1 && videoWrapperRef.current) {
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
    if (isLocked || e.touches.length !== 1 || !videoWrapperRef.current) return;
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
        // Brightness control (0.25 to 1.5)
        const newBright = Math.max(0.25, Math.min(1.5, start.startBrightness + deltaRatio));
        setBrightness(newBright);
        setShowBrightnessSlider(true);
        setShowVolumeSlider(false);
      } else if (start.isRightSide) {
        // Volume control (0.0 to 1.0)
        const newVol = Math.max(0, Math.min(1.0, start.startVolume + deltaRatio));
        setVolume(newVol);
        if (videoRef.current) {
          videoRef.current.volume = newVol;
          if (newVol > 0 && videoRef.current.muted) {
            videoRef.current.muted = false;
            setIsMuted(false);
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

  const handleTouchEnd = () => {
    if (isLocked) return;
    const start = touchStartRef.current;

    // Apply slide seek if active
    if (slideSeek.active) {
      if (videoRef.current && typeof slideSeek.targetTime === 'number') {
        videoRef.current.currentTime = slideSeek.targetTime;
        setCurrentTime(slideSeek.targetTime);
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
    if (!start.moved && Date.now() - start.time < 350 && videoWrapperRef.current) {
      const now = Date.now();
      const lastTap = lastTapRef.current;
      const rect = videoWrapperRef.current.getBoundingClientRect();
      const tapX = start.x - rect.left;

      if (now - lastTap.time < 350 && Math.abs(start.x - lastTap.x) < 50) {
        // Double tap!
        if (tapX < rect.width * 0.4) {
          seekRelative(-10);
        } else if (tapX > rect.width * 0.6) {
          seekRelative(10);
        } else {
          togglePlayPause();
        }
        lastTapRef.current = { time: 0, x: 0 };
      } else {
        lastTapRef.current = { time: now, x: start.x };
        // Single tap toggle controls
        setTimeout(() => {
          if (Date.now() - lastTapRef.current.time >= 350 && lastTapRef.current.time !== 0) {
            setIsHideControls(prev => !prev);
          }
        }, 360);
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

    // Detect browser native audio tracks if exposed
    if (videoRef.current.audioTracks && videoRef.current.audioTracks.length > 0) {
      const tracks = [];
      for (let i = 0; i < videoRef.current.audioTracks.length; i++) {
        const at = videoRef.current.audioTracks[i];
        tracks.push({
          id: i,
          label: at.label || `Audio Track ${i + 1} (${at.language || 'Default'})`,
          language: at.language
        });
      }
      setAvailableAudioTracks(tracks);
    } else {
      setAvailableAudioTracks([
        { id: 0, label: 'Default / Stereo Audio', language: 'default' }
      ]);
    }

    // Resume from where left off
    const targetTime = resumeTimeRef.current || lecture.currentTime || 0;
    if (targetTime > 1 && targetTime < (metaDur || 999999) - 3) {
      videoRef.current.currentTime = targetTime;
      setCurrentTime(targetTime);
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

  const handlePause = () => {
    setIsPlaying(false);
    if (videoRef.current && videoRef.current.currentTime > 0) {
      api.updateProgress(lecture.id, {
        currentTime: videoRef.current.currentTime,
        duration: videoRef.current.duration || duration || 0
      }).catch(() => {});
      onUpdateLectureProgress?.(lecture.id, { currentTime: videoRef.current.currentTime });
    }
  };

  const handleVideoEnded = () => {
    setIsPlaying(false);
    if (brownNoiseRef.current) brownNoiseRef.current.pause();
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
  };

  const handleTimelineChange = (e) => {
    const val = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = val;
    }
    api.updateProgress(lecture.id, { currentTime: val, duration: duration || 0 }).catch(() => {});
    onUpdateLectureProgress?.(lecture.id, { currentTime: val });
  };

  // Calculate duration formats
  const effectiveDuration = duration || 1;
  const remainingRealTime = Math.max(0, (effectiveDuration - currentTime) / Math.max(0.1, playbackRate));
  const remainingStandardTime = Math.max(0, effectiveDuration - currentTime);
  const timelineProgressPercent = Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100));

  // Brown noise
  const toggleBrownNoise = () => {
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
  };

  return (
    <div className="netflix-player-root" ref={containerRef}>
      {/* Background Brown Noise Audio */}
      <audio
        ref={brownNoiseRef}
        src="/brown.dat"
        loop
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
          if (e.target.closest('.netflix-controls-layer') || e.target.closest('.netflix-drawer') || e.target.closest('.unmute-btn')) {
            return;
          }
          if (isLocked) {
            setShowUnlockPrompt(true);
            if (unlockTimeoutRef.current) clearTimeout(unlockTimeoutRef.current);
            unlockTimeoutRef.current = setTimeout(() => setShowUnlockPrompt(false), 3000);
            return;
          }
          if (activeDrawer) {
            setActiveDrawer(null);
            return;
          }
          setIsHideControls(prev => !prev);
        }}
      >
        {/* Video Element with CSS Brightness filter */}
        <video
          ref={videoRef}
          src={streamUrl}
          className="netflix-video-element"
          autoPlay
          playsInline
          style={{ filter: `brightness(${brightness})` }}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleVideoEnded}
          onPlay={() => setIsPlaying(true)}
          onPause={handlePause}
        >
          {selectedSubtitle && (
            <track
              key={selectedSubtitle.id}
              kind="subtitles"
              src={selectedSubtitle.src}
              srcLang={selectedSubtitle.srclang || 'en'}
              label={selectedSubtitle.label}
              default
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
            }}
          >
            <i className="fas fa-volume-mute"></i> Click to Unmute
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
          <div className="netflix-controls-layer" onClick={(e) => e.stopPropagation()}>
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
                <span className="netflix-series-title">{folderName || 'Courseflix'}</span>
                <span className="netflix-episode-title">
                  {currentIdx >= 0 ? `S1:E${currentIdx + 1} "${lecture.name}"` : lecture.name}
                </span>
              </div>

              <div className="netflix-top-actions">
                {/* Brown Noise */}
                <button
                  className="netflix-top-btn"
                  onClick={toggleBrownNoise}
                  title={`Brown Noise (${brownNoiseActive ? 'ON' : 'OFF'})`}
                  style={{ color: brownNoiseActive ? 'var(--accent-primary)' : 'inherit' }}
                >
                  <i className="fas fa-wave-square"></i>
                </button>

                {/* Cast / TV */}
                <button
                  className="netflix-top-btn"
                  onClick={() => showToast?.('AirPlay / Cast')}
                  title="Cast to TV"
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="7" width="20" height="14" rx="2"/>
                    <path d="M12 17h.01M17 21l-5-4-5 4"/>
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

                {/* Remaining Time Display */}
                <div
                  className="netflix-time-remaining"
                  onClick={() => setShowRealTimeLeft(prev => !prev)}
                  title="Click to toggle time format"
                >
                  {showRealTimeLeft
                    ? `-${formatTimeRemaining(remainingRealTime)}`
                    : `-${formatTimeRemaining(remainingStandardTime)}`}
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

                {/* 5. Next Ep. */}
                <button
                  className="netflix-bar-btn"
                  onClick={playNextLecture}
                  disabled={!hasNextLecture}
                  style={{ opacity: hasNextLecture ? 1 : 0.4 }}
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

        {/* 3. Episodes Drawer */}
        {activeDrawer === 'episodes' && (
          <div className="netflix-drawer episodes-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="netflix-drawer-header">
              <div className="drawer-title">
                <i className="fas fa-layer-group" style={{ color: '#E50914' }}></i>
                <span>Episodes & Lectures ({playlist.length})</span>
              </div>
              <button className="netflix-drawer-close" onClick={() => setActiveDrawer(null)}>
                &times;
              </button>
            </div>

            <div className="netflix-drawer-content scrollable">
              {playlist.map((lec, idx) => {
                const isActive = lec.id === lecture.id;
                return (
                  <div
                    key={lec.id}
                    className={`netflix-episode-row ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      if (!isActive) {
                        onSelectLecture(lec);
                        setActiveDrawer(null);
                      }
                    }}
                  >
                    <div className="episode-index">{idx + 1}</div>
                    <div className="episode-info">
                      <div className="episode-title">{lec.name}</div>
                      <div className="episode-meta">
                        <span>{formatDuration(lec.duration)}</span>
                        {lec.completed && (
                          <span style={{ color: 'var(--accent-primary)', marginLeft: '8px' }}>
                            <i className="fas fa-check-circle"></i> Completed
                          </span>
                        )}
                      </div>
                    </div>
                    {isActive ? (
                      <div className="episode-playing-tag">Playing</div>
                    ) : (
                      <button className="episode-play-icon">
                        <i className="fas fa-play"></i>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. Audio & Subtitles Drawer */}
        {activeDrawer === 'audioSub' && (
          <div className="netflix-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="netflix-drawer-header">
              <div className="drawer-title">
                <i className="fas fa-comment-dots" style={{ color: '#E50914' }}></i>
                <span>Audio & Subtitles</span>
              </div>
              <button className="netflix-drawer-close" onClick={() => setActiveDrawer(null)}>
                &times;
              </button>
            </div>

            <div className="netflix-drawer-content">
              <div className="netflix-audio-sub-columns">
                {/* Audio Column */}
                <div className="audio-sub-column">
                  <div className="column-title">AUDIO</div>
                  <div className="column-options">
                    {availableAudioTracks.map((at) => (
                      <div
                        key={at.id}
                        className={`column-option-row ${selectedAudioTrack === at.id ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedAudioTrack(at.id);
                          if (videoRef.current && videoRef.current.audioTracks) {
                            for (let i = 0; i < videoRef.current.audioTracks.length; i++) {
                              videoRef.current.audioTracks[i].enabled = (i === at.id);
                            }
                          }
                          showToast?.(`Audio: ${at.label}`);
                        }}
                      >
                        <span>{at.label}</span>
                        {selectedAudioTrack === at.id && <i className="fas fa-check" style={{ color: '#E50914' }}></i>}
                      </div>
                    ))}
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
                        showToast?.('Subtitles: OFF');
                      }}
                    >
                      <span>Off</span>
                      {selectedSubtitle === null && <i className="fas fa-check" style={{ color: '#E50914' }}></i>}
                    </div>

                    {/* Detected Subtitle files from folder */}
                    {availableSubtitles.map((sub) => (
                      <div
                        key={sub.id}
                        className={`column-option-row ${selectedSubtitle?.id === sub.id ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedSubtitle(sub);
                          showToast?.(`Subtitles: ${sub.label}`);
                        }}
                      >
                        <span>{sub.label}</span>
                        {selectedSubtitle?.id === sub.id && <i className="fas fa-check" style={{ color: '#E50914' }}></i>}
                      </div>
                    ))}

                    {availableSubtitles.length === 0 && (
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '8px 0' }}>
                        No external subtitle files (.srt/.vtt) found in this folder.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Keyboard Shortcuts Modal */}
      <ShortcutsModal
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
      />
    </div>
  );
}
