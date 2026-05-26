/**
 * Bloh playground — upload, extract, display, and export results.
 */

/** @type {File | null} */
let selectedFile = null;

/** @type {Record<string, unknown> | null} */
let lastResult = null;

/** @type {string | null} */
let lastDocumentType = null;

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileInfo = document.getElementById('file-info');
const extractBtn = document.getElementById('extract-btn');
const documentTypeSelect = document.getElementById('document-type');
const errorBanner = document.getElementById('error-banner');
const resultsPanel = document.getElementById('results-panel');
const jsonOutput = document.getElementById('json-output');
const metaFilename = document.getElementById('meta-filename');
const metaType = document.getElementById('meta-type');
const metaConfidence = document.getElementById('meta-confidence');
const metaTime = document.getElementById('meta-time');
const copyBtn = document.getElementById('copy-btn');
const downloadJsonBtn = document.getElementById('download-json-btn');
const downloadCsvBtn = document.getElementById('download-csv-btn');

/**
 * Formats byte size for display.
 * @param {number} bytes - File size in bytes
 * @returns {string} Human-readable size
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Maps UI document type values to API document_type values.
 * @param {string} value - Select element value
 * @returns {string} API document_type parameter
 */
function mapDocumentType(value) {
  const map = {
    auto: 'auto',
    invoice: 'invoice',
    receipt: 'receipt',
    contract: 'contract',
    id_document: 'id_document',
    bank_statement: 'bank_statement',
  };
  return map[value] ?? 'auto';
}

/**
 * Escapes HTML special characters in a string.
 * @param {string} str - Raw string
 * @returns {string} HTML-safe string
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Applies simple syntax highlighting to a JSON string.
 * @param {string} json - Formatted JSON string
 * @returns {string} HTML with span classes
 */
function highlightJson(json) {
  return json.replace(
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false)\b|\b(null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match, str, colon, bool, nil, num) => {
      if (str !== undefined) {
        if (colon) {
          return `<span class="json-key">${escapeHtml(str)}</span>${colon}`;
        }
        return `<span class="json-string">${escapeHtml(str)}</span>`;
      }
      if (bool) return `<span class="json-bool">${bool}</span>`;
      if (nil) return `<span class="json-null">${nil}</span>`;
      if (num) return `<span class="json-number">${num}</span>`;
      return match;
    },
  );
}

/**
 * Clears error state and hides results panel.
 */
function clearResults() {
  errorBanner.classList.remove('visible');
  errorBanner.textContent = '';
  resultsPanel.classList.remove('visible');
  lastResult = null;
  lastDocumentType = null;
}

/**
 * Shows an error message banner.
 * @param {string} message - Error message to display
 */
function showError(message) {
  errorBanner.textContent = message;
  errorBanner.classList.add('visible');
  resultsPanel.classList.remove('visible');
}

/**
 * Sets loading state on the extract button.
 * @param {boolean} isLoading - Whether extraction is in progress
 */
function setLoading(isLoading) {
  extractBtn.disabled = isLoading || !selectedFile;
  extractBtn.classList.toggle('loading', isLoading);
  extractBtn.innerHTML = isLoading
    ? '<svg class="btn-icon" viewBox="0 0 40 40" fill="none" aria-hidden="true"><circle cx="20" cy="20" r="16" stroke="#fffcf8" stroke-width="2"/><path d="M20 10 L26 24 L20 20 L14 24 Z" stroke="#fffcf8" stroke-width="2"/></svg>Extracting...'
    : 'Extract';
}

/**
 * Handles file selection from input or drop.
 * @param {File} file - Selected file
 */
async function handleFileSelect(file) {
  selectedFile = file;
  clearResults();
  fileInfo.textContent = `${file.name} — ${formatFileSize(file.size)}`;
  extractBtn.disabled = false;

  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch('/playground/estimate', {
      method: 'POST',
      body: formData,
    });
    const body = await response.json();
    if (response.ok && body.success) {
      fileInfo.textContent = `${file.name} — ${formatFileSize(file.size)} · ~${body.estimated_credits} credits`;
    }
  } catch {
    // Estimate is optional; file selection still works
  }
}

