import { useEffect, useRef, useState } from 'react';
import { useIsMobile } from './use-mobile';

interface KeyboardHandlerOptions {
  preventZoom?: boolean;
  adjustViewport?: boolean;
  onShow?: () => void;
  onHide?: () => void;
}

export const useKeyboardHandler = (options: KeyboardHandlerOptions = {}) => {
  const isMobile = useIsMobile();
  const initialViewportHeight = useRef<number>();
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    if (!isMobile) return;

    // Store initial viewport height
    initialViewportHeight.current = window.visualViewport?.height || window.innerHeight;
    const keyboardVisibleRef = { current: false };

    const clearViewportVars = () => {
      document.documentElement.style.removeProperty('--keyboard-height');
      document.documentElement.style.removeProperty('--visual-viewport-height');
      document.documentElement.style.removeProperty('--visual-viewport-offset-top');
    };

    const handleViewportChange = () => {
      if (!window.visualViewport) return;

      const currentHeight = window.visualViewport.height;
      const heightDifference = (initialViewportHeight.current || 0) - currentHeight;

      // Keyboard is considered visible if viewport height decreased by more than 150px
      const nextVisible = heightDifference > 150;

      if (options.adjustViewport) {
        document.documentElement.style.setProperty(
          '--visual-viewport-height',
          `${currentHeight}px`,
        );
        // iOS scrolls the *visual* viewport (offsetTop > 0) to reveal a focused
        // input, but the *layout* viewport — and our position:fixed shell — stays
        // pinned at y=0. Without compensating, the bottom-pinned composer floats
        // up by offsetTop, leaving a dead gap between the field and the keyboard.
        // Tracking offsetTop lets the shell follow the visible region so the
        // composer sits directly on the keyboard (iMessage/WhatsApp behavior).
        document.documentElement.style.setProperty(
          '--visual-viewport-offset-top',
          `${window.visualViewport.offsetTop || 0}px`,
        );
      }

      if (nextVisible !== keyboardVisibleRef.current) {
        keyboardVisibleRef.current = nextVisible;
        setIsKeyboardVisible(nextVisible);

        if (nextVisible) {
          document.body.classList.add('keyboard-visible');
          options.onShow?.();

          if (options.adjustViewport) {
            document.documentElement.style.setProperty(
              '--keyboard-height',
              `${heightDifference}px`,
            );
          }
        } else {
          document.body.classList.remove('keyboard-visible');
          options.onHide?.();

          if (options.adjustViewport) {
            clearViewportVars();
          }
        }
      } else if (nextVisible && options.adjustViewport) {
        // Keep keyboard height in sync while the keyboard animates.
        document.documentElement.style.setProperty('--keyboard-height', `${heightDifference}px`);
      }
    };

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;

      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        // Prevent zoom on iOS
        if (options.preventZoom && /iPad|iPhone|iPod/.test(navigator.userAgent)) {
          const originalFontSize = target.style.fontSize;
          target.style.fontSize = '16px';

          // Restore original font size after blur
          const handleBlur = () => {
            target.style.fontSize = originalFontSize;
            target.removeEventListener('blur', handleBlur);
          };
          target.addEventListener('blur', handleBlur);
        }

        // Pinned chat composers already sit above the keyboard — centering them
        // creates a large dead zone between the tray and the iOS keyboard.
        const isFixedBottomComposer = Boolean(
          target.closest('.chat-composer-tray, .chat-composer, [data-fixed-composer="true"]'),
        );
        if (isFixedBottomComposer) {
          return;
        }

        setTimeout(() => {
          target.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
          });
        }, 300);
      }
    };

    // Add event listeners
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportChange);
      window.visualViewport.addEventListener('scroll', handleViewportChange);
    }
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportChange);
        window.visualViewport.removeEventListener('scroll', handleViewportChange);
      }
      document.removeEventListener('focusin', handleFocusIn);

      // Only the page-level handler (adjustViewport: true) owns global keyboard state.
      if (options.adjustViewport && keyboardVisibleRef.current) {
        document.body.classList.remove('keyboard-visible');
        clearViewportVars();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- options properties are already destructured in deps
  }, [isMobile, options.preventZoom, options.adjustViewport, options.onShow, options.onHide]);

  return {
    isKeyboardVisible,
  };
};
