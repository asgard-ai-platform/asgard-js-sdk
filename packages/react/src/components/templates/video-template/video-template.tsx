import { ReactNode, useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { TemplateBox, TemplateBoxContent } from '../template-box';
import { Avatar } from '../avatar';
import styles from './video-template.module.scss';
import { ConversationBotMessage, VideoMessageTemplate } from '@asgard-js/core';
import { useAsgardContext } from '../../../context/asgard-service-context';
import { useAsgardThemeContext } from '../../../context/asgard-theme-context';

interface VideoTemplateProps {
  message: ConversationBotMessage;
}

/**
 * Extracts YouTube video ID from various YouTube URL formats
 * Supports:
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtube.com/watch?v=VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://youtube.com/embed/VIDEO_ID
 */
function getYouTubeVideoId(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    // Check if it's a YouTube domain
    if (!hostname.includes('youtube.com') && !hostname.includes('youtu.be')) {
      return null;
    }

    // Handle youtu.be short links
    if (hostname.includes('youtu.be')) {
      const videoId = urlObj.pathname.slice(1); // Remove leading '/'

      return videoId || null;
    }

    // Handle youtube.com/watch?v=VIDEO_ID
    if (urlObj.pathname.includes('/watch')) {
      return urlObj.searchParams.get('v');
    }

    // Handle youtube.com/embed/VIDEO_ID
    if (urlObj.pathname.includes('/embed/')) {
      const match = urlObj.pathname.match(/\/embed\/([^/?]+)/);

      return match ? match[1] : null;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Checks if a URL is a YouTube URL
 */
function isYouTubeUrl(url: string): boolean {
  return getYouTubeVideoId(url) !== null;
}

/**
 * Generates YouTube embed URL from video ID
 */
function getYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
}

export function VideoTemplate(props: VideoTemplateProps): ReactNode {
  const { message } = props;
  const template = message.message.template as VideoMessageTemplate;
  const { previewImageUrl, originalContentUrl, duration } = template;

  const { template: themeTemplate } = useAsgardThemeContext();

  const { avatar, messageBoxBottomRef } = useAsgardContext();
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoBoxRef = useRef<HTMLDivElement>(null);
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [containerHeight, setContainerHeight] = useState<number>(0);

  // Auto scroll to bottom when VIDEO message is rendered to fully display the preview
  useEffect(() => {
    // Delay slightly to ensure image has started loading
    const timer = setTimeout(() => {
      if (messageBoxBottomRef.current) {
        messageBoxBottomRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);

    return (): void => {
      clearTimeout(timer);
    };
  }, [messageBoxBottomRef]);

  // Trigger scroll again when preview image is loaded (ensure image height is calculated)
  const handleImageLoad = (): void => {
    if (messageBoxBottomRef.current) {
      // Slight delay to ensure DOM is updated
      setTimeout(() => {
        messageBoxBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    }
  };

  // Check if it's a YouTube URL and get video ID
  const isYouTube = useMemo(() => isYouTubeUrl(originalContentUrl), [originalContentUrl]);
  const youtubeVideoId = useMemo(() => getYouTubeVideoId(originalContentUrl), [originalContentUrl]);
  const youtubeEmbedUrl = useMemo(() => (youtubeVideoId ? getYouTubeEmbedUrl(youtubeVideoId) : null), [youtubeVideoId]);

  const handlePlayClick = (): void => {
    setIsPlaying(true);
    if (!isYouTube && videoRef.current) {
      videoRef.current.play();
    }
  };

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Get container dimensions for responsive sizing
  useEffect(() => {
    const updateContainerDimensions = (): void => {
      if (videoBoxRef.current) {
        // Find the chatbot body container
        const chatbotBody = videoBoxRef.current.closest('.asgard-chatbot-body');
        if (chatbotBody) {
          setContainerWidth(chatbotBody.clientWidth);
          setContainerHeight(chatbotBody.clientHeight);
        } else {
          // Fallback to viewport dimensions if chatbot body not found
          setContainerWidth(window.innerWidth);
          setContainerHeight(window.innerHeight);
        }
      }
    };

    updateContainerDimensions();
    window.addEventListener('resize', updateContainerDimensions);

    // Also listen for resize events on the chatbot container
    const observer = new ResizeObserver(() => {
      updateContainerDimensions();
    });

    if (videoBoxRef.current) {
      const chatbotBody = videoBoxRef.current.closest('.asgard-chatbot-body');
      if (chatbotBody) {
        observer.observe(chatbotBody);
      }
    }

    return (): void => {
      window.removeEventListener('resize', updateContainerDimensions);
      observer.disconnect();
    };
  }, []);

  // Get video dimensions when video loads (for non-YouTube videos)
  const handleVideoLoadedMetadata = useCallback((): void => {
    if (videoRef.current && !isYouTube) {
      const video = videoRef.current;
      setVideoDimensions({
        width: video.videoWidth,
        height: video.videoHeight,
      });
    }
  }, [isYouTube]);

  // For YouTube, assume 16:9 aspect ratio
  useEffect(() => {
    if (isYouTube) {
      setVideoDimensions({ width: 16, height: 9 });
    }
  }, [isYouTube]);

  // Calculate responsive video dimensions
  const videoStyle = useMemo(() => {
    // Use fallback dimensions if container or video dimensions are not available yet
    const effectiveWidth = containerWidth || window.innerWidth;
    const effectiveHeight = containerHeight || window.innerHeight;

    // Default to 16:9 if video dimensions not available (common for YouTube)
    const defaultDimensions = { width: 16, height: 9 };
    const dimensions = videoDimensions || defaultDimensions;

    const { width: videoWidth, height: videoHeight } = dimensions;
    const aspectRatio = videoWidth / videoHeight;
    const isLandscape = videoWidth > videoHeight;

    if (isLandscape) {
      // Width-based sizing: 70% of container width, height maintains aspect ratio
      const targetWidth = effectiveWidth * 0.76;
      const targetHeight = targetWidth / aspectRatio;

      return {
        width: `${targetWidth}px`,
        height: `${targetHeight}px`,
        maxWidth: '100%',
      };
    } else {
      // Height-based sizing: 70% of container height, width maintains aspect ratio
      const targetHeight = effectiveHeight * 0.7;
      const targetWidth = targetHeight * aspectRatio;

      return {
        width: `${targetWidth}px`,
        height: `${targetHeight}px`,
        maxWidth: '100%',
      };
    }
  }, [containerWidth, containerHeight, videoDimensions]);

  return (
    <TemplateBox
      className="asgard-video-template"
      type="bot"
      direction="horizontal"
      style={themeTemplate?.VideoMessageTemplate?.style}
    >
      <Avatar avatar={avatar} />
      <TemplateBoxContent quickReplies={template.quickReplies} references={template.references} time={message.time}>
        <div ref={videoBoxRef} className={styles.video_box}>
          {!isPlaying ? (
            <div className={styles.video_preview} onClick={handlePlayClick}>
              <img src={previewImageUrl} alt="Video preview" onLoad={handleImageLoad} />
              <div className={styles.play_button}>
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="24" cy="24" r="24" fill="rgba(0, 0, 0, 0.6)" />
                  <path d="M18 14L18 34L32 24L18 14Z" fill="white" />
                </svg>
              </div>
              {duration && <div className={styles.duration_badge}>{formatDuration(duration)}</div>}
            </div>
          ) : (
            <div className={styles.video_player_wrapper} style={videoStyle}>
              {isYouTube && youtubeEmbedUrl ? (
                <iframe
                  className={styles.youtube_player}
                  src={youtubeEmbedUrl}
                  title="YouTube video player"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              ) : (
                <video
                  ref={videoRef}
                  className={styles.video_player}
                  src={originalContentUrl}
                  controls
                  autoPlay
                  onEnded={() => setIsPlaying(false)}
                  onLoadedMetadata={handleVideoLoadedMetadata}
                />
              )}
            </div>
          )}
        </div>
      </TemplateBoxContent>
    </TemplateBox>
  );
}
