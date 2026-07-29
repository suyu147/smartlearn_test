'use client';

import { createContext, useContext } from 'react';

interface MediaStageContextValue {
  isCurrentSlide: boolean;
  isPlaying: boolean;
}

const MediaStageContext = createContext<MediaStageContextValue>({
  isCurrentSlide: true,
  isPlaying: false,
});

export function MediaStageProvider({
  children,
  isCurrentSlide = true,
  isPlaying = false,
}: {
  children: React.ReactNode;
  isCurrentSlide?: boolean;
  isPlaying?: boolean;
}) {
  return (
    <MediaStageContext.Provider value={{ isCurrentSlide, isPlaying }}>
      {children}
    </MediaStageContext.Provider>
  );
}

export function useMediaStage() {
  return useContext(MediaStageContext);
}
