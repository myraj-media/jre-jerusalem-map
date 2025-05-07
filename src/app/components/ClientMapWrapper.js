'use client';

import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';

// Use dynamic import for Map component to avoid SSR issues
const MapWithNoSSR = dynamic(() => import('./Map'), {
  ssr: false,
});

// Loading fallback component with same styling as Map's loading state
const LoadingFallback = () => (
  <div style={{ position: 'relative', width: '100%', height: '100%' }}>
    <div className="loadingContainer">
      <div className="loadingSpinner"></div>
      <div className="loadingText">Loading map...</div>
    </div>
  </div>
);

const ClientMapWrapper = () => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <MapWithNoSSR />
    </Suspense>
  );
};

export default ClientMapWrapper; 