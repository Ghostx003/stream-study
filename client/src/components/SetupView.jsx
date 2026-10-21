import React, { useState } from 'react';
import { api } from '../utils/api';

export default function SetupView({ networkInfo, onFolderConfigured, showToast }) {
  const [folderPath, setFolderPath] = useState('');
  const [folderLabel, setFolderLabel] = useState('');
  const [isLoadingDialog, setIsLoadingDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleNativeBrowse = async () => {
    setIsLoadingDialog(true);
    setErrorMsg('');
    try {
      const res = await api.pickFolderDialog();
      if (!res.cancelled && res.path) {
        setFolderPath(res.path);
        showToast?.(`Selected directory: ${res.path}`);
      }
    } catch (err) {
      setErrorMsg('Could not open native folder dialog. You can type or paste the folder path below.');
    } finally {
      setIsLoadingDialog(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!folderPath.trim()) {
      setErrorMsg('Please provide a folder path');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const res = await api.addRoot(folderPath.trim(), folderLabel.trim() || null);
      if (res.success) {
        showToast?.('Media folder registered successfully!');
        onFolderConfigured(res.root);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to register folder. Please verify the path exists on this computer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '680px', margin: '2rem auto', padding: '0 1rem' }}>
      <div style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-lg)',
        padding: '2rem',
        boxShadow: 'var(--shadow-md)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: 'var(--radius-lg)',
            background: 'linear-gradient(135deg, var(--accent-primary), #059669)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: '1.75rem',
            marginBottom: '1rem',
            boxShadow: '0 4px 16px rgba(16, 185, 129, 0.4)'
          }}>
            <i className="fas fa-folder-open"></i>
          </div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.8rem', fontWeight: '800', marginBottom: '0.5rem' }}>
            Select Your Lecture Folder
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Choose the folder on this computer that contains your video lectures. Courseflix LAN will automatically discover all subjects, subfolders, and videos.
          </p>
        </div>

        {errorMsg && (
          <div style={{
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: 'var(--accent-danger)',
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.5rem',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <i className="fas fa-exclamation-triangle"></i>
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Native picker button */}
          <div style={{ textAlign: 'center' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleNativeBrowse}
              disabled={isLoadingDialog}
              style={{ width: '100%', padding: '12px', fontSize: '1rem' }}
            >
              <i className={`fas fa-${isLoadingDialog ? 'spinner fa-spin' : 'desktop'}`}></i>
              {isLoadingDialog ? 'Opening folder dialog on host...' : 'Browse Folder on this Computer'}
            </button>
            <div style={{ margin: '10px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              — or type/paste folder path below —
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Folder Path (Absolute path on host)</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. D:\Lectures or C:\Users\Username\Videos"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Display Label (Optional)</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. My GATE Prep or College Lectures"
              value={folderLabel}
              onChange={(e) => setFolderLabel(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting || !folderPath.trim()}
            style={{ padding: '12px', fontSize: '1rem', marginTop: '0.5rem' }}
          >
            <i className="fas fa-check-circle"></i>
            {isSubmitting ? 'Registering...' : 'Start Streaming This Folder'}
          </button>
        </form>

        {/* Network & Device Access Box */}
        <div style={{
          marginTop: '2rem',
          paddingTop: '1.5rem',
          borderTop: '1px solid var(--border-primary)',
          fontSize: '0.85rem',
          color: 'var(--text-secondary)'
        }}>
          <h4 style={{ color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <i className="fas fa-wifi" style={{ color: 'var(--accent-blue)' }}></i> Streaming to Other Devices
          </h4>
          <p style={{ marginBottom: '8px' }}>
            Connect any phone, tablet, or laptop to the same Wi-Fi and open:
          </p>
          <div style={{
            background: 'var(--bg-primary)',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-primary)',
            fontFamily: 'monospace',
            color: 'var(--accent-primary)',
            fontWeight: '700',
            fontSize: '0.95rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span>{networkInfo?.lanUrl || `http://${networkInfo?.primaryLanIp || '192.168.x.x'}:${networkInfo?.port || 5174}`}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Wi-Fi LAN</span>
          </div>

          <div style={{ marginTop: '12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <i className="fas fa-shield-alt" style={{ marginRight: '5px' }}></i>
            <strong>Firewall tip:</strong> If other devices cannot load the page, ensure Windows Defender Firewall allows Node.js on Private Networks.
          </div>
        </div>
      </div>
    </div>
  );
}
