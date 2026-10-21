import React from 'react';

export default function Navbar({
  activeRoot,
  onOpenSettings,
  onGoHome
}) {
  return (
    <nav className="navbar">
      <div className="nav-brand" onClick={onGoHome}>
        <div className="nav-logo-icon">
          <i className="fas fa-play"></i>
        </div>
        <div className="nav-title">
          Course<span>flix</span>
        </div>
      </div>

      <div className="nav-actions">
        {/* Media Root Indicator & Settings */}
        <button
          className="btn btn-secondary nav-folder-btn"
          onClick={onOpenSettings}
          title="Folder Settings & Roots"
        >
          <i className="fas fa-folder-open" style={{ color: 'var(--accent-primary)' }}></i>
          <span className="nav-folder-label">
            {activeRoot ? activeRoot.label : 'Select Folder'}
          </span>
          <i className="fas fa-cog nav-folder-cog"></i>
        </button>
      </div>
    </nav>
  );
}
