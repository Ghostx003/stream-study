import React from 'react';
import { formatTime, formatDuration } from '../utils/formatters';

export default function LectureList({
  lectures = [],
  onPlayLecture,
  onToggleCompleted,
  title = 'Lectures'
}) {
  if (!lectures || lectures.length === 0) return null;

  return (
    <div className="lecture-list-card">
      <div className="lecture-list-header">
        <div className="lecture-list-title">
          <i className="fas fa-play-circle" style={{ color: '#E50914' }}></i>
          {title}
          <span className="lecture-list-count">
            ({lectures.length})
          </span>
        </div>
      </div>

      <div className="lecture-rows-container">
        {lectures.map((lecture, idx) => {
          const isCompleted = !!lecture.completed;
          const watchedProgress = lecture.currentTime > 0 && lecture.duration > 0
            ? Math.min(100, Math.round((lecture.currentTime / lecture.duration) * 100))
            : 0;
          const hasSubtitles = lecture.subtitles && lecture.subtitles.length > 0;

          return (
            <div key={lecture.id} className={`lecture-row ${isCompleted ? 'is-completed' : ''}`}>
              {/* Checkbox */}
              <div
                className="lecture-checkbox-wrapper"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleCompleted(lecture.id, !isCompleted);
                }}
                title={isCompleted ? 'Mark uncompleted' : 'Mark completed'}
              >
                <div className={`custom-check-box ${isCompleted ? 'checked' : ''}`}>
                  {isCompleted ? <i className="fas fa-check"></i> : <span className="ep-num">{idx + 1}</span>}
                </div>
              </div>

              {/* Lecture Title & Details */}
              <div
                className="lecture-info"
                onClick={() => onPlayLecture(lecture)}
              >
                <div className={`lecture-name ${isCompleted ? 'completed' : ''}`}>
                  {lecture.name}
                </div>

                <div className="lecture-meta">
                  <span className="meta-duration">
                    <i className="fas fa-clock"></i> {formatDuration(lecture.duration)}
                  </span>

                  {!isCompleted && lecture.currentTime > 0 && (
                    <span className="meta-watched">
                      • {formatTime(lecture.currentTime)} watched
                    </span>
                  )}

                  {!isCompleted && lecture.remainingTime > 0 && (
                    <span className="meta-left">
                      • {formatDuration(lecture.remainingTime)} left
                    </span>
                  )}

                  {isCompleted && (
                    <span className="meta-done">
                      • Completed
                    </span>
                  )}

                  {hasSubtitles && (
                    <span className="meta-sub-badge" title="Subtitles Available">
                      <i className="fas fa-closed-captioning"></i> CC
                    </span>
                  )}
                </div>

                {/* In-progress mini bar under lecture */}
                {watchedProgress > 0 && !isCompleted && (
                  <div className="lecture-inline-progress">
                    <div
                      className="lecture-inline-progress-fill"
                      style={{ width: `${watchedProgress}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Play Action Button */}
              <div className="lecture-actions">
                <button
                  className="play-btn-circle"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlayLecture(lecture);
                  }}
                  title="Play"
                >
                  <i className="fas fa-play"></i>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
