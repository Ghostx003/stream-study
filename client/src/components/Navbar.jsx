import React from 'react';

export default function Navbar({
  networkInfo,
  activeRoot,
  onOpenSettings,
  onGoHome,
  showToast
}) {
  const lanUrl = networkInfo?.lanUrl || '';
  const tailscaleUrl = networkInfo?.tailscaleUrl || '';

  const copyLanUrl = (e) => {
    e.stopPropagation();
    if (lanUrl) {
      navigator.clipboard.writeText(lanUrl);
      showToast?.(`Copied Home Wi-Fi URL: ${lanUrl}`);
    }
  };

  const copyTailscaleUrl = (e) => {
    e.stopPropagation();
    if (tailscaleUrl) {
      navigator.clipboard.writeText(tailscaleUrl);
      showToast?.(`Copied Tailscale URL: ${tailscaleUrl}`);
    }
  };

  return (
    <nav className="navbar">
      <div className="nav-brand" onClick={onGoHome}>
        <div className="nav-logo-icon">
          <i className="fas fa-play"></i>
        </div>
        <div className="nav-title">
          Course<span>flix</span> <span className="nav-tag">LAN</span>
        </div>
      </div>

      <div className="nav-actions">
        {/* Tailscale Remote Access Pill */}
        {tailscaleUrl ? (
          <div
            className="nav-lan-badge tailscale-badge"
            onClick={copyTailscaleUrl}
            title="Click to copy Tailscale Remote URL (Stream from 100km away)"
          >
            <div className="lan-dot online"></div>
            <span className="badge-text-full">TS: {networkInfo?.tailscaleIp}:{networkInfo?.port}</span>
            <span className="badge-text-compact">TS 100km</span>
            <i className="fas fa-copy badge-copy-icon"></i>
          </div>
        ) : (
          <div
            className="nav-lan-badge tailscale-badge offline"
            onClick={onOpenSettings}
            title="Tailscale is offline. Tap to configure remote streaming."
          >
            <div className="lan-dot offline"></div>
            <span className="badge-text-full">TS: Offline</span>
            <span className="badge-text-compact">TS Off</span>
          </div>
        )}

        {/* Home Wi-Fi LAN Pill (Hidden on narrow mobile screens) */}
        {lanUrl && (
          <div
            className="nav-lan-badge lan-wifi-badge"
            onClick={copyLanUrl}
            title="Click to copy Home Wi-Fi LAN address"
          >
            <div className="lan-dot"></div>
            <span>LAN: {networkInfo?.primaryLanIp}:{networkInfo?.port}</span>
            <i className="fas fa-copy"></i>
          </div>
        )}

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
