/**
 * DropIn - QR Code Generator Module
 */
import QRCode from 'qrcode';

/**
 * Render QR code on canvas
 * @param {HTMLCanvasElement} canvas 
 * @param {string} text 
 * @param {object} options 
 * @returns {Promise<void>}
 */
export async function renderQRCode(canvas, text, options = {}) {
  const defaultOptions = {
    width: 220,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
    errorCorrectionLevel: 'M',
    ...options,
  };

  try {
    await QRCode.toCanvas(canvas, text, defaultOptions);
  } catch (err) {
    console.error('Failed to render QR Code:', err);
    throw err;
  }
}

export const generateQRCode = renderQRCode;
