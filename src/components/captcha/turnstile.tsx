import { type Component, createEffect, createSignal, onCleanup, onMount } from "solid-js";

declare global {
  interface Window {
    onloadTurnstileCallback?: () => void;
    turnstile?: Turnstile.Turnstile;
  }
}

interface TurnstileCaptchaProps {
  sitekey: string;
  action?: string;
  cData?: string;
  onSuccess?: (token: string) => void;
  onExpire?: () => void;
}

const [loadState, setLoadState] = createSignal<'unloaded' | 'loading' | 'loaded'>('unloaded');

const TURNSTILE_SCRIPT =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onloadTurnstileCallback";

function loadScript() {
  if (loadState() !== 'unloaded') return;
  setLoadState('loading');
  const script = document.createElement("script");
  script.src = TURNSTILE_SCRIPT;
  script.async = true;
  script.defer = true;
  document.body.appendChild(script);
}

export const TurnstileCaptcha: Component<TurnstileCaptchaProps> = (props) => {
  const [containerRef, setContainerRef] = createSignal<HTMLDivElement | null>(null);
  let widgetId: string | null | undefined;

  function renderWidget() {
    if (!window.turnstile || !containerRef()) return;
    widgetId = window.turnstile.render(containerRef() as HTMLElement, {
      sitekey: props.sitekey,
      action: props.action,
      cData: props.cData,
      callback: (token: string) => {
        props.onSuccess?.(token);
      },
      "expired-callback": () => {
        props.onExpire?.();
        if (widgetId) {
          window.turnstile?.reset(widgetId);
        }
      },
    });
  }

  onMount(() => {
    if (!window.onloadTurnstileCallback) {
      window.onloadTurnstileCallback = () => {
        setLoadState('loaded');
      };
    }
    loadScript();
  });

  createEffect(() => {
    if (loadState() === 'loaded' && !widgetId) {
      renderWidget();
    }
  });

  onCleanup(() => {
    if (window.turnstile && widgetId) {
      window.turnstile.remove(widgetId);
    }
  });

  return (
    <div class="turnstile-captcha">
      <div ref={setContainerRef} />
    </div>
  );
};
