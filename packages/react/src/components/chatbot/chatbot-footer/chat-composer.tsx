import {
  ChangeEventHandler,
  ClipboardEventHandler,
  KeyboardEventHandler,
  ReactNode,
  RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import { useAsgardContext } from '../../../context/asgard-service-context';
import { useAsgardTemplateContext } from '../../../context/asgard-template-context';
import { useAsgardThemeContext } from '../../../context/asgard-theme-context';
import { useFileDropContext } from '../../../context/file-drop-context';
import { t } from '../../../i18n';
import PaperclipSvg from '../../../icons/paperclip.svg?react';
import SendSvg from '../../../icons/send.svg?react';
import StopSvg from '../../../icons/stop.svg?react';
import { AttachmentPreview } from './attachment-preview';
import { SpeechInputButton, isSpeechRecognitionSupported } from './speech-input-button';
import { useAttachmentUpload } from './use-attachment-upload';
import styles from './chat-composer.module.scss';

interface ChatComposerProps {
  /** Resolved image-upload flag (prop → annotations), computed by `ChatbotFooter`. */
  enableUpload: boolean;
  /** Resolved document-upload flag (prop → annotations), computed by `ChatbotFooter`. */
  enableDocumentUpload: boolean;
  /** The footer element; its parent is the chatbot container, which caps the textarea's growth. */
  footerRef: RefObject<HTMLDivElement | null>;
  /** Slot rendered inside the pill, below the input row. */
  renderComposerInline?: () => ReactNode;
  /** Extra nodes after the send button (pre-existing API). */
  footerEndActions?: ReactNode[];
}

/**
 * The composer pill (BUILD-028): one rounded container holding the attachment button, the auto-growing
 * textarea, the speech button and the send / stop button, with pending attachments above the input row
 * and a consumer slot below it.
 *
 * Design authority: `references/asgard-chat-kit-prototype/src/ChatInput.tsx` @ `8f05d54`, re-expressed in
 * this repo's SCSS-module + theme-token conventions.
 */
export function ChatComposer({
  enableUpload,
  enableDocumentUpload,
  footerRef,
  renderComposerInline,
  footerEndActions,
}: ChatComposerProps): ReactNode {
  const {
    channel,
    sendMessage,
    isConnecting,
    isResetting,
    stopGeneration,
    canStop,
    isStopping,
    canForceStop,
    inputPlaceholder,
    client,
    customChannelId,
    allowedImageMimeTypes,
    allowedDocumentMimeTypes,
    programmaticScrollToBottom,
    pendingInputValue,
    setPendingInputValue,
    pendingConsent,
    promptSuggestion,
    clearPromptSuggestion,
  } = useAsgardContext();
  const { locale = 'en-US' } = useAsgardTemplateContext();
  const theme = useAsgardThemeContext();
  const { chatbot } = theme;

  const [value, setValue] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [isTextareaFocused, setIsTextareaFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);

  // Preview mode: the service context provides no `sendMessage`.
  const isPreviewMode = !sendMessage;
  const canAttach = enableUpload || enableDocumentUpload;

  const attachments = useAttachmentUpload({
    enableImage: enableUpload,
    enableDocument: enableDocumentUpload,
    allowedImageMimeTypes,
    allowedDocumentMimeTypes,
    client,
    customChannelId,
  });

  const {
    items,
    addFiles,
    remove,
    clear,
    isUploading,
    blobIds,
    documentNames,
    imagePreviewUrls,
    hasAttachment,
    accept,
  } = attachments;

  // A blob belongs to the channel that was live when it was uploaded, so a pending attachment cannot
  // survive that channel being replaced — a reset deletes the channel and every blob on it, and sending
  // the id afterwards resolves to nothing without an error. Keyed on the channel instance rather than on
  // "a reset happened", so every replacement path is covered.
  const attachedChannelRef = useRef(channel);
  useEffect(() => {
    if (attachedChannelRef.current === channel) return;

    attachedChannelRef.current = channel;
    clear();
  }, [channel, clear]);

  const hasContent = value.trim().length > 0 || hasAttachment;
  // #409 — while a consent prompt is pending the server only accepts a consent reply, so core rejects
  // `sendMessage` outright (#405). The run has already ended by then, so `isConnecting` is false and
  // nothing else here would close the gate. Refuse at the composer instead of letting the user type a
  // message that cannot be sent — and, critically, that would be cleared from the draft on submit.
  const isAwaitingConsent = pendingConsent !== null;
  // F-023 AC5 — `isStopping` also closes the send gate: the old run is suspended but not finished, and
  // starting a second one would leave two runs on the channel. The draft is untouched, so the user's
  // text survives the wait (UC-045).
  const canSend = !isPreviewMode && !isConnecting && !isStopping && !isUploading && !isAwaitingConsent && hasContent;

  // F-028 — the suggestion only takes the stage on an empty, usable textarea: it must never paint over
  // what the user has already written, and offering a Tab shortcut into a disabled field would be a
  // dead end. A live run is deliberately *not* excluded — the textarea still accepts typing then, and
  // lining up the next question while the answer streams is exactly when the suggestion earns its keep.
  const suggesting = Boolean(promptSuggestion) && value.length === 0 && !isPreviewMode && !isAwaitingConsent;
  const suggestionTitle = suggesting ? t(locale, 'composer.suggestionTitle') : undefined;

  // Textarea max height tracks the chatbot container (40% of it, floor 96px); beyond that it scrolls.
  const adjustTextareaHeight = useCallback(
    (element: HTMLTextAreaElement): void => {
      const containerHeight = footerRef.current?.parentElement?.clientHeight ?? 0;
      const maxHeight = containerHeight > 0 ? Math.max(96, Math.round(containerHeight * 0.4)) : 240;

      element.style.height = 'auto';
      element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`;
      element.style.overflowY = element.scrollHeight > maxHeight ? 'auto' : 'hidden';
    },
    [footerRef],
  );

  const resetTextareaHeight = useCallback((): void => {
    if (!textareaRef.current) return;

    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.overflowY = 'hidden';
  }, []);

  const onChange = useCallback<ChangeEventHandler<HTMLTextAreaElement>>(event => {
    setValue(event.target.value);
  }, []);

  // Size the box to its content after the value is committed to the DOM. Measuring inside the setter
  // (as this used to, and as the Tab-adopt path would have to) reads the *previous* content: typing is
  // fine because the DOM is already updated by then, but a value pushed in from elsewhere — Tab
  // adopting a suggestion (F-028), `ChatbotRef.setInputValue` — measured an empty box and left a
  // multi-line value clipped to one row with `overflow: hidden`, i.e. invisible and unscrollable.
  useLayoutEffect(() => {
    if (textareaRef.current) adjustTextareaHeight(textareaRef.current);
  }, [value, adjustTextareaHeight]);

  // Container height changes (fullscreen toggle, window resize) re-apply the dynamic cap.
  useEffect(() => {
    const container = footerRef.current?.parentElement;

    if (!container) return;

    const observer = new ResizeObserver(() => {
      if (textareaRef.current) adjustTextareaHeight(textareaRef.current);
    });

    observer.observe(container);

    return (): void => observer.disconnect();
  }, [adjustTextareaHeight, footerRef]);

  const onSubmit = useCallback((): void => {
    // `isAwaitingConsent` guards the Enter key too — the disabled textarea covers the pointer path, but
    // a submit racing the arrival of the prompt must not clear the draft below on a send core refuses.
    if (isComposing || isConnecting || isStopping || isAwaitingConsent) return;

    const text = value.trim();

    if (!text && blobIds.length === 0) return;

    sendMessage?.({
      text,
      ...(blobIds.length > 0 ? { blobIds } : {}),
      ...(imagePreviewUrls.length > 0 ? { filePreviewUrls: imagePreviewUrls } : {}),
      ...(documentNames.length > 0 ? { documentNames } : {}),
    });

    setValue('');
    clear();
    resetTextareaHeight();
  }, [
    isComposing,
    isConnecting,
    isStopping,
    isAwaitingConsent,
    value,
    blobIds,
    imagePreviewUrls,
    documentNames,
    sendMessage,
    clear,
    resetTextareaHeight,
  ]);

  const onKeyDown = useCallback<KeyboardEventHandler<HTMLTextAreaElement>>(
    event => {
      if (event.key === 'Enter' && !event.shiftKey && !isComposing && canSend) {
        event.preventDefault();
        onSubmit();

        return;
      }

      // F-028 — Tab is intercepted only when there is genuinely a suggestion to adopt. Everywhere else
      // it must keep moving focus: that is a keyboard user's only way out of the textarea, so swallowing
      // it unconditionally would trap them. `Shift+Tab` (move backwards) is never intercepted, and a Tab
      // mid-composition belongs to the IME, which may be using it to pick a candidate — same rule the
      // Enter branch above already follows.
      if (event.key === 'Tab' && !event.shiftKey && !isComposing && suggesting && promptSuggestion) {
        event.preventDefault();
        // Adopting is not sending: the text lands in the textarea, focus stays put, and whether it goes
        // out is still the user's call. The box resizes itself in the layout effect above.
        setValue(promptSuggestion);
        clearPromptSuggestion();
      }
    },
    [isComposing, canSend, onSubmit, suggesting, promptSuggestion, clearPromptSuggestion],
  );

  const onPaste = useCallback<ClipboardEventHandler<HTMLTextAreaElement>>(
    event => {
      if (!canAttach) return;

      const files = Array.from(event.clipboardData?.items ?? [])
        .filter(item => item.kind === 'file')
        .flatMap(item => {
          const file = item.getAsFile();

          return file ? [file] : [];
        });

      // Only intercept when the clipboard actually carried files — plain text must paste normally.
      if (files.length === 0) return;

      event.preventDefault();
      addFiles(files);
    },
    [canAttach, addFiles],
  );

  // iOS Safari scrolls the page on focus; the opacity keyframe suppresses it. Then scroll the thread.
  const onFocus = useCallback((): void => {
    setIsTextareaFocused(true);

    setTimeout(() => {
      programmaticScrollToBottom('smooth');
    }, 300);
  }, [programmaticScrollToBottom]);

  // Consume values pushed in from outside (ChatbotRef.setInputValue / renderMenu selection).
  useEffect(() => {
    if (pendingInputValue === null) return;

    setValue(pendingInputValue);
    setPendingInputValue(null);
    // Height is handled by the layout effect above — measuring here would read the pre-update DOM.
    textareaRef.current?.focus();
  }, [pendingInputValue, setPendingInputValue]);

  // Files dropped on the container-level DropZoneOverlay flow through the same ingestion path.
  const { droppedFiles, clearDroppedFiles } = useFileDropContext();

  useEffect(() => {
    if (droppedFiles.length === 0) return;

    addFiles(droppedFiles);
    clearDroppedFiles();
  }, [droppedFiles, clearDroppedFiles, addFiles]);

  // The pill's border and background come straight from `--asg-color-border` / `--asg-color-surface`,
  // which the theme context already derives from the consumer's `borderColor` / `backgroundColor`.
  // Only the two values that cannot be expressed as an inline style need a variable here: the
  // `::placeholder` colour and the `:focus-within` ring.
  useEffect(() => {
    const pill = pillRef.current;

    if (!pill) return;

    pill.style.setProperty(
      '--asg-composer-placeholder-color',
      chatbot.footer?.textArea?.['::placeholder']?.color ?? 'var(--asg-color-text-placeholder)',
    );

    const focusColor = chatbot.primaryComponent?.mainColor ?? theme.userMessage?.backgroundColor;

    if (focusColor) pill.style.setProperty('--asg-composer-focus-color', String(focusColor));
  }, [chatbot.footer?.textArea, chatbot.primaryComponent?.mainColor, theme.userMessage?.backgroundColor]);

  const showSpeech = useMemo(() => isSpeechRecognitionSupported(), []);

  // F-023 — the stop control replaces send for the user's own run, and stays put through the wait for
  // the terminal event. `canStop` → press to stop; `isStopping` → inert while the backend winds the run
  // down (AC2); `canForceStop` → the wait timed out, press again to give up on the run (AC7).
  const showStopControl = canStop || isStopping;
  const stopLabel = canForceStop ? 'composer.forceStop' : isStopping ? 'composer.stopping' : 'composer.stop';

  const onStopClick = useCallback((): void => {
    // A DOM handler cannot reject, so the failure is absorbed here — the recovery the user sees is the
    // control becoming pressable again, which core does by rolling `stopPhase` back to `idle` (AC4).
    // The public `stopGeneration` still rejects, so consumers awaiting it can surface the failure.
    void stopGeneration?.({ force: canForceStop }).catch(() => undefined);
  }, [stopGeneration, canForceStop]);

  return (
    <div ref={pillRef} className={clsx('asgard-composer', styles.composer)}>
      <AttachmentPreview
        items={items}
        onRemove={remove}
        removeLabel={t(locale, 'composer.removeAttachment')}
        closeLabel={t(locale, 'composer.closePreview')}
      />

      <div className={styles.composer_row}>
        {canAttach && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={accept}
              className={styles.file_input}
              onChange={event => {
                if (event.target.files?.length) addFiles(event.target.files);

                event.target.value = '';
              }}
            />
            <button
              type="button"
              className={styles.attachment_button}
              style={chatbot.footer?.attachmentButton?.style}
              aria-label={t(locale, 'composer.attach')}
              title={t(locale, 'composer.attach')}
              // The teardown behind a reset can take up to a minute. Uploading into a channel that is
              // being deleted produces a blob that is gone before it can be referenced.
              disabled={isResetting}
              onClick={() => fileInputRef.current?.click()}
            >
              <PaperclipSvg />
            </button>
          </>
        )}

        <textarea
          ref={textareaRef}
          className={clsx(styles.textarea, isTextareaFocused && styles['textarea--focused'])}
          style={chatbot.footer?.textArea?.style}
          rows={1}
          value={value}
          disabled={isPreviewMode || isAwaitingConsent}
          placeholder={
            isPreviewMode
              ? 'Preview mode - input disabled'
              : isAwaitingConsent
              ? t(locale, 'composer.awaitingConsent')
              : suggesting
              ? `${promptSuggestion} ${t(locale, 'composer.suggestionHint')}`
              : inputPlaceholder || 'Enter message'
          }
          // The placeholder has room for a reminder, not an explanation — hover and screen readers get
          // the full sentence. Both stay unset when nothing is being offered (F-028).
          title={suggestionTitle}
          aria-description={suggestionTitle}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onFocus={onFocus}
          onAnimationEnd={() => setIsTextareaFocused(false)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
        />

        <div className={styles.send_zone}>
          {showSpeech && (
            <SpeechInputButton
              setValue={setValue}
              disabled={isConnecting || isPreviewMode || isAwaitingConsent}
              label={t(locale, 'composer.speech')}
              className={clsx(
                styles.speech_button,
                (isConnecting || isPreviewMode || isAwaitingConsent) && styles.speech_button__disabled,
              )}
              style={chatbot.footer?.speechInputButton?.style}
            />
          )}

          {showStopControl ? (
            <button
              type="button"
              className={clsx(styles.submit_button, isStopping && !canForceStop && styles.submit_button__disabled)}
              style={chatbot.footer?.submitButton?.style}
              aria-label={t(locale, stopLabel)}
              title={t(locale, stopLabel)}
              disabled={isStopping && !canForceStop}
              onClick={onStopClick}
            >
              <StopSvg />
            </button>
          ) : (
            <button
              type="button"
              className={clsx(styles.submit_button, !canSend && styles.submit_button__disabled)}
              style={chatbot.footer?.submitButton?.style}
              aria-label={t(locale, 'composer.send')}
              disabled={!canSend}
              onClick={onSubmit}
            >
              <SendSvg />
            </button>
          )}

          {footerEndActions}
        </div>
      </div>

      {renderComposerInline?.()}
    </div>
  );
}
