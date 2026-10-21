import React from 'react';

export default function Breadcrumbs({ breadcrumbs = [], onNavigate }) {
  if (!breadcrumbs || breadcrumbs.length <= 1) return null;

  return (
    <div className="breadcrumbs-bar">
      {breadcrumbs.map((crumb, idx) => {
        const isLast = idx === breadcrumbs.length - 1;
        return (
          <React.Fragment key={crumb.path || 'root'}>
            <div
              className={`breadcrumb-item ${isLast ? 'active' : ''}`}
              onClick={() => !isLast && onNavigate(crumb.path)}
            >
              {idx === 0 && <i className="fas fa-home" style={{ fontSize: '0.85rem' }}></i>}
              <span>{crumb.name}</span>
            </div>
            {!isLast && <i className="fas fa-chevron-right breadcrumb-sep"></i>}
          </React.Fragment>
        );
      })}
    </div>
  );
}
