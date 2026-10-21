import React from 'react';

export default function Navbar({
  networkInfo,
  activeRoot,
  onOpenSettings,
  onGoHome,
  showToast
}) {
  const lanUrl = networkInfo?.lanUrl || '';

  const copyLanUrl = (e) => {
    e.stopPropagation();
    if (lanUrl) {
      navigator.clipboard.writeText(lanUrl);
      showToast?.(`Copied LAN URL: ${lanUrl}`);
    }
  };

  return (
    <nav className="navbar">
      <div className="nav-brand" onClick={onGoHome}>
        <div className="nav-logo-icon">
          <i className="fas fa-play"></i>
        </div>
        <div className="nav-title">
          Course<span>flix</span> <span style={{ fontSize: '0.8rem', color: 'var(--accent-blue)', border: '1px solid var(--accent-blue)', padding: '2px 6px', borderRadius: '4px', verticalAlign: 'middle', fontWeight: '700' }}>LAN</span>
        </div>
      </div>

      <div className="nav-actions">
        {/* LAN Address Pill with Copy */}
        {lanUrl && (
          <div
            className="nav-lan-badge"
            onClick={copyLanUrl}
            title="Click to copy LAN address to open on your phone or other device"
          >
            <div className="lan-dot"></div>
            <span>LAN: {networkInfo?.primaryLanIp}:{networkInfo?.port}</span>
            <i className="fas fa-copy" style={{ fontSize: '0.75rem', opacity: 0.7 }}></i>
          </div>
        )}

        {/* Media Root Indicator & Settings */}
        <button
          className="btn btn-secondary"
          onClick={onOpenSettings}
          title="Folder Settings & Roots"
          style={{ padding: '6px 12px', fontSize: '0.85rem' }}
        >
          <i className="fas fa-folder-open" style={{ color: 'var(--accent-primary)' }}></i>
          <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeRoot ? activeRoot.label : 'Select Folder'}
          </span>
          <i className="fas fa-cog" style={{ fontSize: '0.75rem', opacity: 0.7, marginLeft: '4px' }}></i>
        </button>
      </div>
    </nav>
  );
}
