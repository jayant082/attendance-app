import { QRCodeCanvas } from 'qrcode.react';

function QRGenerator({ payload, presentation = false }) {
  if (!payload) {
    return null;
  }

  return (
    <div className={presentation ? 'flex w-full justify-center bg-white' : 'w-full max-w-sm rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-sm backdrop-blur'}>
      {!presentation && <h3 className="mb-3 text-lg font-semibold text-slate-900">Session QR Code</h3>}
      <div className={presentation ? 'flex w-full min-w-0 justify-center' : 'flex justify-center rounded-lg bg-slate-50 p-4'}>
        <QRCodeCanvas value={JSON.stringify(payload)} size={presentation ? 800 : 350} level="H" includeMargin style={{ width: presentation ? 'min(90vw, 65vh, 800px)' : undefined, maxWidth: '100%', height: 'auto' }} />
      </div>
      {!presentation && <p className="text-xs text-slate-500 mt-4 break-all">
        Encoded Session ID: <span className="font-medium text-slate-700">{payload.sessionId}</span>
      </p>}
    </div>
  );
}

export default QRGenerator;
