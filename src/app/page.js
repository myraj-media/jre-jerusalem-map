'use client';

import React from 'react';
import styles from './page.module.css';
import ClientMapWrapper from './components/ClientMapWrapper';

export default function Home() {
  return (
    <main className={styles.main}>
      <div className={styles.mapContainer}>
        <ClientMapWrapper />
      </div>
    </main>
  );
}
