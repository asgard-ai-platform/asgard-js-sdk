import { ReactNode, useCallback, useRef, useState } from 'react';
import { Chatbot, ChatbotRef } from '@asgard-js/react';
import '@asgard-js/react/style';
import { DemoWrapper } from '../../components/demo-wrapper';
import { createTextTemplateExample } from '../../mocks/messages';
import styles from './render-menu.module.scss';

interface MenuItem {
  label: string;
  children?: MenuItem[];
}

const menuData: MenuItem[] = [
  {
    label: '會員管理',
    children: [
      {
        label: '增長趨勢',
        children: [{ label: '本月新會員來源分析' }, { label: '會員成長率對比去年' }, { label: '潛在會員畫像特徵' }],
      },
      { label: '流失分析' },
      { label: '忠誠度' },
    ],
  },
  {
    label: '商品銷售',
    children: [{ label: '本月熱銷商品排行' }, { label: '銷售額趨勢分析' }],
  },
  { label: '本月新會員來源分析' },
];

interface QuickMenuProps {
  onSelect: (question: string) => void;
}

function QuickMenu({ onSelect }: QuickMenuProps): ReactNode {
  const [collapsed, setCollapsed] = useState(false);
  const [path, setPath] = useState<MenuItem[][]>([menuData]);

  const currentItems = path[path.length - 1];
  const currentTitle =
    path.length > 1 ? path[path.length - 2].find(item => item.children === currentItems)?.label : null;

  const handleItemClick = (item: MenuItem): void => {
    if (item.children) {
      setPath(prev => [...prev, item.children!]);
    } else {
      onSelect(item.label);
    }
  };

  const handleBack = (): void => {
    setPath(prev => prev.slice(0, -1));
  };

  if (collapsed) {
    return (
      <div className={styles.menu}>
        <button className={styles.menuToggle} onClick={() => setCollapsed(false)}>
          快捷選單
          <span className={styles.expandIcon}>▲</span>
        </button>
      </div>
    );
  }

  return (
    <div className={styles.menu}>
      <div className={styles.menuHeader}>
        {path.length > 1 ? (
          <>
            <span className={styles.menuTitle}>{currentTitle}</span>
            <button className={styles.menuAction} onClick={handleBack}>
              Back
            </button>
          </>
        ) : (
          <>
            <span className={styles.menuTitle}>快捷選單</span>
            <button className={styles.menuAction} onClick={() => setCollapsed(true)}>
              Collapse
            </button>
          </>
        )}
      </div>
      <div className={styles.menuItems}>
        {currentItems.map(item => (
          <button key={item.label} className={styles.menuItem} onClick={() => handleItemClick(item)}>
            {item.children ? (
              <>
                {item.label}
                <span className={styles.chevron}>›</span>
              </>
            ) : (
              <>
                <span className={styles.questionIcon}>?</span>
                {item.label}
              </>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export function RenderMenu(): ReactNode {
  const chatbotRef = useRef<ChatbotRef>(null);
  const initMessages = [createTextTemplateExample()];

  const handleSelect = useCallback((question: string): void => {
    chatbotRef.current?.setInputValue?.(question);
  }, []);

  return (
    <DemoWrapper
      title="Render Menu"
      description="Demonstrates renderMenu prop to add a custom menu between chat body and footer, combined with setInputValue to fill the input on click."
    >
      <div className={styles.chatbotContainer}>
        <Chatbot
          ref={chatbotRef}
          title="Data Analyst"
          config={{ botProviderEndpoint: import.meta.env.VITE_SIMPLE_BOT_PROVIDER_ENDPOINT }}
          customChannelId="render-menu-demo"
          initMessages={initMessages}
          renderMenu={() => <QuickMenu onSelect={handleSelect} />}
        />
      </div>
    </DemoWrapper>
  );
}
