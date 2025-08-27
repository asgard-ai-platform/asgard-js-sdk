import { useState, FormEvent, ChangeEvent } from 'react';
import clsx from 'clsx';
import ProfileSvg from '../../../icons/profile.svg?react';
import styles from './api-key-input.module.scss';

export interface ApiKeyInputProps {
  onSubmit: (apiKey: string) => void;
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
}: ApiKeyInputProps) {
  const [apiKey, setApiKey] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (apiKey.trim() && !loading) {
      onSubmit(apiKey.trim());
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setApiKey(e.target.value);
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <div className={clsx(styles.container, className)}>
      <div className={styles.header}>
        <ProfileSvg className={styles.icon} />
        <h2 className={styles.title}>{title}</h2>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.inputGroup}>
          <label className={styles.label}>Key</label>
          <div className={styles.inputWrapper}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={apiKey}
              onChange={handleInputChange}
              placeholder={placeholder}
              className={clsx(styles.input, {
                [styles.error]: error,
                [styles.disabled]: loading,
              })}
              disabled={loading}
              autoComplete="off"
            />
            {showToggle && (
              <button
                type="button"
                onClick={togglePasswordVisibility}
                className={styles.toggleButton}
                disabled={loading}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <svg
                  className={styles.toggleIcon}
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {showPassword ? (
                    <>
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </>
                  ) : (
                    <>
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </>
                  )}
                </svg>
              </button>
            )}
          </div>
          {error && (
            <div className={styles.errorMessage}>
              {error}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={!apiKey.trim() || loading}
          className={clsx(styles.submitButton, {
            [styles.loading]: loading,
          })}
        >
          {loading ? 'Loading...' : 'Continue'}
        </button>
      </form>
    </div>
  );
}
