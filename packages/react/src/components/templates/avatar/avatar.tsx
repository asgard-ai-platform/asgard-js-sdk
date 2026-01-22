import { memo, ReactNode } from 'react';
import styles from './avatar.module.scss';
import BotSvg from '../../../icons/bot.svg?react';
import clsx from 'clsx';

interface AvatarProps {
  avatar?: string;
  invisible?: boolean;
}

export const Avatar = memo((props: AvatarProps): ReactNode => {
  const { avatar, invisible } = props;

  // Invisible mode: render a placeholder to preserve spacing
  if (invisible) {
    return <div className={clsx('asgard-avatar', styles.bot_avatar, styles['bot_avatar--invisible'])} />;
  }

  if (avatar) {
    return <img src={avatar} alt="Bot Avatar" className={clsx('asgard-avatar', styles.bot_avatar)} />;
  }

  return (
    <div className={clsx('asgard-avatar', styles.bot_avatar)}>
      <BotSvg />
    </div>
  );
});
