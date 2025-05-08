import React, { useEffect, useRef, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import VideoPlayer from '../components/VideoPlayer';
import './app.module.css';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<VideoPlayer />} />
    </Routes>
  );
}

export default App;
