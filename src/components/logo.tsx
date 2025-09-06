import * as React from 'react';

export const Logo = ({ className }: { className?: string }) => (
  <svg
    width="100%"
    height="100%"
    viewBox="0 0 100 100"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <defs>
      <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: '#2895B6', stopOpacity: 1 }} />
        <stop offset="100%" style={{ stopColor: '#4ED3F3', stopOpacity: 1 }} />
      </linearGradient>
    </defs>
    <path
      fill="url(#logoGradient)"
      d="M99.2,49.6C99.2,76.8,77.1,99,49.8,99C35.9,99,23.5,92.5,15.2,82.6C16.8,82.4,18,81.1,18,79.5c0-1.5-1.1-2.8-2.6-3c0.1-0.2,0.2-0.3,0.3-0.5c1.4-2.2,2.2-4.8,2.2-7.5c0-8.3-6.8-15-15.2-15c-1.3,0-2.6,0.2-3.8,0.5C0.3,47.8,0,41.9,0,35.8C0,16,19.3,0,43.1,0C70.3,0,92.5,22.2,92.5,49.4c0,0.1,0,0.1,0,0.2c0.2,0,0.3,0,0.5,0C96.1,49.6,99.2,49.6,99.2,49.6z"
    />
    <circle fill="url(#logoGradient)" cx="26.5" cy="22.9" r="10.8" />
    <circle fill="#FFFFFF" cx="72" cy="35" r="5" />
  </svg>
);
