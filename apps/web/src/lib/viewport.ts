/** Prevent accidental app zoom; keep one-finger scrolling and editable controls working. */
export function installViewportControls(): () => void {
  const preventGesture = (event: Event) => {
    if (event.cancelable) event.preventDefault();
  };
  const preventPinch = (event: TouchEvent) => {
    if (event.touches.length > 1 && event.cancelable) event.preventDefault();
  };
  const preventWheelZoom = (event: WheelEvent) => {
    if (event.ctrlKey && event.cancelable) event.preventDefault();
  };
  const update = () => {
    const viewport = window.visualViewport;
    const keyboard = Boolean(
      viewport &&
      viewport.height < window.innerHeight * 0.75 &&
      document.activeElement?.matches('input,textarea,select')
    );
    document.documentElement.classList.toggle('keyboard-open', keyboard);
    document.documentElement.style.setProperty(
      '--visible-height',
      `${viewport?.height || window.innerHeight}px`
    );
    document.documentElement.style.setProperty('--visible-top', `${viewport?.offsetTop || 0}px`);
  };
  document.addEventListener('gesturestart', preventGesture, { passive: false });
  document.addEventListener('gesturechange', preventGesture, { passive: false });
  document.addEventListener('touchmove', preventPinch, { passive: false });
  document.addEventListener('wheel', preventWheelZoom, { passive: false });
  window.visualViewport?.addEventListener('resize', update);
  window.visualViewport?.addEventListener('scroll', update);
  document.addEventListener('focusin', update);
  document.addEventListener('focusout', update);
  update();
  return () => {
    document.removeEventListener('gesturestart', preventGesture);
    document.removeEventListener('gesturechange', preventGesture);
    document.removeEventListener('touchmove', preventPinch);
    document.removeEventListener('wheel', preventWheelZoom);
    window.visualViewport?.removeEventListener('resize', update);
    window.visualViewport?.removeEventListener('scroll', update);
    document.removeEventListener('focusin', update);
    document.removeEventListener('focusout', update);
    document.documentElement.classList.remove('keyboard-open');
    document.documentElement.style.removeProperty('--visible-height');
    document.documentElement.style.removeProperty('--visible-top');
  };
}
