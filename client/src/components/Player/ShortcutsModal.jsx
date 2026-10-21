import React from 'react';

export default function ShortcutsModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 99999 }}>
      <div 
        className="modal-container" 
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '750px', width: '92%' }}
      >
        <div className="modal-header">
          <div className="modal-title">
            <i className="fas fa-keyboard" style={{ color: 'var(--accent-primary)' }}></i>
            Lecture Player Keyboard Shortcuts
          </div>
          <button className="btn-icon" onClick={onClose} title="Close">&times;</button>
        </div>

        <div className="modal-body" style={{ gap: '1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
            
            {/* Playback & Seeking */}
            <div style={{ background: 'var(--bg-card)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)' }}>
              <h4 style={{ color: 'var(--accent-blue)', marginBottom: '10px', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className="fas fa-play-circle"></i> Playback & Seeking
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Play / Pause</span>
                  <kbd style={kbdStyle}>Space</kbd>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Seek -10s / +10s</span>
                  <div style={{ display: 'flex', gap: '4px' }}><kbd style={kbdStyle}>&larr;</kbd><kbd style={kbdStyle}>&rarr;</kbd></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Mouse Wheel Seek</span>
                  <div style={{ display: 'flex', gap: '4px' }}><kbd style={kbdStyle}>Scroll &uarr;</kbd> / <kbd style={kbdStyle}>&darr;</kbd></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Seek -30s / +30s</span>
                  <div style={{ display: 'flex', gap: '4px' }}><kbd style={kbdStyle}>Ctrl</kbd> + <kbd style={kbdStyle}>&rarr;</kbd></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Next / Prev Lecture</span>
                  <div style={{ display: 'flex', gap: '4px' }}><kbd style={kbdStyle}>N</kbd> / <kbd style={kbdStyle}>P</kbd></div>
                </div>
              </div>
            </div>

            {/* Speed & Audio */}
            <div style={{ background: 'var(--bg-card)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)' }}>
              <h4 style={{ color: 'var(--accent-primary)', marginBottom: '10px', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className="fas fa-sliders-h"></i> Speed & Audio
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Speed +/- 0.1x</span>
                  <div style={{ display: 'flex', gap: '4px' }}><kbd style={kbdStyle}>C</kbd> / <kbd style={kbdStyle}>X</kbd></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Speed Presets</span>
                  <div style={{ display: 'flex', gap: '4px' }}><kbd style={kbdStyle}>[</kbd> / <kbd style={kbdStyle}>]</kbd></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Volume +/-</span>
                  <div style={{ display: 'flex', gap: '4px' }}><kbd style={kbdStyle}>&uarr;</kbd> / <kbd style={kbdStyle}>&darr;</kbd></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Mute / Unmute</span>
                  <kbd style={kbdStyle}>M</kbd>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Cycle Subtitles</span>
                  <div style={{ display: 'flex', gap: '4px' }}><kbd style={kbdStyle}>S</kbd> / <kbd style={kbdStyle}>V</kbd></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Cycle Audio / Language</span>
                  <kbd style={kbdStyle}>L</kbd>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Brown Noise Background</span>
                  <kbd style={kbdStyle}>B</kbd>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Brown Noise Vol +/-</span>
                  <div style={{ display: 'flex', gap: '4px' }}><kbd style={kbdStyle}>PgUp</kbd> / <kbd style={kbdStyle}>PgDn</kbd></div>
                </div>
              </div>
            </div>

            {/* Bookmarks & Gestures */}
            <div style={{ background: 'var(--bg-card)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)' }}>
              <h4 style={{ color: 'var(--accent-amber)', marginBottom: '10px', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className="fas fa-bookmark"></i> Bookmarks & Gestures
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Add Bookmark</span>
                  <kbd style={kbdStyle}>Z</kbd>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Cycle Bookmarks</span>
                  <div style={{ display: 'flex', gap: '4px' }}><kbd style={kbdStyle}>Ctrl</kbd> + <kbd style={kbdStyle}>Z</kbd></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Return to Timeline</span>
                  <div style={{ display: 'flex', gap: '4px' }}><kbd style={kbdStyle}>Ctrl</kbd> + <kbd style={kbdStyle}>P</kbd></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Double-click / Tap Video</span>
                  <span style={{ color: 'var(--text-muted)' }}>-10s (Left) / +10s (Right)</span>
                </div>
              </div>
            </div>

            {/* View & Display */}
            <div style={{ background: 'var(--bg-card)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)' }}>
              <h4 style={{ color: 'var(--accent-purple)', marginBottom: '10px', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className="fas fa-desktop"></i> View & Controls
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Fullscreen</span>
                  <kbd style={kbdStyle}>F</kbd>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Toggle Shortcuts Help</span>
                  <kbd style={kbdStyle}>/</kbd>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Exit / Back</span>
                  <kbd style={kbdStyle}>Esc</kbd>
                </div>
              </div>
            </div>

          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

const kbdStyle = {
  background: 'var(--bg-tertiary)',
  border: '1px solid var(--border-secondary)',
  padding: '2px 7px',
  borderRadius: '4px',
  fontSize: '0.78rem',
  fontWeight: '700',
  color: 'var(--text-primary)'
};
