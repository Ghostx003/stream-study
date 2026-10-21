import React, { useState, useEffect } from 'react';
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
  const [isAdding, setIsAdding] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Host Directory Explorer state
  const [showExplorer, setShowExplorer] = useState(false);
  const [explorerPath, setExplorerPath] = useState('');
  const [explorerFolders, setExplorerFolders] = useState([]);
  const [explorerParent, setExplorerParent] = useState(null);
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [hostDrives, setHostDrives] = useState([]);

  // Load host drives when modal opens
  useEffect(() => {
    if (isOpen) {
      api.getDrives().then(data => {
        setHostDrives(data.drives || []);
      }).catch(() => {
        // Fallback default Windows drives
        setHostDrives([
          { path: 'C:\\', label: 'Local Disk (C:)' },
          { path: 'D:\\', label: 'Local Disk (D:)' },
          { path: 'E:\\', label: 'Local Disk (E:)' },
          { path: 'F:\\', label: 'Local Disk (F:)' }
        ]);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Open directory explorer at specific path (or drives root if empty)
  const openExplorer = async (path = '') => {
    setShowExplorer(true);
    setExplorerLoading(true);
    setErrorMsg('');
    try {
      const data = await api.browseDirectory(path);
      setExplorerPath(data.currentPath || '');
      setExplorerParent(data.parentPath !== undefined ? data.parentPath : null);
      setExplorerFolders(data.folders || []);
    } catch (err) {
      setErrorMsg(err.message || 'Could not read directory');
    } finally {
      setExplorerLoading(false);
    }
  };

  const handleSelectExplorerFolder = (folder) => {
    if (folder.isDrive) {
      openExplorer(folder.path);
    } else {
      openExplorer(folder.path);
    }
  };

  const handleConfirmExplorerPath = () => {
    if (explorerPath) {
      setNewPath(explorerPath);
      // Auto-suggest label from last folder name
      const clean = explorerPath.replace(/[\\/]+$/, '');
      const folderName = clean.split(/[\\/]/).pop() || clean;
      if (!newLabel) {
        setNewLabel(folderName);
      }
      setShowExplorer(false);
      showToast?.(`Selected: ${folderName}`);
    }
  };

  const handleAddRoot = async (e) => {
    e.preventDefault();
    if (!newPath.trim()) return;
    setIsAdding(true);
    setErrorMsg('');
    try {
      const cleanPath = newPath.trim();
      const defaultLabel = cleanPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || cleanPath;
      const res = await api.addRoot(cleanPath, newLabel.trim() || defaultLabel);
      if (res.success) {
        setNewPath('');
        setNewLabel('');
        setShowExplorer(false);
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
    if (window.confirm('Remove this folder from Courseflix? (Video files on disk will NOT be deleted)')) {
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
      <div className="modal-container settings-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <i className="fas fa-folder-open" style={{ color: 'var(--accent-primary)' }}></i>
            Media Folders & Library
          </div>
          <button className="btn-icon" onClick={onClose} title="Close">&times;</button>
        </div>

        <div className="modal-body">
          {/* Section 1: Configured Media Folders */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h4 style={{ fontSize: '0.95rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <i className="fas fa-layer-group" style={{ color: 'var(--accent-primary)' }}></i>
                Configured Folders ({roots.length})
              </h4>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tap to switch active</span>
            </div>

            <div className="settings-roots-list">
              {roots.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '12px', textAlign: 'center', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)' }}>
                  No media folders configured yet. Add your lectures folder below.
                </div>
              ) : (
                roots.map((r) => {
                  const isActive = activeRoot && activeRoot.id === r.id;
                  return (
                    <div
                      key={r.id}
                      className={`settings-root-item ${isActive ? 'is-active' : ''}`}
                      onClick={() => !isActive && handleSelectRoot(r.id)}
                    >
                      <div className="root-item-info">
                        <div className="root-item-icon">
                          <i className={`fas ${isActive ? 'fa-folder-open' : 'fa-folder'}`}></i>
                        </div>
                        <div className="root-item-text">
                          <div className="root-item-title">{r.label}</div>
                          <div className="root-item-path">{r.path}</div>
                        </div>
                      </div>

                      <div className="root-item-actions">
                        {isActive ? (
                          <span className="badge-active-root">
                            <i className="fas fa-check"></i> Active
                          </span>
                        ) : (
                          <button
                            className="btn-switch-root"
                            onClick={() => handleSelectRoot(r.id)}
                          >
                            Switch
                          </button>
                        )}
                        <button
                          className="btn-delete-root"
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

          {/* Section 2: Add Another Media Folder */}
          <div className="add-root-section">
            <h4 style={{ fontSize: '0.95rem', marginBottom: '8px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fas fa-plus-circle" style={{ color: 'var(--accent-primary)' }}></i>
              Add Another Media Folder
            </h4>

            {errorMsg && (
              <div style={{ color: '#ef4444', fontSize: '0.82rem', marginBottom: '8px', background: 'rgba(239, 68, 68, 0.12)', padding: '6px 10px', borderRadius: '4px' }}>
                {errorMsg}
              </div>
            )}

            {/* Quick Drive Selector Chips */}
            <div className="quick-drives-row">
              <span className="quick-drives-title">Browse Drives:</span>
              {hostDrives.map(d => (
                <button
                  key={d.path}
                  type="button"
                  className="quick-drive-chip"
                  onClick={() => openExplorer(d.path)}
                >
                  <i className="fas fa-hdd"></i> {d.path}
                </button>
              ))}
              <button
                type="button"
                className="quick-drive-chip browse-all-chip"
                onClick={() => openExplorer('')}
              >
                <i className="fas fa-search"></i> All Drives
              </button>
            </div>

            {/* In-App Visual Host Directory Explorer */}
            {showExplorer && (
              <div className="in-app-explorer-container">
                <div className="explorer-header">
                  <div className="explorer-path-bar">
                    <button
                      className="explorer-nav-btn"
                      onClick={() => openExplorer(explorerParent !== null ? explorerParent : '')}
                      title="Go to parent directory"
                    >
                      <i className="fas fa-arrow-up"></i>
                    </button>
                    <span className="explorer-current-path" title={explorerPath || 'Computer Drives'}>
                      {explorerPath || 'Host PC Drives'}
                    </span>
                  </div>
                  <button
                    className="btn-close-explorer"
                    onClick={() => setShowExplorer(false)}
                    title="Close Explorer"
                  >
                    &times;
                  </button>
                </div>

                <div className="explorer-folder-list">
                  {explorerLoading ? (
                    <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                      <i className="fas fa-spinner fa-spin" style={{ marginRight: '6px' }}></i> Loading folders on PC...
                    </div>
                  ) : explorerFolders.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      No subfolders found in this directory.
                    </div>
                  ) : (
                    explorerFolders.map(f => (
                      <div
                        key={f.path}
                        className="explorer-folder-row"
                        onClick={() => handleSelectExplorerFolder(f)}
                      >
                        <i className={`fas ${f.isDrive ? 'fa-hdd' : 'fa-folder'}`} style={{ color: f.isDrive ? '#38bdf8' : '#f59e0b' }}></i>
                        <span className="explorer-folder-name">{f.name}</span>
                        <i className="fas fa-chevron-right explorer-row-chevron"></i>
                      </div>
                    ))
                  )}
                </div>

                {explorerPath && (
                  <div className="explorer-footer">
                    <button
                      type="button"
                      className="btn-confirm-folder"
                      onClick={handleConfirmExplorerPath}
                    >
                      <i className="fas fa-check"></i> Select "{explorerPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || explorerPath}"
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Manual Path Input Form */}
            <form onSubmit={handleAddRoot} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="form-input"
                  style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.88rem' }}
                  placeholder="Absolute folder path on host PC (e.g. F:\GATE LECTURES)"
                  value={newPath}
                  onChange={(e) => {
                    setNewPath(e.target.value);
                    if (!newLabel && e.target.value) {
                      const clean = e.target.value.replace(/[\\/]+$/, '');
                      setNewLabel(clean.split(/[\\/]/).pop() || '');
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => openExplorer(newPath || '')}
                  title="Browse Host PC Folders"
                >
                  <i className="fas fa-folder-open"></i> Browse
                </button>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="form-input"
                  style={{ flex: 1 }}
                  placeholder="Folder display name (e.g. GATE Computer Science)"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isAdding || !newPath.trim()}
                  style={{ minWidth: '90px' }}
                >
                  {isAdding ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-plus"></i> Add</>}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
