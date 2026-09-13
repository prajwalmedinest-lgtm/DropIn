/**
 * DropIn - Dynamic File Type & MIME Icon Utility
 * Provides distinct, tailored SVG icons and visual cues based on MIME type and file extension.
 * Supports specific recognition for Images, PDFs, Videos, Raw Text files, Code,
 * Spreadsheets, Archives, Audio, and Presentations.
 */

/**
 * Categorize a file by MIME type and filename extension
 * @param {string} mimeType 
 * @param {string} fileName 
 * @returns {'pdf'|'image'|'video'|'text'|'code'|'spreadsheet'|'archive'|'audio'|'presentation'|'generic'}
 */
export function getFileCategory(mimeType = '', fileName = '') {
  const mime = (mimeType || '').toLowerCase();
  const ext = (fileName || '').split('.').pop()?.toLowerCase() || '';

  // 1. PDF
  if (mime === 'application/pdf' || ext === 'pdf') {
    return 'pdf';
  }

  // 2. Images (Photos, vector graphics, raster)
  if (
    mime.startsWith('image/') ||
    ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'heic', 'heif', 'tiff', 'psd'].includes(ext)
  ) {
    return 'image';
  }

  // 3. Videos
  if (
    mime.startsWith('video/') ||
    ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'm4v', 'flv', '3gp', 'mpeg', 'mpg'].includes(ext)
  ) {
    return 'video';
  }

  // 4. Code & Markup (distinct from raw prose/text)
  if (
    mime.includes('javascript') ||
    mime.includes('typescript') ||
    mime.includes('json') ||
    mime.includes('xml') ||
    mime.includes('yaml') ||
    mime.includes('x-sh') ||
    mime.includes('x-python') ||
    ['js', 'ts', 'jsx', 'tsx', 'json', 'html', 'css', 'scss', 'py', 'sh', 'sql', 'cpp', 'c', 'h', 'java', 'rs', 'go', 'php', 'rb', 'swift', 'kt'].includes(ext)
  ) {
    return 'code';
  }

  // 5. Raw Text Files & Markdown
  if (
    mime === 'text/plain' ||
    mime === 'text/markdown' ||
    mime.startsWith('text/') ||
    ['txt', 'text', 'md', 'markdown', 'log', 'rtf', 'ini', 'conf', 'cfg', 'env'].includes(ext)
  ) {
    return 'text';
  }

  // 6. Spreadsheets & Tabular Data
  if (
    mime.includes('sheet') ||
    mime.includes('excel') ||
    mime.includes('csv') ||
    ['xlsx', 'xls', 'csv', 'tsv', 'numbers', 'ods'].includes(ext)
  ) {
    return 'spreadsheet';
  }

  // 7. Archives & Compressed packages
  if (
    mime.includes('zip') ||
    mime.includes('compressed') ||
    mime.includes('tar') ||
    mime.includes('archive') ||
    mime.includes('7z') ||
    ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'dmg'].includes(ext)
  ) {
    return 'archive';
  }

  // 8. Audio & Music
  if (
    mime.startsWith('audio/') ||
    ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'wma', 'aiff', 'opus', 'mid'].includes(ext)
  ) {
    return 'audio';
  }

  // 9. Presentations & Slides
  if (
    mime.includes('presentation') ||
    mime.includes('powerpoint') ||
    ['pptx', 'ppt', 'key', 'odp'].includes(ext)
  ) {
    return 'presentation';
  }

  return 'generic';
}

/**
 * Returns raw SVG markup, color theme class, and badge metadata for a file
 * @param {string} mimeType 
 * @param {string} fileName 
 * @param {number} size 
 * @returns {{ svg: string, colorClass: string, category: string, label: string, accentColor: string }}
 */
