/**
 * QR Code Utility
 * Generates QR codes as data URLs using the qrcode library
 */
import QRCode from 'qrcode';

/**
 * Generate QR code as Data URL
 * @param {string} url - The URL to encode
 * @param {Object} options - Optional configuration
 * @returns {Promise<string|null>} Base64 data URL or null on error
 */
export async function generateQRCodeUrl(url, options = {}) {
  const {
    width = 100,
    margin = 1,
    darkColor = '#1a1a1a',
    lightColor = '#ffffff'
  } = options;

  try {
    return await QRCode.toDataURL(url, {
      width,
      margin,
      color: {
        dark: darkColor,
        light: lightColor
      }
    });
  } catch (err) {
    console.error('Failed to generate QR code:', err);
    return null;
  }
}
