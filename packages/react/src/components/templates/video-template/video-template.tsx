import { ReactNode, useState, useRef } from 'react';
import { TemplateBox, TemplateBoxContent } from '../template-box';
import { Avatar } from '../avatar';
import styles from './video-template.module.scss';
import { ConversationBotMessage, VideoMessageTemplate } from '@asgard-js/core';
import { useAsgardContext } from '../../../context/asgard-service-context';
import { useAsgardThemeContext } from '../../../context/asgard-theme-context';

interface VideoTemplateProps {
  message: ConversationBotMessage;
}

export function VideoTemplate(props: VideoTemplateProps): ReactNode {
  const { message } = props;
  const template = message.message.template as VideoMessageTemplate;
  const { previewImageUrl, originalContentUrl, duration, text } = template;

  const { template: themeTemplate } = useAsgardThemeContext();

  const { avatar } = useAsgardContext();
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handlePlayClick = () => {
    setIsPlaying(true);
    if (videoRef.current) {
      videoRef.current.play();
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes > 0) {
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `${seconds}s`;
  };

  return (
    <TemplateBox
      className="asgard-video-template"
      type="bot"
      direction="horizontal"
      style={themeTemplate?.VideoMessageTemplate?.style}
    >
      <Avatar avatar={avatar} />
      <TemplateBoxContent
        quickReplies={template.quickReplies}
        time={message.time}
      >
        <div className={styles.video_box}>
          {!isPlaying ? (
            <div className={styles.video_preview} onClick={handlePlayClick}>
              <img src={previewImageUrl} alt="Video preview" />
              <div className={styles.play_button}>
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 48 48"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle cx="24" cy="24" r="24" fill="rgba(0, 0, 0, 0.6)" />
                  <path
                    d="M18 14L18 34L32 24L18 14Z"
                    fill="white"
                  />
                </svg>
              </div>
              {duration && (
                <div className={styles.duration_badge}>
                  {formatDuration(duration)}
                </div>
              )}
            </div>
          ) : (
            <div className={styles.video_player_wrapper}>
              <video
                ref={videoRef}
                className={styles.video_player}
                src={originalContentUrl}
                controls
                autoPlay
                onEnded={() => setIsPlaying(false)}
              />
            </div>
          )}
          {text && <div className={styles.video_text}>{text}</div>}
        </div>
      </TemplateBoxContent>
    </TemplateBox>
  );
}