export function getFileIconData(mimeType = '', fileName = '', size = 22) {
  const category = getFileCategory(mimeType, fileName);

  switch (category) {
    case 'pdf':
      return {
        category,
        label: 'PDF',
        accentColor: '#f43f5e',
        colorClass: 'file-icon-pdf',
        svg: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <path d="M10 12h1.5a1.5 1.5 0 0 1 0 3H10v-3z"/>
          <path d="M10 18v-3"/>
          <line x1="15" y1="12" x2="15" y2="18"/>
          <path d="M15 15h2"/>
        </svg>`
      };

    case 'image':
      return {
        category,
        label: 'Image',
        accentColor: '#38bdf8',
        colorClass: 'file-icon-image',
        svg: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="3" ry="3"/>
          <circle cx="8.5" cy="8.5" r="1.75" fill="currentColor" fill-opacity="0.2"/>
          <path d="m21 15-5-5L5 21"/>
          <path d="m14 14 2.5-2.5L21 16"/>
        </svg>`
      };

    case 'video':
      return {
        category,
        label: 'Video',
        accentColor: '#a855f7',
        colorClass: 'file-icon-video',
        svg: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="2" y="4" width="20" height="16" rx="3"/>
          <path d="m10 9 6 3-6 3V9z" fill="currentColor" fill-opacity="0.3"/>
          <line x1="2" y1="8" x2="22" y2="8" stroke-dasharray="2 2"/>
        </svg>`
      };

    case 'text':
      return {
        category,
        label: 'Text',
        accentColor: '#fbbf24',
        colorClass: 'file-icon-text',
        svg: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="8" y1="13" x2="16" y2="13"/>
          <line x1="8" y1="17" x2="13" y2="17"/>
          <line x1="8" y1="9" x2="10" y2="9"/>
        </svg>`
      };

    case 'code':
      return {
        category,
        label: 'Code',
        accentColor: '#34d399',
        colorClass: 'file-icon-code',
        svg: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <polyline points="10 12 8 14 10 16"/>
          <polyline points="14 12 16 14 14 16"/>
        </svg>`
      };

    case 'spreadsheet':
      return {
        category,
        label: 'Sheet',
        accentColor: '#10b981',
        colorClass: 'file-icon-sheet',
        svg: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="3" y1="9" x2="21" y2="9"/>
          <line x1="3" y1="15" x2="21" y2="15"/>
          <line x1="9" y1="3" x2="9" y2="21"/>
          <line x1="15" y1="3" x2="15" y2="21"/>
        </svg>`
      };

    case 'archive':
      return {
        category,
        label: 'Archive',
        accentColor: '#fb923c',
        colorClass: 'file-icon-archive',
        svg: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="21 8 21 21 3 21 3 8"/>
          <rect x="1" y="3" width="22" height="5" rx="1"/>
          <line x1="10" y1="12" x2="14" y2="12"/>
          <line x1="12" y1="8" x2="12" y2="16"/>
          <rect x="10" y="15" width="4" height="3" rx="0.5"/>
        </svg>`
      };

    case 'audio':
      return {
        category,
        label: 'Audio',
        accentColor: '#ec4899',
        colorClass: 'file-icon-audio',
        svg: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9 18V5l12-2v13"/>
          <circle cx="6" cy="18" r="3" fill="currentColor" fill-opacity="0.25"/>
          <circle cx="18" cy="16" r="3" fill="currentColor" fill-opacity="0.25"/>
        </svg>`
      };

    case 'presentation':
      return {
        category,
        label: 'Slides',
        accentColor: '#f97316',
        colorClass: 'file-icon-presentation',
        svg: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M2 3h20"/>
          <rect x="4" y="3" width="16" height="13" rx="1"/>
          <path d="M12 16v5"/>
          <path d="M8 21h8"/>
          <path d="m9 9 3 3 3-3"/>
        </svg>`
      };

    default:
      return {
        category: 'generic',
        label: 'File',
        accentColor: '#94a3b8',
        colorClass: 'file-icon-generic',
        svg: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="9" y1="13" x2="15" y2="13"/>
          <line x1="9" y1="17" x2="13" y2="17"/>
        </svg>`
      };
  }
}

/**
 * Render dynamic file icon into target container
 * @param {HTMLElement} container 
 * @param {string} mimeType 
 * @param {string} fileName 
 * @param {number} size 
 */
export function updateFileIconBox(container, mimeType, fileName, size = 22) {
  if (!container) return;

  const data = getFileIconData(mimeType, fileName, size);
  container.innerHTML = data.svg;

  // Clean existing type classes
  container.classList.remove(
    'file-icon-pdf',
    'file-icon-image',
    'file-icon-video',
    'file-icon-text',
    'file-icon-code',
    'file-icon-sheet',
    'file-icon-archive',
    'file-icon-audio',
    'file-icon-presentation',
    'file-icon-generic'
  );
  container.classList.add(data.colorClass);
  container.setAttribute('title', `${data.label} file (${mimeType || 'unknown'})`);
  container.setAttribute('data-category', data.category);
}
