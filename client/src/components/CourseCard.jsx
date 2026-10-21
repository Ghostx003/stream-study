import React from 'react';
import { formatDuration } from '../utils/formatters';

export default function CourseCard({ folder, onClick }) {
  const {
    name,
    videoCount = 0,
    subfoldersCount = 0,
    totalDuration = 0,
    completedCount = 0,
    remainingDuration = 0,
    completionPercentage = 0
  } = folder;

  const isFullyCompleted = videoCount > 0 && completedCount === videoCount;

  return (
    <div className={`course-card ${isFullyCompleted ? 'completed-card' : ''}`} onClick={onClick}>
      <div className="course-card-top">
        <div className="course-card-icon-wrapper">
          <i className={`fas fa-${subfoldersCount > 0 ? 'folder-tree' : 'film'}`}></i>
        </div>
        <div className="course-card-badges">
          {videoCount > 0 && (
            <span className="card-badge count-badge">
              <i className="fas fa-play"></i> {videoCount} {videoCount === 1 ? 'ep' : 'eps'}
            </span>
          )}
          {subfoldersCount > 0 && (
            <span className="card-badge folder-badge">
              {subfoldersCount} {subfoldersCount === 1 ? 'folder' : 'folders'}
            </span>
          )}
        </div>
      </div>

      <div className="course-card-body">
        <h3 className="course-card-title">{name}</h3>
        <div className="course-card-meta-row">
          <span>{formatDuration(totalDuration)}</span>
          {remainingDuration > 0 && completedCount > 0 && (
            <span className="card-left-time">{formatDuration(remainingDuration)} left</span>
          )}
          {isFullyCompleted && (
            <span className="card-completed-tag"><i className="fas fa-check-circle"></i> Done</span>
          )}
        </div>
      </div>

      {/* Progress Bar (Netflix Red) */}
      <div className="course-card-progress">
        <div className="card-progress-track">
          <div
            className="card-progress-fill"
            style={{ width: `${completionPercentage}%` }}
          />
        </div>
        <div className="card-progress-text">
          <span>{completedCount}/{videoCount} watched</span>
          <span>{completionPercentage}%</span>
        </div>
      </div>
    </div>
  );
}
