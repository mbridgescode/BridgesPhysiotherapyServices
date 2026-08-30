import React from 'react';

const SectionNav = ({ items, label = 'On this page' }) => {
  if (!items?.length) {
    return null;
  }

  return (
    <nav className="app-section-nav" aria-label={label}>
      <span className="app-section-nav__label">{label}</span>
      <div className="app-section-nav__links">
        {items.map((item) => (
          <a key={item.id} href={`#${item.id}`}>
            {item.label}
          </a>
        ))}
      </div>
    </nav>
  );
};

export default SectionNav;
