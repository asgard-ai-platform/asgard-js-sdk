import { ChangeEvent, ReactNode, useCallback, useRef, useState } from 'react';
import { Chatbot, ChatbotRef } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import styles from './footer-end-actions.module.scss';

const INITIAL_SQL = `SELECT *
FROM orders
WHERE created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 100;`;

export function FooterEndActions(): ReactNode {
  const chatbotRef = useRef<ChatbotRef>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [sql, setSql] = useState(INITIAL_SQL);

  const openModal = useCallback((): void => {
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback((): void => {
    setIsModalOpen(false);
  }, []);

  const onSqlChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>): void => {
    setSql(event.target.value);
  }, []);

  const submitSql = useCallback((): void => {
    const text = sql.trim();
    if (!text) return;

    chatbotRef.current?.serviceContext?.sendMessage?.({ text });
    setIsModalOpen(false);
  }, [sql]);

  const footerEndActions: ReactNode[] = [
    <button key="sql" type="button" className={styles.endActionButton} onClick={openModal} title="Open SQL editor">
      SQL
    </button>,
  ];

  return (
    <DemoWrapper
      title="Footer End Actions"
      description="Demonstrates footerEndActions prop. The 'SQL' button at the end of the footer opens a modal SQL editor; submitting the modal calls sendMessage via ref. Mirrors Data Insight's real use case (replacing the cramped textarea with a full-screen editor for SQL writing)."
    >
      <div className={styles.chatbotContainer}>
        <Chatbot
          ref={chatbotRef}
          title="Footer End Actions Demo"
          config={{ botProviderEndpoint: import.meta.env.VITE_SIMPLE_BOT_PROVIDER_ENDPOINT }}
          customChannelId="footer-end-actions-demo"
          footerEndActions={footerEndActions}
        />
      </div>

      {isModalOpen && (
        <div className={styles.modalBackdrop} onClick={closeModal}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>SQL Editor</h3>
            <textarea className={styles.modalTextarea} value={sql} onChange={onSqlChange} spellCheck={false} />
            <div className={styles.modalActions}>
              <button type="button" className={styles.modalCancel} onClick={closeModal}>
                Cancel
              </button>
              <button type="button" className={styles.modalSubmit} onClick={submitSql} disabled={!sql.trim()}>
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </DemoWrapper>
  );
}
