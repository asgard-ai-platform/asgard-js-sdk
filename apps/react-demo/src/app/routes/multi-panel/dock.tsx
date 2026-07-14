import { useEffect, useRef, useState, type FunctionComponent, type ReactNode } from 'react';
import { DockviewReact, type DockviewApi, type DockviewReadyEvent, type IDockviewPanelProps } from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';
import './dockview-theme-asgard.css';
import { AgentTeamsPanel, BrowserPanel, FilesPanel, PlanPanel } from './panels';

// Dockview area — the inner half of the Sindri layout. The docked panels are draggable: reorder them,
// split them side-by-side, tab them together, or resize between them. Dragging the tab away and closing
// removes the panel (synced back to the toolbar toggle). This is APP-owned layout wiring; the SDK panels
// inside (Plan / Agent Teams / Files / Browser) just fill whatever group dockview hands them.

export type PanelKey = 'plan' | 'agents' | 'files' | 'browser';

const TITLES: Record<PanelKey, string> = {
  plan: 'Plan',
  agents: 'Agent Teams',
  files: 'Files',
  browser: 'Browser',
};

const components: Record<PanelKey, FunctionComponent<IDockviewPanelProps>> = {
  plan: () => <PlanPanel />,
  agents: () => <AgentTeamsPanel />,
  files: () => <FilesPanel />,
  browser: () => <BrowserPanel />,
};

export function DockPanels({
  openPanels,
  onClose,
}: {
  openPanels: PanelKey[];
  onClose: (key: PanelKey) => void;
}): ReactNode {
  const [api, setApi] = useState<DockviewApi | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Panels we remove programmatically (toolbar toggle-off) must not fire onClose back — only a
  // user-driven close (dragging the tab's ✕) should sync the toolbar.
  const programmatic = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!api) return;

    const disposable = api.onDidRemovePanel(panel => {
      if (programmatic.current.has(panel.id)) {
        programmatic.current.delete(panel.id);

        return;
      }

      onCloseRef.current(panel.id as PanelKey);
    });

    return (): void => disposable.dispose();
  }, [api]);

  useEffect(() => {
    if (!api) return;

    openPanels.forEach(key => {
      if (!api.getPanel(key)) {
        const hasPanels = api.panels.length > 0;
        api.addPanel({
          id: key,
          component: key,
          title: TITLES[key],
          ...(hasPanels ? { position: { direction: 'below' as const } } : {}),
        });
      }
    });
    api.panels.forEach(panel => {
      if (!openPanels.includes(panel.id as PanelKey)) {
        programmatic.current.add(panel.id);
        api.removePanel(panel);
      }
    });
  }, [openPanels, api]);

  return (
    <DockviewReact
      className="dockview-theme-dark dockview-theme-asgard"
      components={components}
      disableFloatingGroups
      onReady={(e: DockviewReadyEvent) => setApi(e.api)}
    />
  );
}
