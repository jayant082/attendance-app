import { useEffect, useMemo } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

function QRScanner({ onScanSuccess, onScanError }) {
  const scannerId = useMemo(() => `scanner-${Math.random().toString(36).slice(2, 10)}`, []);

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      scannerId,
      {
        fps: 20,
        qrbox: { width: 350, height: 350 },
        disableFlip: false
      },
      false
    );

    scanner.render(
      (decodedText) => {
        console.log('QR Code Scanned Successfully:', decodedText); // Debug logging
        onScanSuccess(decodedText);
      },
      (errorMessage) => {
        console.log('QR Scanner Error:', errorMessage); // Debug logging
        if (onScanError) {
          const normalized = String(errorMessage || '').toLowerCase();

          if (normalized.includes('permission') || normalized.includes('notallowederror')) {
            onScanError('Camera permission denied. Please allow camera access and refresh.');
            return;
          }

          if (normalized.includes('nomultiformat') || normalized.includes('detect')) {
            onScanError('QR code not detected. Ensure the code is clear and well-lit.');
            return;
          }

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
