/**
 * DropIn - Phone Sender Application
 * Vanilla JavaScript with High-Performance Direct Streaming
 * 
 * Features:
 * - Sequential, queued multi-file transfers in a single pairing session
 * - Instant camera capture resilience with tab background/resume recovery
 * - Flow control and active stream health monitoring
 * - Zero re-scan needed for subsequent transfers
 */
import { formatBytes } from './session.js';
import { FileTransferManager } from './transfer.js';
import { updateFileIconBox } from './file-icons.js';
import { starPerformanceManager } from './star-performance-manager.js';
import { audioFeedback } from './audio-feedback.js';
import { SignallingClient } from './signalling-client.js';

class PhoneSenderApp {
  constructor() {
    this.sessionId = this.extractSessionId();
    this.signalling = null;
    this.transferManager = null;
    this.fileQueue = [];
    this.isTransferringQueue = false;

    this.cacheDomElements();
    this.bindEvents();

    if (!this.sessionId) {
      this.showError('Invalid Session', 'No session ID provided. Please scan the QR code displayed on your laptop.');
      return;
    }

    this.initSender();
  }

  extractSessionId() {
    // Check URL search parameters ?s=...
    const urlParams = new URLSearchParams(window.location.search);
    const paramId = urlParams.get('s');
    if (paramId) return paramId;

    // Check path /s/:id
    const match = window.location.pathname.match(/\/s\/([^/?#]+)/);
    if (match && match[1]) return match[1];

    return null;
  }

  cacheDomElements() {
    // Views
    this.views = {
      connecting: document.getElementById('senderViewConnecting'),
      ready: document.getElementById('senderViewReady'),
      selected: document.getElementById('senderViewSelected'),
      sending: document.getElementById('senderViewSending'),
      completed: document.getElementById('senderViewCompleted'),
      error: document.getElementById('senderViewError'),
    };

    // Reconnecting alert banner & connection status
    this.senderReconnectingAlert = document.getElementById('senderReconnectingAlert');
    this.senderReadyStatusPill = document.getElementById('senderReadyStatusPill');
    this.senderReadyStatusDot = document.getElementById('senderReadyStatusDot');
    this.senderReadyStatusText = document.getElementById('senderReadyStatusText');

    // Ready View Controls
    this.btnTriggerFilePicker = document.getElementById('btnTriggerFilePicker');
    this.btnTriggerCamera = document.getElementById('btnTriggerCamera');
    this.filePickerInput = document.getElementById('filePickerInput');
    this.cameraPickerInput = document.getElementById('cameraPickerInput');

    // Selected View Controls
    this.selectedViewStatusLabel = document.getElementById('selectedViewStatusLabel');
    this.selectedViewHeading = document.getElementById('selectedViewHeading');
    this.queueSummaryBanner = document.getElementById('queueSummaryBanner');
    this.queueCountBadge = document.getElementById('queueCountBadge');
    this.queueTotalSize = document.getElementById('queueTotalSize');
    this.senderFileCard = document.getElementById('senderFileCard');
    this.senderIconBox = document.getElementById('senderIconBox');
    this.selectedFileName = document.getElementById('selectedFileName');
    this.selectedFileSize = document.getElementById('selectedFileSize');
    this.queueListContainer = document.getElementById('queueListContainer');
    this.btnAddMoreFiles = document.getElementById('btnAddMoreFiles');
    this.btnAddMorePhoto = document.getElementById('btnAddMorePhoto');
    this.imagePreviewContainer = document.getElementById('imagePreviewContainer');
    this.imagePreview = document.getElementById('imagePreview');
    this.btnSendToLaptop = document.getElementById('btnSendToLaptop');
    this.btnSendToLaptopLabel = document.getElementById('btnSendToLaptopLabel');
    this.btnPickDifferent = document.getElementById('btnPickDifferent');

    // Sending View Controls
    this.sendingIconBox = document.getElementById('sendingIconBox');
    this.sendingStatusPill = document.getElementById('sendingStatusPill');
    this.sendingStatusDot = document.getElementById('sendingStatusDot');
    this.sendingStatusLabel = document.getElementById('sendingStatusLabel');
    this.sendingHeading = document.getElementById('sendingHeading');
    this.sendingQueueSubtext = document.getElementById('sendingQueueSubtext');
    this.sendingFileName = document.getElementById('sendingFileName');
    this.sendingFileSizeSub = document.getElementById('sendingFileSizeSub');
    this.sendingPercent = document.getElementById('sendingPercent');
    this.sendingProgressBar = document.getElementById('sendingProgressBar');
    this.sendingBytes = document.getElementById('sendingBytes');
    this.sendingSpeed = document.getElementById('sendingSpeed');
    this.sendingChunks = document.getElementById('sendingChunks');
    this.sendingEta = document.getElementById('sendingEta');

    // Completed & Error View Controls
    this.completedHeading = document.getElementById('completedHeading');
    this.completedSubheadline = document.getElementById('completedSubheadline');
    this.btnSendAnother = document.getElementById('btnSendAnother');
    this.btnTakeAnotherPhoto = document.getElementById('btnTakeAnotherPhoto');
    this.senderErrorTitle = document.getElementById('senderErrorTitle');
    this.senderErrorDesc = document.getElementById('senderErrorDesc');

    window.dropInSender = this;
  }

  bindEvents() {
    // File triggers from Ready view
    this.btnTriggerFilePicker.addEventListener('click', () => {
      this.filePickerInput.click();
    });

    this.btnTriggerCamera.addEventListener('click', () => {
      this.cameraPickerInput.click();
    });

    // Add more triggers from Selected view
    if (this.btnAddMoreFiles) {
      this.btnAddMoreFiles.addEventListener('click', () => {
        this.filePickerInput.click();
      });
    }

    if (this.btnAddMorePhoto) {
      this.btnAddMorePhoto.addEventListener('click', () => {
        this.cameraPickerInput.click();
      });
    }

    // Input change handlers
    this.filePickerInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        this.handleFilesAdded(Array.from(e.target.files));
      }
      e.target.value = '';
    });

    this.cameraPickerInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        this.handleFilesAdded(Array.from(e.target.files));
      }
      e.target.value = '';
    });

    // Send action
    this.btnSendToLaptop.addEventListener('click', () => this.startTransfer());

    // Clear / Pick different
    this.btnPickDifferent.addEventListener('click', () => {
      this.fileQueue = [];
      this.showView('ready');
    });

    // Sequential continuation actions from Completed view
    this.btnSendAnother.addEventListener('click', () => {
      this.fileQueue = [];
      this.showView('ready');
    });

    if (this.btnTakeAnotherPhoto) {
      this.btnTakeAnotherPhoto.addEventListener('click', () => {
        this.fileQueue = [];
        this.showView('ready');
        setTimeout(() => {
          this.cameraPickerInput.click();
        }, 120);
      });
    }

    // Tab visibility recovery (e.g. returning from camera app or phone sleep)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        console.log('[PhoneSender] Tab resumed. Ensuring connection is active...');
        if (this.signalling) {
          this.signalling.ensureConnected();
        }
      }
    });
  }

  showView(viewName) {
    Object.keys(this.views).forEach((name) => {
      if (this.views[name]) {
        this.views[name].style.display = (name === viewName) ? 'block' : 'none';
      }
    });
  }

  showError(title, message) {
    this.senderErrorTitle.textContent = title;
    this.senderErrorDesc.textContent = message;
    this.showView('error');
  }

  initSender() {
    this.showView('connecting');

    if (this.signalling) {
      this.signalling.close();
    }

    this.signalling = new SignallingClient({
      role: 'sender',
      sessionId: this.sessionId,
      onMessage: (msg) => {
        this.handleSignallingMessage(msg);
      },
      onStatusChange: (status) => {
        console.log(`[Phone Signalling Status]: ${status}`);
        if (status === 'connected') {
          this.handleConnectionStateChange({ state: 'connected' });
        } else if (status === 'reconnecting') {
          this.handleConnectionStateChange({ state: 'reconnecting' });
        }
      },
      onError: (err) => {
        console.warn('[Phone] Signalling error notice:', err);
      }
    });

    this.signalling.start(this.sessionId);
  }

  handleSignallingMessage(msg) {
    switch (msg.type) {
      case 'sender-joined-success':
      case 'receiver-ready':
        console.log('[Phone] Connected to session successfully');
        audioFeedback.playPairingSuccess();
        this.setupTransferManager();
        this.handleConnectionStateChange({ state: 'connected' });
        if (!this.fileQueue.length && !this.isTransferringQueue) {
          this.showView('ready');
        }
        break;

      case 'signal':
        if (this.transferManager && msg.data) {
          this.transferManager.handleSignal(msg.data);
        }
        break;

      case 'session-expired':
        if (this.signalling) {
          this.signalling.close();
        }
        this.showError('Session Expired', 'This session has expired. Please scan a fresh QR code on your laptop.');
        break;

      case 'receiver-disconnected':
        console.warn('[Phone] Laptop temporarily disconnected');
        break;

      case 'error':
        this.showError('Session Error', msg.message || 'Session unavailable.');
        break;
    }
  }

  setupTransferManager() {
    if (this.transferManager) {
      this.transferManager.cleanupPeer();
    }

    this.transferManager = new FileTransferManager({
      role: 'sender',
      sendStream: (data) => {
        if (this.signalling) {
          this.signalling.send(data);
        }
      },
      onProgress: (prog) => {
        this.sendingPercent.textContent = prog.percent;
        this.sendingProgressBar.style.width = `${prog.percent}%`;
        if (this.sendingProgressBar.parentElement) {
          this.sendingProgressBar.parentElement.setAttribute('aria-valuenow', prog.percent);
        }
        this.sendingBytes.textContent = `${formatBytes(prog.transferred)} / ${formatBytes(prog.total)}`;
        this.sendingSpeed.textContent = prog.speedText;
        this.sendingChunks.textContent = `${prog.currentChunk} / ${prog.totalChunks || '--'}`;
        this.sendingEta.textContent = prog.etaText;

        if (prog.percent >= 100) {
          if (this.sendingStatusLabel) this.sendingStatusLabel.textContent = 'Verifying transfer...';
        } else {
          if (this.sendingStatusLabel) this.sendingStatusLabel.textContent = 'Transferring chunks...';
        }
      },
      onStatusChange: (statusText) => {
        console.log('[Phone Transfer Status]:', statusText);
      },
      onError: (err) => {
        console.error('[Phone] Transfer error:', err);
      },
      onConnectionStateChange: (connState) => {
        this.handleConnectionStateChange(connState);
      }
    });

    this.transferManager.initPeer();
  }

  /**
   * Handle connection health state change on sender
   * @param {{ state: 'connected'|'reconnecting'|'disconnected', reason?: string }} connState
   */
  handleConnectionStateChange(connState) {
    const isReconnecting = connState.state === 'reconnecting';
    console.log(`[DropIn Phone] Connection state: ${connState.state}`);

    if (this.senderReconnectingAlert) {
      this.senderReconnectingAlert.style.display = isReconnecting ? 'flex' : 'none';
    }

    if (isReconnecting) {
      // Ready view status
      if (this.senderReadyStatusPill) {
        this.senderReadyStatusPill.classList.remove('emerald');
        this.senderReadyStatusPill.classList.add('amber');
      }
      if (this.senderReadyStatusDot) {
        this.senderReadyStatusDot.classList.remove('pulse');
        this.senderReadyStatusDot.classList.add('pulse-amber');
      }
      if (this.senderReadyStatusText) {
        this.senderReadyStatusText.textContent = 'Reconnecting...';
      }

      // Sending view status
      if (this.sendingStatusPill) {
        this.sendingStatusPill.classList.remove('emerald');
        this.sendingStatusPill.classList.add('amber');
      }
      if (this.sendingStatusDot) {
        this.sendingStatusDot.classList.remove('pulse');
        this.sendingStatusDot.classList.add('pulse-amber');
      }
      if (this.sendingStatusLabel) {
        this.sendingStatusLabel.textContent = 'Reconnecting stream...';
      }
    } else {
      // Connection restored
      if (this.senderReadyStatusPill) {
        this.senderReadyStatusPill.classList.remove('amber');
        this.senderReadyStatusPill.classList.add('emerald');
      }
      if (this.senderReadyStatusDot) {
        this.senderReadyStatusDot.classList.remove('pulse-amber');
        this.senderReadyStatusDot.classList.add('pulse');
      }
      if (this.senderReadyStatusText) {
        this.senderReadyStatusText.textContent = 'Connected to laptop ✓';
      }

      if (this.sendingStatusPill) {
        this.sendingStatusPill.classList.remove('amber');
        this.sendingStatusPill.classList.add('emerald');
      }
      if (this.sendingStatusDot) {
        this.sendingStatusDot.classList.remove('pulse-amber');
        this.sendingStatusDot.classList.add('pulse');
      }
      if (this.sendingStatusLabel && this.views.sending.style.display === 'block') {
        this.sendingStatusLabel.textContent = 'Transferring chunks...';
      }
    }
  }

  /**
   * Add one or multiple files to the transfer queue
   * @param {File[]} files 
   */
  handleFilesAdded(files) {
    if (!files || files.length === 0) return;

    // Append to existing queue
    for (const f of files) {
      if (f) {
        this.fileQueue.push(f);
      }
    }

    if (this.fileQueue.length === 0) return;

    // Wake up signalling connection immediately in case camera app caused sleep
    if (this.signalling) {
      this.signalling.ensureConnected();
    }

    this.renderQueueView();
    this.showView('selected');

    // Notify receiver about selection
    if (this.signalling && this.fileQueue.length > 0) {
      const primary = this.fileQueue[0];
      const totalSize = this.fileQueue.reduce((acc, f) => acc + f.size, 0);
      this.signalling.sendJson({
        type: 'file-selected',
        sessionId: this.sessionId,
        file: {
          name: this.fileQueue.length > 1 ? `${primary.name} (+${this.fileQueue.length - 1} more)` : primary.name,
          size: totalSize,
          mimeType: primary.type,
          count: this.fileQueue.length
        }
      });
    }
  }

  renderQueueView() {
    const totalFiles = this.fileQueue.length;
    if (totalFiles === 0) {
      this.showView('ready');
      return;
    }

    const totalBytes = this.fileQueue.reduce((acc, f) => acc + f.size, 0);

    if (totalFiles === 1) {
      const file = this.fileQueue[0];
      this.selectedViewHeading.textContent = 'Ready to Send';
      if (this.queueSummaryBanner) this.queueSummaryBanner.style.display = 'none';
      if (this.queueListContainer) this.queueListContainer.style.display = 'none';
      if (this.senderFileCard) this.senderFileCard.style.display = 'flex';

      this.selectedFileName.textContent = file.name;
      this.selectedFileSize.textContent = formatBytes(file.size);
      updateFileIconBox(this.senderIconBox, file.type, file.name);

      // Photo thumbnail preview
      if (file.type && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          this.imagePreview.src = e.target.result;
          this.imagePreviewContainer.style.display = 'block';
        };
        reader.readAsDataURL(file);
      } else {
        this.imagePreviewContainer.style.display = 'none';
        this.imagePreview.src = '';
      }

      this.btnSendToLaptopLabel.textContent = 'SEND TO LAPTOP';
    } else {
      // Multi-file queue mode
      this.selectedViewHeading.textContent = `Queued Files (${totalFiles})`;
      if (this.queueSummaryBanner) {
        this.queueSummaryBanner.style.display = 'flex';
        this.queueCountBadge.textContent = `${totalFiles} FILES`;
        this.queueTotalSize.textContent = formatBytes(totalBytes);
      }
      if (this.senderFileCard) this.senderFileCard.style.display = 'none';
      this.imagePreviewContainer.style.display = 'none';

      // Render queue items
      if (this.queueListContainer) {
        this.queueListContainer.style.display = 'flex';
        this.queueListContainer.innerHTML = '';
        this.fileQueue.forEach((file, index) => {
          const row = document.createElement('div');
          row.className = 'queue-item-row';
          row.innerHTML = `
            <span style="font-size: 11px; font-weight: 700; color: var(--text-tertiary); font-family: var(--font-mono);">${index + 1}.</span>
            <div class="queue-item-name" title="${file.name}">${file.name}</div>
            <div class="queue-item-size">${formatBytes(file.size)}</div>
            <button type="button" class="queue-remove-btn" title="Remove" aria-label="Remove ${file.name}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          `;
          const removeBtn = row.querySelector('.queue-remove-btn');
          removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.fileQueue.splice(index, 1);
            this.renderQueueView();
          });
          this.queueListContainer.appendChild(row);
        });
      }

      this.btnSendToLaptopLabel.textContent = `SEND ALL ${totalFiles} FILES`;
    }
  }

  async startTransfer() {
    if (this.fileQueue.length === 0 || this.isTransferringQueue) return;
    this.isTransferringQueue = true;

    // 1. Ensure signalling socket is fully connected before starting
    try {
      if (!this.signalling || !this.signalling.isConnected) {
        this.btnSendToLaptopLabel.textContent = 'Connecting...';
        if (this.signalling) {
          await this.signalling.waitUntilConnected(8000);
        }
      }
    } catch (err) {
      console.warn('[PhoneSender] Connection wait notice:', err);
    }

    if (!this.transferManager) {
      this.setupTransferManager();
    }

    const totalFilesInQueue = this.fileQueue.length;
    this.showView('sending');
    starPerformanceManager.notifyTransferStart();

    try {
      // 2. Sequential file streaming
      for (let i = 0; i < totalFilesInQueue; i++) {
        const file = this.fileQueue[i];
        const totalChunks = Math.ceil(file.size / (64 * 1024));

        this.sendingHeading.textContent = totalFilesInQueue > 1
          ? `Sending File ${i + 1} of ${totalFilesInQueue}`
          : 'Sending to Laptop';

        if (this.sendingQueueSubtext) {
          if (totalFilesInQueue > 1) {
            this.sendingQueueSubtext.style.display = 'block';
            this.sendingQueueSubtext.textContent = `File ${i + 1} of ${totalFilesInQueue}: ${file.name}`;
          } else {
            this.sendingQueueSubtext.style.display = 'none';
          }
        }

        this.sendingFileName.textContent = file.name;
        if (this.sendingFileSizeSub) {
          this.sendingFileSizeSub.textContent = formatBytes(file.size);
        }
        updateFileIconBox(this.sendingIconBox, file.type, file.name);

        this.sendingBytes.textContent = `0 B / ${formatBytes(file.size)}`;
        this.sendingPercent.textContent = '0';
        this.sendingProgressBar.style.width = '0%';
        this.sendingSpeed.textContent = '-- KB/s';
        this.sendingChunks.textContent = `0 / ${totalChunks}`;
        this.sendingEta.textContent = 'Starting...';

        // Stream file chunks
        await this.transferManager.sendFile(file);

        // Micro gap between sequential files
        if (i < totalFilesInQueue - 1) {
          await new Promise(r => setTimeout(r, 120));
        }
      }

      // 3. Queue completion
      this.fileQueue = [];
      this.isTransferringQueue = false;
      starPerformanceManager.notifyTransferComplete();

      if (this.completedHeading) {
        this.completedHeading.textContent = totalFilesInQueue > 1
          ? `All ${totalFilesInQueue} Files Sent!`
          : 'Transfer Complete!';
      }
      if (this.completedSubheadline) {
        this.completedSubheadline.textContent = totalFilesInQueue > 1
          ? `All ${totalFilesInQueue} files have arrived safely on your laptop.`
          : 'Your file has arrived safely on your laptop and is ready to use.';
      }

      this.showView('completed');
    } catch (err) {
      this.isTransferringQueue = false;
      starPerformanceManager.notifyTransferIdle();
      console.error('File transfer failed:', err);
      this.showError('Transfer Failed', 'Could not complete transfer to laptop. Please tap "OPEN LAPTOP SCREEN" or re-pair.');
    }
  }
}

// Suppress benign Dev environment WebSocket closure / Vite HMR unhandled notices
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && (
    String(event.reason).includes('WebSocket') ||
    String(event.reason?.message || '').includes('WebSocket') ||
    String(event.reason).includes('vite')
  )) {
    event.preventDefault();
  }
});

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  new PhoneSenderApp();
});
