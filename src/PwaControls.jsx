import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, RefreshCw, Share2, Smartphone, X } from 'lucide-react';

const BASE = import.meta.env.BASE_URL;
const standalone = () => Boolean(
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
);

export default function PwaControls() {
  const [installed, setInstalled] = useState(standalone);
  const [open, setOpen] = useState(false);
  const [installEvent, setInstallEvent] = useState(null);
  const [updateReady, setUpdateReady] = useState(false);
  const registration = useRef(null);
  const wantReload = useRef(false);

  useEffect(() => {
    const onPrompt = (event) => { event.preventDefault(); setInstallEvent(event); };
    const onInstalled = () => { setInstalled(true); setInstallEvent(null); setOpen(false); };
    const onControllerChange = () => { if (wantReload.current) window.location.reload(); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    navigator.serviceWorker?.addEventListener('controllerchange', onControllerChange);

    let cancelled = false;
    let cleanupVisible = () => {};
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register(BASE + 'sw.js', { scope: BASE }).then((reg) => {
        if (cancelled) return;
        registration.current = reg;
        const check = () => { if (reg.waiting && navigator.serviceWorker.controller) setUpdateReady(true); };
        check();
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) setUpdateReady(true);
          });
        });
        const onVisible = () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); };
        document.addEventListener('visibilitychange', onVisible);
        cleanupVisible = () => document.removeEventListener('visibilitychange', onVisible);
      }).catch((err) => console.warn('FEV offline unavailable:', err));
    }

    return () => {
      cancelled = true;
      cleanupVisible();
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      navigator.serviceWorker?.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  const install = async () => {
    if (installEvent) {
      try {
        await installEvent.prompt();
        const selection = await installEvent.userChoice;
        if (selection?.outcome === 'accepted') setOpen(false);
      } catch {
        setOpen(true);
      }
      setInstallEvent(null);
    } else {
      setOpen(true);
    }
  };
  const update = () => {
    const worker = registration.current?.waiting;
    if (worker) {
      wantReload.current = true;
      worker.postMessage({ type: 'SKIP_WAITING' });
    } else window.location.reload();
  };

  return <>
    {updateReady && (
      <button type="button" className="btn pwa-update-btn compact-button" onClick={update} title="更新 FEV 版本">
        <RefreshCw size={16} /><span>更新</span>
      </button>
    )}
    <button type="button" className="btn btn-quiet compact-button pwa-install-btn" onClick={install} title={installed ? 'FEV App 已安裝' : '安裝 FEV App'}>
      {installed ? <CheckCircle2 size={17} /> : <Smartphone size={17} />}
      <span>{installed ? '已安裝' : '安裝 App'}</span>
    </button>
    {open && createPortal(
      <div className="modal-backdrop pwa-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
        <section className="modal pwa-modal" role="dialog" aria-modal="true" aria-labelledby="pwa-title">
          <div className="modal-heading">
            <div><h2 id="pwa-title">將 FEV 加入 iPhone</h2><p>加入主畫面後，就可以像 App 一樣獨立使用。</p></div>
            <button type="button" className="icon-btn" aria-label="關閉安裝說明" onClick={() => setOpen(false)}><X size={19} /></button>
          </div>
          <div className="modal-body pwa-body">
            <img className="pwa-preview" src={BASE + 'fev-mark.svg'} alt="FEV App 圖示預覽" />
            <div className="pwa-steps">
              <div><b>01</b><p>用 iPhone 的 <strong>Safari</strong> 開啟本站。</p></div>
              <div><b>02</b><p>按 Safari 的 <Share2 size={16} aria-label="分享" /> <strong>分享</strong> 按鈕。</p></div>
              <div><b>03</b><p>選擇 <strong>加入主畫面</strong>，再按「新增」。</p></div>
            </div>
            <p className="pwa-reminder">FEV 支援離線啟動，但名單仍只儲存在這台裝置。移除 App、清除網站資料或重設手機前，請先匯出 JSON 備份。</p>
            <div className="modal-actions"><button type="button" className="btn btn-primary" onClick={() => setOpen(false)}>我知道了</button></div>
          </div>
        </section>
      </div>, document.body
    )}
  </>;
}
