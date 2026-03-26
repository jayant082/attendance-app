import { QRCodeCanvas } from 'qrcode.react';

function QRGenerator({ payload }) {
  if (!payload) {
    return null;
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-sm backdrop-blur">
      <h3 className="mb-3 text-lg font-semibold text-slate-900">Session QR Code</h3>
      <div className="flex justify-center rounded-lg bg-slate-50 p-4">
        <QRCodeCanvas value={JSON.stringify(payload)} size={240} includeMargin />
      </div>
      <p className="text-xs text-slate-500 mt-4 break-all">
        Encoded Session ID: <span className="font-medium text-slate-700">{payload.sessionId}</span>
      </p>
    </div>
  );
}

export default QRGenerator;
