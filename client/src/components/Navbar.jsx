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
        {/* Media Root Indicator & Switcher Button */}
        <button
          className="nav-folder-btn"
          onClick={onOpenSettings}
          title="Switch Media Folder or Library"
        >
          <span className="folder-pulse-dot"></span>
          <i className="fas fa-folder-open folder-icon"></i>
          <span className="nav-folder-label">
            {activeRoot ? activeRoot.label : 'Select Folder'}
          </span>
          <i className="fas fa-chevron-down folder-caret"></i>
        </button>
      </div>
    </nav>
  );
}
