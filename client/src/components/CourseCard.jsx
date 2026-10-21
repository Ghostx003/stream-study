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

  return (
    <div className="course-card" onClick={onClick}>
      <div>
        <div className="course-card-header">
          <div className="course-card-icon">
            <i className="fas fa-folder"></i>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="course-card-title">{name}</div>
          </div>
        </div>

        <div className="course-card-counts">
          <span><i className="fas fa-play-circle" style={{ marginRight: '4px', color: 'var(--accent-primary)' }}></i>{videoCount} {videoCount === 1 ? 'lecture' : 'lectures'}</span>
          {subfoldersCount > 0 && (
            <span><i className="fas fa-folder-tree" style={{ marginRight: '4px', color: 'var(--accent-blue)' }}></i>{subfoldersCount} {subfoldersCount === 1 ? 'subfolder' : 'subfolders'}</span>
          )}
        </div>
      </div>

      <div className="course-card-footer">
        <div className="progress-bar-container">
          <div
            className="progress-bar-fill"
            style={{ width: `${completionPercentage}%` }}
          />
        </div>

        <div className="course-card-durations">
          <span>Completed: <strong>{completedCount}/{videoCount}</strong></span>
          <span>{completionPercentage}%</span>
        </div>

        <div className="course-card-durations" style={{ color: 'var(--text-muted)' }}>
          <span>Total: {formatDuration(totalDuration)}</span>
          <span style={{ color: 'var(--accent-primary)', fontWeight: '600' }}>
            {remainingDuration > 0 ? `${formatDuration(remainingDuration)} left` : 'Completed'}
          </span>
        </div>
      </div>
    </div>
  );
}
