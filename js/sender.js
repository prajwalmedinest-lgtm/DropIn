/**
 * DropIn - Phone Sender Application
 * Vanilla JavaScript (No large frameworks)
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
    this.selectedFile = null;

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
    this.senderIconBox = document.getElementById('senderIconBox');
    this.selectedFileName = document.getElementById('selectedFileName');
    this.selectedFileSize = document.getElementById('selectedFileSize');
    this.imagePreviewContainer = document.getElementById('imagePreviewContainer');
    this.imagePreview = document.getElementById('imagePreview');
    this.btnSendToLaptop = document.getElementById('btnSendToLaptop');
    this.btnPickDifferent = document.getElementById('btnPickDifferent');

    // Sending View Controls
    this.sendingIconBox = document.getElementById('sendingIconBox');
    this.sendingStatusPill = document.getElementById('sendingStatusPill');
    this.sendingStatusDot = document.getElementById('sendingStatusDot');
    this.sendingStatusLabel = document.getElementById('sendingStatusLabel');
    this.sendingHeading = document.getElementById('sendingHeading');
    this.sendingFileName = document.getElementById('sendingFileName');
    this.sendingFileSizeSub = document.getElementById('sendingFileSizeSub');
    this.sendingPercent = document.getElementById('sendingPercent');
    this.sendingProgressBar = document.getElementById('sendingProgressBar');
    this.sendingBytes = document.getElementById('sendingBytes');
    this.sendingSpeed = document.getElementById('sendingSpeed');
    this.sendingChunks = document.getElementById('sendingChunks');
    this.sendingEta = document.getElementById('sendingEta');

    // Completed & Error View Controls
    this.btnSendAnother = document.getElementById('btnSendAnother');
    this.senderErrorTitle = document.getElementById('senderErrorTitle');
    this.senderErrorDesc = document.getElementById('senderErrorDesc');

    window.dropInSender = this;
  }

  bindEvents() {
    // File triggers
    this.btnTriggerFilePicker.addEventListener('click', () => {
      this.filePickerInput.click();
    });

    this.btnTriggerCamera.addEventListener('click', () => {
      this.cameraPickerInput.click();
    });

    this.filePickerInput.addEventListener('change', (e) => this.handleFileSelected(e.target.files[0]));
    this.cameraPickerInput.addEventListener('change', (e) => this.handleFileSelected(e.target.files[0]));

    // Send action
    this.btnSendToLaptop.addEventListener('click', () => this.startTransfer());

    // Pick different
    this.btnPickDifferent.addEventListener('click', () => {
      this.selectedFile = null;
      this.filePickerInput.value = '';
      this.cameraPickerInput.value = '';
      this.showView('ready');
    });

    // Send another
    this.btnSendAnother.addEventListener('click', () => {
      this.selectedFile = null;
      this.filePickerInput.value = '';
      this.cameraPickerInput.value = '';
      this.showView('ready');
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
        console.log('[Phone] Connected to session successfully');
        audioFeedback.playPairingSuccess();
        this.setupTransferManager();
        this.showView('ready');
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
        console.warn('[Phone] Laptop disconnected');
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
          if (typeof data === 'string') {
            this.signalling.sendJson({
              type: 'relay-string',
              sessionId: this.sessionId,
              payload: data
            });
          } else {
            this.signalling.send(data);
          }
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
          if (this.sendingStatusLabel) this.sendingStatusLabel.textContent = 'Transfer complete!';
        } else {
          if (this.sendingStatusLabel) this.sendingStatusLabel.textContent = 'Transferring chunks...';
        }
      },
      onStatusChange: (statusText) => {
        console.log('[Phone Transfer Status]:', statusText);
      },
      onError: (err) => {
        console.error('[Phone] Transfer error:', err);
        this.showError('Transfer Failed', 'An error occurred during transfer. Please try again.');
      },
      onConnectionStateChange: (connState) => {
        this.handleConnectionStateChange(connState);
      }
    });

    this.transferManager.initPeer();
  }

  /**
   * Handle DataChannel heartbeat / connection health state change on sender
   * @param {{ state: 'connected'|'reconnecting'|'disconnected', reason?: string }} connState
   */
  handleConnectionStateChange(connState) {
    const isReconnecting = connState.state === 'reconnecting';
    console.log(`[DropIn Phone] Connection state: ${connState.state} (Reason: ${connState.reason || 'none'})`);

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
      if (this.sendingSpeed) {
        this.sendingSpeed.textContent = 'Reconnecting...';
      }
      if (this.sendingEta) {
        this.sendingEta.textContent = 'Holding...';
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
      if (this.sendingStatusLabel) {
        this.sendingStatusLabel.textContent = 'Transferring chunks...';
      }
    }
  }

  handleFileSelected(file) {
    if (!file) return;

    this.selectedFile = file;
    this.selectedFileName.textContent = file.name;
    this.selectedFileSize.textContent = formatBytes(file.size);
    if (this.sendingFileSizeSub) {
      this.sendingFileSizeSub.textContent = formatBytes(file.size);
    }

    // Update dynamic file icon boxes
    updateFileIconBox(this.senderIconBox, file.type, file.name);
    updateFileIconBox(this.sendingIconBox, file.type, file.name);

    // Image thumbnail preview if applicable
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

    // Notify receiver that a file was picked
    if (this.signalling) {
      this.signalling.sendJson({
        type: 'file-selected',
        sessionId: this.sessionId,
        file: {
          name: file.name,
          size: file.size,
          mimeType: file.type
        }
      });
    }

    this.showView('selected');
  }

  async startTransfer() {
    if (!this.selectedFile || !this.transferManager) return;

    const totalChunks = Math.ceil(this.selectedFile.size / (64 * 1024));
    this.sendingFileName.textContent = this.selectedFile.name;
    if (this.sendingFileSizeSub) {
      this.sendingFileSizeSub.textContent = formatBytes(this.selectedFile.size);
    }
    this.sendingBytes.textContent = `0 B / ${formatBytes(this.selectedFile.size)}`;
    this.sendingPercent.textContent = '0';
    this.sendingProgressBar.style.width = '0%';
    this.sendingSpeed.textContent = '-- KB/s';
    this.sendingChunks.textContent = `0 / ${totalChunks}`;
    this.sendingEta.textContent = 'Starting...';

    this.showView('sending');

    // Engage CSS performance booster: pauses ambient star animations during WebRTC streaming
    starPerformanceManager.notifyTransferStart();

    try {
      await this.transferManager.sendFile(this.selectedFile);
      this.showView('completed');
      starPerformanceManager.notifyTransferComplete();
    } catch (err) {
      starPerformanceManager.notifyTransferIdle();
      console.error('File transfer failed:', err);
      this.showError('Transfer Failed', 'Could not complete transfer to laptop. Please retry.');
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
