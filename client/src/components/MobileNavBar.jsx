import React from 'react';

export default function MobileNavBar({
  activeTab,
  onTabChange,
  networkInfo,
  onOpenSettings,
  onGoHome,
  showToast
}) {
  const tailscaleUrl = networkInfo?.tailscaleUrl;
  const isTailscaleActive = !!tailscaleUrl;

  const handleCopyRemote = (e) => {
    e.stopPropagation();
    if (tailscaleUrl) {
      navigator.clipboard.writeText(tailscaleUrl);
      showToast?.(`Copied Remote URL: ${tailscaleUrl}`);
    } else {
      showToast?.('Tailscale is offline. Open Tailscale app on laptop.');
    }
  };

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

      {/* 2. Folders / Library */}
      <button
        className={`mobile-nav-item ${activeTab === 'folders' ? 'active' : ''}`}
        onClick={() => {
          onTabChange?.('folders');
        }}
      >
        <div className="mobile-nav-icon">
          <i className="fas fa-folder-tree"></i>
        </div>
        <span>Browse</span>
      </button>

      {/* 3. Tailscale Remote Link */}
      <button
        className={`mobile-nav-item ${isTailscaleActive ? 'remote-active' : ''}`}
        onClick={handleCopyRemote}
      >
        <div className="mobile-nav-icon relative">
          <i className="fas fa-globe"></i>
          <span className={`status-dot ${isTailscaleActive ? 'online' : 'offline'}`} />
        </div>
        <span>{isTailscaleActive ? 'Remote TS' : 'Remote'}</span>
      </button>

      {/* 4. Settings */}
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