/**
 * Flattens extraction data to CSV rows, expanding line_items arrays.
 * @param {Record<string, unknown>} data - Extraction data object
 * @returns {string} CSV content
 */
function flattenToCsv(data) {
  const lineItems = data.line_items ?? data.transactions;
  const scalarFields = { ...data };
  delete scalarFields.line_items;
  delete scalarFields.transactions;

  const headers = Object.keys(scalarFields);
  const rows = [];

  if (Array.isArray(lineItems) && lineItems.length > 0) {
    const itemKeys = Object.keys(lineItems[0]);
    const allHeaders = [...headers, ...itemKeys.map((k) => `item_${k}`)];
    rows.push(allHeaders.join(','));

    for (const item of lineItems) {
      const scalarVals = headers.map((h) => csvCell(scalarFields[h]));
      const itemVals = itemKeys.map((k) => csvCell(item[k]));
      rows.push([...scalarVals, ...itemVals].join(','));
    }
  } else {
    rows.push(headers.join(','));
    rows.push(headers.map((h) => csvCell(scalarFields[h])).join(','));
  }

  return rows.join('\n');
}

/**
 * Escapes a CSV cell value.
 * @param {unknown} value - Cell value
 * @returns {string} Escaped CSV cell
 */
function csvCell(value) {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Triggers a file download in the browser.
 * @param {string} content - File content
 * @param {string} filename - Download filename
 * @param {string} mimeType - MIME type
 */
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Runs document extraction via the playground API.
 */
async function runExtraction() {
  if (!selectedFile) return;

  clearResults();
  setLoading(true);

  const formData = new FormData();
  formData.append('file', selectedFile);
  formData.append('document_type', mapDocumentType(documentTypeSelect.value));

  try {
    const response = await fetch('/playground/extract', {
      method: 'POST',
      body: formData,
    });

    const body = await response.json();

    if (!response.ok || !body.success) {
      const message = body.error?.message ?? 'Extraction failed. Please try again.';
      showError(message);
      return;
    }

    lastResult = body.data;
    lastDocumentType = body.document_type;

    metaFilename.textContent = selectedFile.name;
    metaType.textContent = body.document_type;
    metaConfidence.textContent = body.confidence;
    metaTime.textContent = `${body.processing_time_ms} ms · ${body.credits_used} credits`;

    const formatted = JSON.stringify(body.data, null, 2);
    jsonOutput.innerHTML = highlightJson(formatted);
    resultsPanel.classList.add('visible');
  } catch {
    showError('Network error. Check your connection and try again.');
  } finally {
    setLoading(false);
  }
}

/* Event listeners */
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer?.files?.[0];
  if (file) handleFileSelect(file);
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) handleFileSelect(file);
});

extractBtn.addEventListener('click', runExtraction);

copyBtn.addEventListener('click', async () => {
  if (!lastResult) return;
  await navigator.clipboard.writeText(JSON.stringify(lastResult, null, 2));
  const original = copyBtn.textContent;
  copyBtn.textContent = 'Copied!';
  setTimeout(() => { copyBtn.textContent = original; }, 2000);
});

downloadJsonBtn.addEventListener('click', () => {
  if (!lastResult) return;
  downloadFile(JSON.stringify(lastResult, null, 2), 'bloh-result.json', 'application/json');
});

downloadCsvBtn.addEventListener('click', () => {
  if (!lastResult) return;
  downloadFile(flattenToCsv(lastResult), 'bloh-result.csv', 'text/csv');
});

/* Smooth scroll for CTA buttons */
document.querySelectorAll('[data-scroll]').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    const target = document.querySelector(el.getAttribute('href'));
    target?.scrollIntoView({ behavior: 'smooth' });
  });
});

/* Doc tab switching (progressive enhancement over CSS tabs) */
document.querySelectorAll('.tab-label').forEach((label) => {
  label.addEventListener('click', () => {
    const inputId = label.getAttribute('for');
    const input = document.getElementById(inputId);
    if (input) input.checked = true;
  });
});
