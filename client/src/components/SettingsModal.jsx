import React, { useState } from 'react';
import { api } from '../utils/api';

export default function SettingsModal({
  isOpen,
  onClose,
  roots = [],
  activeRoot,
  networkInfo,
  onRootChanged,
  showToast
}) {
  const [newPath, setNewPath] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleBrowseNative = async () => {
    setIsBrowsing(true);
    setErrorMsg('');
    try {
      const res = await api.pickFolderDialog();
      if (!res.cancelled && res.path) {
        setNewPath(res.path);
      }
    } catch (e) {
      setErrorMsg('Could not open folder picker dialog');
    } finally {
      setIsBrowsing(false);
    }
  };

  const handleAddRoot = async (e) => {
    e.preventDefault();
    if (!newPath.trim()) return;
    setIsAdding(true);
    setErrorMsg('');
    try {
      const res = await api.addRoot(newPath.trim(), newLabel.trim() || null);
      if (res.success) {
        setNewPath('');
        setNewLabel('');
        showToast?.('Folder added successfully!');
        onRootChanged?.();
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to add folder');
    } finally {
      setIsAdding(false);
    }
  };

  const handleSelectRoot = async (rootId) => {
    try {
      await api.selectRoot(rootId);
      showToast?.('Switched active media folder');
      onRootChanged?.();
      onClose();
    } catch (err) {
      showToast?.(err.message || 'Failed to select folder', true);
    }
  };

  const handleRemoveRoot = async (rootId, e) => {
    e.stopPropagation();
    if (window.confirm('Remove this folder from Courseflix LAN? (Video files on disk will not be deleted)')) {
      try {
        await api.removeRoot(rootId);
        showToast?.('Folder removed from library');
        onRootChanged?.();
      } catch (err) {
        showToast?.(err.message || 'Failed to remove folder', true);
      }
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <i className="fas fa-cog" style={{ color: 'var(--accent-primary)' }}></i>
            Library & Network Settings
          </div>
          <button className="btn-icon" onClick={onClose} title="Close">&times;</button>
        </div>

        <div className="modal-body">
          {/* Registered media folders */}
          <div>
            <h4 style={{ fontSize: '0.95rem', marginBottom: '10px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="fas fa-folder"></i> Configured Media Folders
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {roots.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No folders added yet.</div>
              ) : (
                roots.map((r) => {
                  const isActive = activeRoot && activeRoot.id === r.id;
                  return (
                    <div
                      key={r.id}
                      className={`course-card ${isActive ? 'active-root' : ''}`}
                      onClick={() => !isActive && handleSelectRoot(r.id)}
                      style={{
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: isActive ? 'default' : 'pointer',
                        border: isActive ? '1px solid var(--accent-primary)' : '1px solid var(--border-primary)',
                        borderRadius: 'var(--radius-sm)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        <i
                          className={`fas ${isActive ? 'fa-folder-open' : 'fa-folder'}`}
                          style={{ color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                        ></i>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {r.label}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {r.path}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        {isActive ? (
                          <span className="badge" style={{ background: 'var(--accent-primary)', color: '#000', fontSize: '0.7rem' }}>
                            Active
                          </span>
                        ) : (
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                            onClick={() => handleSelectRoot(r.id)}
                          >
                            Switch
                          </button>
                        )}
                        <button
                          className="btn-icon"
                          style={{ color: 'var(--accent-danger)', padding: '4px' }}
                          title="Remove folder"
                          onClick={(e) => handleRemoveRoot(r.id, e)}
                        >
                          <i className="fas fa-trash-alt"></i>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Add new folder form */}
          <div style={{ paddingTop: '12px', borderTop: '1px solid var(--border-primary)' }}>
            <h4 style={{ fontSize: '0.95rem', marginBottom: '10px', color: 'var(--text-primary)' }}>
              Add Another Media Folder
            </h4>

            {errorMsg && (
              <div style={{ color: 'var(--accent-danger)', fontSize: '0.85rem', marginBottom: '8px' }}>
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleAddRoot} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="form-input"
                  style={{ flex: 1 }}
                  placeholder="Absolute folder path on host computer"
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleBrowseNative}
                  disabled={isBrowsing}
                  title="Browse"
                >
                  <i className="fas fa-desktop"></i>
                </button>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="form-input"
                  style={{ flex: 1 }}
                  placeholder="Display label (Optional)"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isAdding || !newPath.trim()}
                >
                  <i className="fas fa-plus"></i> Add
                </button>
              </div>
            </form>
          </div>

          {/* Local Wi-Fi Network details */}
          <div style={{ paddingTop: '12px', borderTop: '1px solid var(--border-primary)', fontSize: '0.85rem' }}>
            <h4 style={{ fontSize: '0.95rem', marginBottom: '8px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="fas fa-wifi" style={{ color: 'var(--accent-blue)' }}></i> Local Wi-Fi Access
            </h4>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Access Courseflix from any device on your same home Wi-Fi:
            </p>
            <div style={{ background: 'var(--bg-primary)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)', fontFamily: 'monospace', color: 'var(--accent-primary)', fontWeight: '700' }}>
              {networkInfo?.lanUrl}
            </div>
            {networkInfo?.allLanIps && networkInfo.allLanIps.length > 1 && (
              <div style={{ marginTop: '6px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Additional LAN interfaces: {networkInfo.allLanIps.slice(1).map(ip => `http://${ip}:${networkInfo.port}`).join(', ')}
              </div>
            )}
          </div>

          {/* Tailscale Remote 24/7 Streaming */}
          <div style={{ paddingTop: '12px', borderTop: '1px solid var(--border-primary)', fontSize: '0.85rem' }}>
            <h4 style={{ fontSize: '0.95rem', marginBottom: '8px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="fas fa-globe" style={{ color: '#22c55e' }}></i> Tailscale Remote Streaming (100km Away)
            </h4>

            {networkInfo?.tailscaleUrl ? (
              <div>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Tailscale is <strong>active</strong>! Open this link on your phone/tablet from any cellular 4G/5G or external Wi-Fi:
                </p>
                <div style={{ background: 'var(--bg-primary)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(34, 197, 94, 0.4)', fontFamily: 'monospace', color: '#86efac', fontWeight: '700', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{networkInfo.tailscaleUrl}</span>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '3px 8px', fontSize: '0.75rem' }}
                    onClick={() => {
                      navigator.clipboard.writeText(networkInfo.tailscaleUrl);
                      showToast?.('Copied Tailscale URL!');
                    }}
                  >
                    <i className="fas fa-copy"></i> Copy
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)' }}>
                <p style={{ color: 'var(--text-secondary)', margin: '0 0 6px 0', lineHeight: '1.4' }}>
                  Tailscale is not running yet. To stream remotely from 100km away without router setup:
                </p>
                <ol style={{ margin: '0 0 0 16px', padding: 0, color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: '1.5' }}>
                  <li>Install <strong>Tailscale</strong> on this PC and on your phone (free).</li>
                  <li>Sign in with the same Google or Microsoft account on both.</li>
                  <li>Open Courseflix using your PC's Tailscale IP from anywhere in the world!</li>
                </ol>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
