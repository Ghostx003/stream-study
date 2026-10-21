import React from 'react';
import CourseCard from './CourseCard';

export default function CourseGrid({ folders = [], onSelectFolder, title = 'Subjects & Modules' }) {
  if (!folders || folders.length === 0) return null;

  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <div className="course-grid-section-title">
        <i className="fas fa-layer-group" style={{ color: 'var(--accent-primary)' }}></i>
        {title}
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>
          ({folders.length})
        </span>
      </div>

      <div className="course-grid">
        {folders.map((folder) => (
          <CourseCard
            key={folder.relativePath}
            folder={folder}
            onClick={() => onSelectFolder(folder.relativePath)}
          />
        ))}
      </div>
    </div>
  );
}
