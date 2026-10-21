import React from 'react';

export default function MobileNavBar({
  activeTab,
  onTabChange,
  networkInfo,
  onOpenSettings,
  onGoHome,
  showToast
}) {
  return (
    <nav className="mobile-bottom-nav">
      {/* 1. Home / All Courses */}
      <button
        className={`mobile-nav-item ${activeTab === 'home' ? 'active' : ''}`}
        onClick={() => {
          onGoHome?.();
          onTabChange?.('home');
        }}
      >
        <div className="mobile-nav-icon">
          <i className="fas fa-home"></i>
        </div>
        <span>Home</span>
      </button>

      {/* 2. Settings */}
      <button
        className={`mobile-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
        onClick={() => {
          onOpenSettings?.();
          onTabChange?.('settings');
        }}
      >
        <div className="mobile-nav-icon">
          <i className="fas fa-cog"></i>
        </div>
        <span>Settings</span>
      </button>
    </nav>
  );
}
