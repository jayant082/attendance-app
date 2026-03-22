import { QRCodeCanvas } from 'qrcode.react';

function QRGenerator({ payload }) {
  if (!payload) {
    return null;
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-200 w-full max-w-sm">
      <h3 className="text-lg font-semibold text-slate-800 mb-3">Session QR Code</h3>
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
