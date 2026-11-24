import { useEffect, useMemo, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

function QRScanner({ onScanSuccess }) {
  const scannerId = useMemo(() => `scanner-${Math.random().toString(36).slice(2, 10)}`, []);
  const onScanSuccessRef = useRef(onScanSuccess);

  useEffect(() => {
    onScanSuccessRef.current = onScanSuccess;
  }, [onScanSuccess]);

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      scannerId,
      {
        fps: 20,
        disableFlip: false
      },
      false
    );

    scanner.render(
      (decodedText) => onScanSuccessRef.current(decodedText),
      () => {}
    );

    return () => {
      scanner
        .clear()
        .catch((error) => {
          console.error('Unable to stop QR scanner:', error);
        });
    };
  }, [scannerId]);

  return <div id={scannerId} className="w-full" />;
}

export default QRScanner;
