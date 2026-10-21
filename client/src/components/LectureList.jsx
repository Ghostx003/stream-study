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
          <i className="fas fa-video" style={{ color: 'var(--accent-blue)' }}></i>
          {title}
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>
            ({lectures.length})
          </span>
        </div>
      </div>

      <div className="lecture-rows-container">
        {lectures.map((lecture) => {
          const isCompleted = !!lecture.completed;
          const watchedProgress = lecture.currentTime > 0 && lecture.duration > 0
            ? Math.round((lecture.currentTime / lecture.duration) * 100)
            : 0;

          return (
            <div key={lecture.id} className="lecture-row">
              {/* Completion checkbox */}
              <input
                type="checkbox"
                className="lecture-checkbox"
                checked={isCompleted}
                onChange={() => onToggleCompleted(lecture.id, !isCompleted)}
                title={isCompleted ? 'Mark uncompleted' : 'Mark completed'}
              />

              {/* Lecture Title & Details */}
              <div
                className="lecture-info"
                onClick={() => onPlayLecture(lecture)}
              >
                <div className={`lecture-name ${isCompleted ? 'completed' : ''}`}>
                  {lecture.name}
                </div>

                <div className="lecture-meta">
                  <span>
                    <i className="fas fa-clock" style={{ marginRight: '4px', opacity: 0.7 }}></i>
                    {formatDuration(lecture.duration)}
                  </span>

                  {!isCompleted && lecture.currentTime > 0 && (
                    <span>
                      • {formatTime(lecture.currentTime)} watched ({watchedProgress}%)
                    </span>
                  )}

                  {!isCompleted && lecture.remainingTime > 0 && (
                    <span style={{ color: 'var(--accent-primary)' }}>
                      • {formatDuration(lecture.remainingTime)} left
                    </span>
                  )}

                  {isCompleted && (
                    <span style={{ color: 'var(--accent-primary)', fontWeight: '600' }}>
                      <i className="fas fa-check-circle" style={{ marginRight: '4px' }}></i> Completed
                    </span>
                  )}
                </div>
              </div>

              {/* Play Action Button */}
              <div className="lecture-actions">
                <button
                  className="play-btn-circle"
                  onClick={() => onPlayLecture(lecture)}
                  title="Play Lecture"
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
