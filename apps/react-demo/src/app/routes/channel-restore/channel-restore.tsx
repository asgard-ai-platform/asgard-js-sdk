import { ReactNode, useState } from 'react';
import { Chatbot } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import styles from './channel-restore.module.scss';

// F-015 uses the local mock (Vite middleware) so GET /channel/metadata and the
// GET rejoin both respond. The mock treats an `existing-` channel id as one that
// already has a transcript to replay; any other id is 404 (does not exist).
const config = { botProviderEndpoint: `${typeof window !== 'undefined' ? window.location.origin : ''}/mock-asgard` };

export function ChannelRestore(): ReactNode {
  const [autoResetChannel, setAutoResetChannel] = useState(true);
  const [existingKey, setExistingKey] = useState(0);
  const [freshKey, setFreshKey] = useState(0);

  return (
    <DemoWrapper
      title="Channel Restore (F-015)"
      description="Mount now probes GET /channel/metadata first. An existing channel is restored via GET rejoin (history replays, no RESET_CHANNEL); a missing channel is reset (autoResetChannel=true) or left empty (false). Reusing F-003 isConnecting, input is disabled while the restore replay tails to run.done."
    >
      <div className={styles.grid}>
        <section className={styles.col}>
          <header className={styles.colHead}>
            <h3>Existing channel → restore</h3>
            <button className={styles.remount} onClick={() => setExistingKey(k => k + 1)}>
              Remount
            </button>
          </header>
          <p className={styles.note}>
            <code>customChannelId=&quot;existing-demo&quot;</code> → metadata 200 → GET rejoin replays the collapsed
            history (persisted <code>message.user</code> + <code>message.complete</code>). No <code>RESET_CHANNEL</code>{' '}
            is sent, so history is never wiped. Ephemeral tool-call / thinking activity is not persisted, so a cold
            restore rehydrates messages only. Input is briefly disabled until the replay reaches <code>run.done</code>.
          </p>
          <div className={styles.chatbot}>
            <Chatbot
              key={`existing-${existingKey}`}
              title="Restored channel"
              config={config}
              customChannelId="existing-demo"
            />
          </div>
        </section>

        <section className={styles.col}>
          <header className={styles.colHead}>
            <h3>New channel → reset / empty</h3>
            <label className={styles.toggle}>
              <input type="checkbox" checked={autoResetChannel} onChange={() => setAutoResetChannel(v => !v)} />
              <span>autoResetChannel</span>
            </label>
            <button className={styles.remount} onClick={() => setFreshKey(k => k + 1)}>
              Remount
            </button>
          </header>
          <p className={styles.note}>
            <code>customChannelId=&quot;fresh-demo&quot;</code> → metadata 404. With <code>autoResetChannel=true</code>{' '}
            a <code>RESET_CHANNEL</code> opens the channel (greeting streams); with <code>false</code> it stays empty
            and waits — the first send starts the channel with <code>action=NONE</code>.
          </p>
          <div className={styles.chatbot}>
            <Chatbot
              key={`fresh-${freshKey}-${autoResetChannel}`}
              title="New channel"
              config={config}
              customChannelId="fresh-demo"
              autoResetChannel={autoResetChannel}
            />
          </div>
        </section>
      </div>
    </DemoWrapper>
  );
}
