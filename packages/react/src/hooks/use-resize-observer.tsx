import { RefObject, useEffect } from 'react';

interface UseResizeObserverProps {
  ref: RefObject<HTMLDivElement | null>;
  onResize: (width: number, height: number) => void;
}

export function useResizeObserver(props: UseResizeObserverProps): void {
  const { ref, onResize } = props;

  useEffect(() => {
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        onResize(width, height);
      }
    });

    if (ref.current) {
      resizeObserver.observe(ref.current);
    }

    return (): void => {
      resizeObserver.disconnect();
    };
  }, [ref, onResize]);
}
