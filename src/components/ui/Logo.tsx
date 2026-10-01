import React from 'react';

export const Logo: React.FC<{ className?: string }> = ({ className = "h-12" }) => {
  return (
    <img 
      src="/logo.png" 
      alt="BharatEdge Logo" 
      className={`${className} object-contain`} 
    />
  );
};
