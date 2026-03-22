import { useEffect, useMemo } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

function QRScanner({ onScanSuccess, onScanError }) {
  const scannerId = useMemo(() => `scanner-${Math.random().toString(36).slice(2, 10)}`, []);

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      scannerId,
      {
        fps: 10,
        qrbox: { width: 250, height: 250 }
      },
      false
    );

    scanner.render(
      (decodedText) => {
        onScanSuccess(decodedText);
      },
      (_errorMessage) => {
        if (onScanError) {
          onScanError('Scanning in progress...');
        }
      }
    );

    return () => {
      scanner
        .clear()
        .catch(() => {
          return null;
        });
    };
  }, [scannerId, onScanSuccess, onScanError]);

  return <div id={scannerId} className="w-full" />;
}

export default QRScanner;
