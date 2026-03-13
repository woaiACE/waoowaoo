import React from 'react'
import { AbsoluteFill, Sequence, Video } from 'remotion'

export interface RemotionPreviewProps {
  videos: string[]
}

export const RemotionPreview: React.FC<RemotionPreviewProps> = ({ videos }) => {
  // In a real scenario, we would parse video durations.
  // For the skeleton, let's assume each video gets 5 seconds (150 frames at 30fps).
  const clipDurationInFrames = 150

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {videos.map((videoUrl, index) => {
        const startFrame = index * clipDurationInFrames
        return (
          <Sequence
            key={`${videoUrl}-${index}`}
            from={startFrame}
            durationInFrames={clipDurationInFrames}
          >
            <Video src={videoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}
