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
                      onClick={() => handleSelectRoot(r.id)}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-md)',
                        background: isActive ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-tertiary)',
                        border: `1px solid ${isActive ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: '700', fontSize: '0.92rem', color: isActive ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                          {r.label} {isActive && <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--accent-primary)' }}>(Active)</span>}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.path}
                        </div>
                      </div>

                      <button
                        className="btn-icon"
                        onClick={(e) => handleRemoveRoot(r.id, e)}
                        title="Remove Folder"
                        style={{ color: 'var(--accent-danger)', width: '30px', height: '30px', marginLeft: '10px' }}
                      >
                        <i className="fas fa-trash"></i>
                      </button>
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

          {/* Network details */}
          <div style={{ paddingTop: '12px', borderTop: '1px solid var(--border-primary)', fontSize: '0.85rem' }}>
            <h4 style={{ fontSize: '0.95rem', marginBottom: '8px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="fas fa-network-wired" style={{ color: 'var(--accent-blue)' }}></i> Local Network Access
            </h4>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Access Courseflix LAN from any device on your Wi-Fi:
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
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
