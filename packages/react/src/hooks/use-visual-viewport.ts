import { RefObject, useEffect } from 'react';

/**
 * Hook to handle iOS virtual keyboard by tracking visualViewport changes.
 * On iOS, when the virtual keyboard appears, the Layout Viewport stays the same
 * but the Visual Viewport shrinks. This hook adjusts the container's height
 * and position to match the Visual Viewport.
 *
 * @see https://saricden.com/how-to-make-fixed-elements-respect-the-virtual-keyboard-on-ios
 */
export function useVisualViewport(containerRef: RefObject<HTMLElement | null>): void {
  useEffect((): (() => void) | void => {
    const container = containerRef.current;
    const viewport = window.visualViewport;

    if (!container || !viewport) {
      return;
    }

    function updateContainerSize(): void {
      if (!container || !viewport) return;

      // Set height to match visual viewport
      container.style.height = `${viewport.height}px`;

      // Set top position to account for viewport offset (when keyboard pushes viewport down)
      container.style.top = `${viewport.offsetTop}px`;
    }

    // Initial update
    updateContainerSize();

    // Listen for viewport changes
    viewport.addEventListener('resize', updateContainerSize);
    viewport.addEventListener('scroll', updateContainerSize);

    return (): void => {
      viewport.removeEventListener('resize', updateContainerSize);
      viewport.removeEventListener('scroll', updateContainerSize);

      // Reset styles on cleanup
      if (container) {
        container.style.height = '';
        container.style.top = '';
      }
    };
  }, [containerRef]);
}
