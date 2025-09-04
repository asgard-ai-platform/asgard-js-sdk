import { useState, FormEvent, ChangeEvent } from 'react';
import clsx from 'clsx';
import { useAsgardThemeContext } from '../../../context/asgard-theme-context';
import { useAsgardContext } from '../../../context/asgard-service-context';
import { ProfileIcon } from '../profile-icon';
import EyeSvg from '../../../icons/eye.svg?react';
import EyeOffSvg from '../../../icons/eye-off.svg?react';
import styles from './api-key-input.module.scss';

export interface ApiKeyInputProps {
  onSubmit: (apiKey: string) => void | Promise<void>;
  loading?: boolean;
  error?: string;
  placeholder?: string;
  title?: string;
  showToggle?: boolean;
  className?: string;
}

export function ApiKeyInput({
  onSubmit,
  loading = false,
  error,
  placeholder = 'Enter your key',
  title = 'Preview',
  showToggle = true,
  className,
}: ApiKeyInputProps): JSX.Element {
  const [apiKey, setApiKey] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { chatbot } = useAsgardThemeContext();
  const { avatar } = useAsgardContext();

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();
    if (apiKey.trim() && !loading) {
      onSubmit(apiKey.trim());
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setApiKey(e.target.value);
  };

  const togglePasswordVisibility = (): void => {
    setShowPassword(!showPassword);
  };

  return (
    <div 
      className={clsx(styles.api_key_input, className)}
      style={{
        backgroundColor: chatbot.backgroundColor,
        borderColor: chatbot.borderColor,
      }}
    >
      <div className={styles.api_key_input__header}>
        <ProfileIcon avatar={avatar} />
        <h2 className={styles.api_key_input__title} style={chatbot?.header?.title?.style}>{title}</h2>
      </div>

      <form onSubmit={handleSubmit} className={styles.api_key_input__form}>
        <div>
          <label className={styles.api_key_input__label}>Key</label>
          <div className={styles.api_key_input__input_wrapper}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={apiKey}
              onChange={handleInputChange}
              placeholder={placeholder}
              className={clsx(styles.api_key_input__input, {
                [styles['api_key_input__input--error']]: error,
                [styles['api_key_input__input--disabled']]: loading,
              })}
              disabled={loading}
              autoComplete="off"
            />
            {showToggle && (
              <button
                type="button"
                onClick={togglePasswordVisibility}
                className={styles.api_key_input__toggle_button}
                disabled={loading}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOffSvg className={styles.api_key_input__toggle_icon} />
                ) : (
                  <EyeSvg className={styles.api_key_input__toggle_icon} />
                )}
              </button>
            )}
          </div>
          {error && <div className={styles.api_key_input__error_message}>{error}</div>}
        </div>

        <button
          type="submit"
          disabled={!apiKey.trim() || loading}
          className={styles.api_key_input__submit_button}
          style={{
            backgroundColor: chatbot?.mainColor,
            color: chatbot?.secondaryColor,
          }}
        >
          {loading ? 'Loading...' : 'Continue'}
        </button>
      </form>
    </div>
  );
}
