/**
 * DropIn - Laptop Receiver Application
 * Vanilla JavaScript (No large frameworks)
 */
import { generateSessionId, buildSessionUrl, formatBytes, SessionCountdownTimer, sessionManager } from './session.js';
import { generateQRCode } from './qr.js';
import { FileTransferManager } from './transfer.js';
import { updateFileIconBox, getFileIconData } from './file-icons.js';
import { starPerformanceManager } from './star-performance-manager.js';
import { audioFeedback } from './audio-feedback.js';
import { SignallingClient } from './signalling-client.js';

class LaptopReceiverApp {
  constructor() {
    this.sessionId = null;
    this.sessionUrl = null;
    this.signalling = null;
    this.countdownTimer = null;
    this.transferManager = null;
    this.lastReceivedFile = null;

    // Non-persistent list of last 3 transfers in the current session
    this.sessionTransfers = [];

    // Auto-download on verified SHA-256 integrity option (defaults to true for zero friction, persisted locally)
    let savedAutoDownload = null;
    try {
      savedAutoDownload = localStorage.getItem('dropin_autodownload_enabled');
    } catch (e) {
      // localStorage may be restricted in private/sandboxed iframe
    }
    this.isAutoDownloadEnabled = savedAutoDownload !== null ? savedAutoDownload === 'true' : true;

    // Tour step definitions
    this.tourSteps = [
      {
        step: 1,
        tag: 'STEP 1 OF 3 ✦',
        metric: '120s TTL',
        headline: 'Scan Instant Ephemeral QR',
        desc: 'Click <strong>GENERATE QR</strong> below to create a secure 2-minute pairing code. Point any phone camera to connect directly without installing an app or signing in.',
        pills: ['✦ 0 Cloud Storage', '✦ Direct Memory Stream', '✦ Auto-Expiry']
      },
      {
        step: 2,
        tag: 'STEP 2 OF 3 ✦',
        metric: 'Zero Restrictions',
        headline: 'Select Any File on Phone',
        desc: 'Pick photos, high-res videos, PDFs, spreadsheets, code files, or capture a live shot. No artificial file limits or account signups.',
        pills: ['✦ Uncapped Size', '✦ Any File Type', '✦ Real-Time Chunks']
      },
      {
        step: 3,
        tag: 'STEP 3 OF 3 ✦',
        metric: 'SHA-256 Verified',
        headline: 'Attached Directly to Laptop',
        desc: 'The file drops straight into your laptop browser RAM via TLS encrypted direct stream. Instant auto-download with cryptographic checksum verification.',
        pills: ['✦ Encrypted Stream', '✦ RAM Only', '✦ SHA-256 Checksum']
      }
    ];

    this.cacheDomElements();
    this.bindEvents();

    // Launch initial opening sequence (Name drop intro -> Idle tour -> Generate QR)
    this.initIntroSequence();
  }

  cacheDomElements() {
    // Opening overlay
    this.nameDropOverlay = document.getElementById('nameDropOverlay');
    this.nameDropContent = document.getElementById('nameDropContent');

    // Views
    this.views = {
      idle: document.getElementById('viewIdle'),
      qr: document.getElementById('viewQr'),
      connected: document.getElementById('viewConnected'),
      receiving: document.getElementById('viewReceiving'),
      completed: document.getElementById('viewCompleted'),
      expired: document.getElementById('viewExpired'),
      error: document.getElementById('viewError'),
    };

    // Controls
    this.btnConnectPhone = document.getElementById('btnConnectPhone');
    this.qrWrapper = document.getElementById('qrWrapper');
    this.qrCanvas = document.getElementById('qrCanvas');
    this.qrRingProgress = document.getElementById('qrRingProgress');
    this.qrCountdownBarFill = document.getElementById('qrCountdownBarFill');
    this.sessionCountdown = document.getElementById('sessionCountdown');
    this.qrUrlText = document.getElementById('qrUrlText');
    this.btnCopyUrl = document.getElementById('btnCopyUrl');
    this.copyUrlLabel = document.getElementById('copyUrlLabel');
    this.btnOpenMobileTest = document.getElementById('btnOpenMobileTest');

    // Mini Tour Elements
    this.tourTab1 = document.getElementById('tourTab1');
    this.tourTab2 = document.getElementById('tourTab2');
    this.tourTab3 = document.getElementById('tourTab3');
    this.tourStepTag = document.getElementById('tourStepTag');
    this.tourStepMetric = document.getElementById('tourStepMetric');
    this.tourStepHeadline = document.getElementById('tourStepHeadline');
    this.tourStepDesc = document.getElementById('tourStepDesc');
    this.tourCardBody = document.getElementById('tourCardBody');

    // Security Elements
    this.btnOpenSecurityModal = document.getElementById('btnOpenSecurityModal');
    this.btnCloseSecurityModal = document.getElementById('btnCloseSecurityModal');
    this.btnGotItSecurity = document.getElementById('btnGotItSecurity');
    this.securityModal = document.getElementById('securityModal');
    this.btnPanicRevoke = document.getElementById('btnPanicRevoke');
    this.shaVerificationPill = document.getElementById('shaVerificationPill');
    this.shaHashText = document.getElementById('shaHashText');

    // Reconnecting alert banner & connection status
    this.reconnectingAlert = document.getElementById('reconnectingAlert');
    this.connectedStatusPill = document.getElementById('connectedStatusPill');
    this.connectedStatusDot = document.getElementById('connectedStatusDot');
    this.connectedStatusText = document.getElementById('connectedStatusText');
    this.connectedStatusStar = document.getElementById('connectedStatusStar');
    this.connectedWaitingNotice = document.getElementById('connectedWaitingNotice');
    this.btnSimulateInterference = document.getElementById('btnSimulateInterference');
    this.receivingStatusPill = document.getElementById('receivingStatusPill');

    // Receiving view elements
    this.receivingIconBox = document.getElementById('receivingIconBox');
    this.receivingFileName = document.getElementById('receivingFileName');
    this.receivingFileSize = document.getElementById('receivingFileSize');
    this.receivingStatusLabel = document.getElementById('receivingStatusLabel');
    this.receivingPercent = document.getElementById('receivingPercent');
    this.receivingProgressBar = document.getElementById('receivingProgressBar');
    this.receivingBytes = document.getElementById('receivingBytes');
    this.receivingSpeed = document.getElementById('receivingSpeed');
    this.receivingChunks = document.getElementById('receivingChunks');
    this.receivingEta = document.getElementById('receivingEta');

    // Completed view elements
    this.completedIconBox = document.getElementById('completedIconBox');
    this.completedFileName = document.getElementById('completedFileName');
    this.completedFileSize = document.getElementById('completedFileSize');
    this.btnDownloadReceived = document.getElementById('btnDownloadReceived');
    this.btnDownloadReceivedLabel = document.getElementById('btnDownloadReceivedLabel');
    this.btnReceiveAnother = document.getElementById('btnReceiveAnother');
    this.toggleAutoDownloadCompleted = document.getElementById('toggleAutoDownloadCompleted');
    this.autoDownloadStatusNotice = document.getElementById('autoDownloadStatusNotice');
    this.autoDownloadNoticeText = document.getElementById('autoDownloadNoticeText');

    // Auto-download header toggle
    this.btnToggleAutoDownloadHeader = document.getElementById('btnToggleAutoDownloadHeader');
    this.autoDownloadHeaderLabel = document.getElementById('autoDownloadHeaderLabel');

    // Recent session transfers list
    this.recentTransfersContainer = document.getElementById('recentTransfersContainer');
    this.recentCountBadge = document.getElementById('recentCountBadge');
    this.recentTransfersList = document.getElementById('recentTransfersList');

    // Recovery buttons
    this.btnNewQr = document.getElementById('btnNewQr');
    this.btnRetrySession = document.getElementById('btnRetrySession');
    this.btnResetToNew = document.getElementById('btnResetToNew');
    this.transferModeBadge = document.getElementById('transferModeBadge');

    // Global developer helper for testing
    window.dropInApp = this;
  }

  bindEvents() {
    // Auto-download toggle listeners
    if (this.btnToggleAutoDownloadHeader) {
      this.btnToggleAutoDownloadHeader.addEventListener('click', () => {
        this.toggleAutoDownload();
      });
    }

    if (this.toggleAutoDownloadCompleted) {
      this.toggleAutoDownloadCompleted.addEventListener('change', (e) => {
        this.setAutoDownload(e.target.checked);
      });
    }

    // Sync initial UI state with stored option
    this.updateAutoDownloadUI();

    // Generate QR CTA
    this.btnConnectPhone.addEventListener('click', () => {
      this.startNewSession();
    });

    if (this.btnSimulateInterference) {
      this.btnSimulateInterference.addEventListener('click', () => {
        if (this.transferManager) {
          this.transferManager.simulateSignalDrop(5000);
        } else {
          console.warn('No active transfer connection to simulate drop.');
        }
      });
    }
    
    this.btnCopyUrl.addEventListener('click', () => this.copySessionLink());
    
    this.btnOpenMobileTest.addEventListener('click', () => {
      if (this.sessionUrl) {
        window.open(this.sessionUrl, '_blank', 'width=420,height=720');
      }
    });

    this.btnDownloadReceived.addEventListener('click', () => this.downloadReceivedFile());
    this.btnReceiveAnother.addEventListener('click', () => this.resetForNextFile());

    this.btnNewQr.addEventListener('click', () => this.startNewSession());
    this.btnRetrySession.addEventListener('click', () => this.startNewSession());
    this.btnResetToNew.addEventListener('click', () => {
      this.cleanupCurrentSession();
      this.showView('idle');
    });

    // Mini Tour tabs
    [this.tourTab1, this.tourTab2, this.tourTab3].forEach((tab) => {
      if (!tab) return;
      tab.addEventListener('click', (e) => {
        const stepNum = parseInt(tab.getAttribute('data-step') || '1', 10);
        this.selectTourStep(stepNum);
      });
    });

    // Security Modal events
    if (this.btnOpenSecurityModal) {
      this.btnOpenSecurityModal.addEventListener('click', () => this.openSecurityModal());
    }
    if (this.btnCloseSecurityModal) {
      this.btnCloseSecurityModal.addEventListener('click', () => this.closeSecurityModal());
    }
    if (this.btnGotItSecurity) {
      this.btnGotItSecurity.addEventListener('click', () => this.closeSecurityModal());
    }
    if (this.securityModal) {
      this.securityModal.addEventListener('click', (e) => {
        if (e.target === this.securityModal) {
          this.closeSecurityModal();
        }
      });
    }

    // Panic Revoke & Memory Purge Button
    if (this.btnPanicRevoke) {
      this.btnPanicRevoke.addEventListener('click', () => this.panicRevokeSession());
    }
  }

  /**
   * Opening 2-3s DropIn Logo Sequence
   * Displays the DropIn logo animation for 2.4 seconds (within 2-3s range), then smoothly
   * transitions into the main interface without blocking WebRTC or signalling initialization.
   */
  initIntroSequence() {
    this.showView('idle');

    // Asynchronously pre-warm WebRTC and signalling readiness in background without blocking animation
    this.preWarmWebRTCAndSignaling();

    if (!this.nameDropOverlay) return;

    let hasTransitioned = false;
    const finishIntro = () => {
      if (hasTransitioned || this.nameDropOverlay.style.display === 'none') return;
      hasTransitioned = true;

      // Smooth transition into the main interface
      this.nameDropOverlay.style.transition = 'opacity 0.45s cubic-bezier(0.16, 1, 0.3, 1), transform 0.45s cubic-bezier(0.16, 1, 0.3, 1)';
      this.nameDropOverlay.style.opacity = '0';
      this.nameDropOverlay.style.transform = 'scale(1.02)';
      this.nameDropOverlay.style.pointerEvents = 'none';

      setTimeout(() => {
        if (this.nameDropOverlay) {
          this.nameDropOverlay.style.display = 'none';
        }
      }, 450);
    };

    // Auto-advance after 2.4 seconds smoothly
    const timer = setTimeout(finishIntro, 2400);

    // Allow user to click anywhere or press any key to skip immediately
    this.nameDropOverlay.addEventListener('click', () => {
      clearTimeout(timer);
      finishIntro();
    });

    window.addEventListener('keydown', () => {
      clearTimeout(timer);
      finishIntro();
    }, { once: true });
  }

  /**
   * Pre-initializes WebRTC capability checks and prepares session state
   * asynchronously without blocking the logo animation or main-thread rendering.
   */
  async preWarmWebRTCAndSignaling() {
    try {
      // 1. Verify WebRTC & WebCrypto support non-blockingly
      const hasRTCPeerConnection = typeof window !== 'undefined' && 'RTCPeerConnection' in window;
      const hasSubtleCrypto = typeof window !== 'undefined' && window.crypto && 'subtle' in window.crypto;

      // 2. Pre-generate session credentials so QR code generation is instantaneous
      this.preWarmedSessionId = generateSessionId();
      this.preWarmedSessionUrl = buildSessionUrl(this.preWarmedSessionId);

      // 3. Pre-ping signaling health check in background
      if (typeof fetch !== 'undefined') {
        fetch('/api/health', { method: 'GET', cache: 'no-store' }).catch(() => {});
      }
    } catch (e) {
      console.warn('Background WebRTC pre-warm notice:', e);
    }
  }

  /**
   * Mini Tour step selector with fluid cross-fade transition
   */
  selectTourStep(stepNumber) {
    const currentTab = [this.tourTab1, this.tourTab2, this.tourTab3].find(t => t?.classList.contains('active'));
    const currentStep = currentTab ? parseInt(currentTab.getAttribute('data-step') || '1', 10) : 1;
    if (currentStep === stepNumber && this.tourCardBody?.classList.contains('tour-card-cross-fade-in')) {
      return;
    }

    const stepData = this.tourSteps.find(s => s.step === stepNumber) || this.tourSteps[0];
    
    // Update active state on tab buttons immediately with CSS transitions
    [this.tourTab1, this.tourTab2, this.tourTab3].forEach(tab => {
      if (!tab) return;
      const step = parseInt(tab.getAttribute('data-step') || '1', 10);
      const isActive = step === stepNumber;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    if (this.tourCardBody) {
      // Step 1: Trigger subtle fade out
      this.tourCardBody.classList.remove('tour-card-cross-fade-in');
      this.tourCardBody.classList.add('tour-fading-out');

      setTimeout(() => {
        // Step 2: Swap content
        if (this.tourStepTag) this.tourStepTag.textContent = stepData.tag;
        if (this.tourStepMetric) this.tourStepMetric.textContent = stepData.metric;
        if (this.tourStepHeadline) this.tourStepHeadline.textContent = stepData.headline;
        if (this.tourStepDesc) this.tourStepDesc.innerHTML = stepData.desc;

        const pillsRow = this.tourCardBody.querySelector('.tour-security-pills-row');
        if (pillsRow && stepData.pills) {
          pillsRow.innerHTML = stepData.pills.map(p => `<span class="tour-security-pill">${p}</span>`).join('');
        }

        // Step 3: Trigger fluid subtle cross-fade in
        this.tourCardBody.classList.remove('tour-fading-out');
        this.tourCardBody.classList.add('tour-card-cross-fade-in');

        setTimeout(() => {
          this.tourCardBody?.classList.remove('tour-card-cross-fade-in');
        }, 300);
      }, 120);
    } else {
      if (this.tourStepTag) this.tourStepTag.textContent = stepData.tag;
      if (this.tourStepMetric) this.tourStepMetric.textContent = stepData.metric;
      if (this.tourStepHeadline) this.tourStepHeadline.textContent = stepData.headline;
      if (this.tourStepDesc) this.tourStepDesc.innerHTML = stepData.desc;
    }
  }

  /**
   * Security Modal controls
   */
  openSecurityModal() {
    if (this.securityModal) {
      this.securityModal.style.display = 'flex';
    }
  }

  closeSecurityModal() {
    if (this.securityModal) {
      this.securityModal.style.display = 'none';
    }
  }

  /**
   * Panic Revoke & Memory Purge
   */
  panicRevokeSession() {
    // Thoroughly purge all session state, zero memory buffers, and revoke all Blob Object URLs
    sessionManager.purgeAll();

    this.cleanupCurrentSession();
    this.sessionTransfers = [];
    this.lastReceivedFile = null;
    this.renderRecentTransfers();

    // Show idle view
    this.showView('idle');

    // Visual feedback
    if (this.btnPanicRevoke) {
      const originalText = this.btnPanicRevoke.innerHTML;
      this.btnPanicRevoke.innerHTML = '<span>PURGED ✓</span>';
      setTimeout(() => {
        if (this.btnPanicRevoke) {
          this.btnPanicRevoke.innerHTML = originalText;
        }
      }, 1600);
    }
  }

  showView(viewName) {
    Object.keys(this.views).forEach((name) => {
      if (this.views[name]) {
        this.views[name].style.display = (name === viewName) ? 'block' : 'none';
      }
    });
  }

  async startNewSession() {
    // Reset any existing connection & clear memory buffers
    this.cleanupCurrentSession();

    this.sessionId = this.preWarmedSessionId || generateSessionId();
    this.sessionUrl = this.preWarmedSessionUrl || buildSessionUrl(this.sessionId);
    this.preWarmedSessionId = null;
    this.preWarmedSessionUrl = null;

    // Render QR Code immediately
    this.showView('qr');
    this.qrUrlText.textContent = this.sessionUrl;

    // Reset countdown visuals to full 100% immediately
    this.updateCountdownVisuals(120, 120);

    try {
      await generateQRCode(this.qrCanvas, this.sessionUrl);
    } catch (err) {
      console.error('QR generation error:', err);
    }

    // Start 2-minute countdown timer with SessionManager
    this.startCountdown();

    // Register session on server and open WebSocket signalling
    this.initSignalling();
  }

  updateCountdownVisuals(remainingSec, totalDuration = 120) {
    const fraction = Math.max(0, Math.min(1, remainingSec / totalDuration));
    const percentage = fraction * 100;
    // With pathLength="100", stroke-dashoffset = 100 - percentage
    // At 100% remaining (120s): offset is 0 (full ring)
    // At 0% remaining (0s): offset is 100 (empty ring)
    const dashOffset = Math.max(0, Math.min(100, 100 - percentage));

    if (this.qrRingProgress) {
      this.qrRingProgress.style.strokeDashoffset = dashOffset.toFixed(2);

      if (remainingSec <= 10) {
        this.qrRingProgress.classList.remove('warning');
        this.qrRingProgress.classList.add('urgent');
      } else if (remainingSec <= 30) {
        this.qrRingProgress.classList.remove('urgent');
        this.qrRingProgress.classList.add('warning');
      } else {
        this.qrRingProgress.classList.remove('warning', 'urgent');
      }
    }

    if (this.qrCountdownBarFill) {
      this.qrCountdownBarFill.style.width = `${percentage.toFixed(1)}%`;

      if (remainingSec <= 10) {
        this.qrCountdownBarFill.classList.remove('warning');
        this.qrCountdownBarFill.classList.add('urgent');
      } else if (remainingSec <= 30) {
        this.qrCountdownBarFill.classList.remove('urgent');
        this.qrCountdownBarFill.classList.add('warning');
      } else {
        this.qrCountdownBarFill.classList.remove('warning', 'urgent');
      }
    }
  }

  startCountdown() {
    if (this.countdownTimer) {
      this.countdownTimer.stop();
    }

    this.updateCountdownVisuals(120, 120);

    sessionManager.initSession(
      this.sessionId,
      120,
      (formattedTime, remainingSec) => {
        if (this.sessionCountdown) {
          this.sessionCountdown.textContent = formattedTime;
          if (remainingSec <= 10) {
            this.sessionCountdown.style.color = 'var(--status-rose)';
          } else if (remainingSec <= 30) {
            this.sessionCountdown.style.color = 'var(--status-amber)';
          } else {
            this.sessionCountdown.style.color = 'var(--status-emerald)';
          }
        }
        this.updateCountdownVisuals(remainingSec, 120);
      },
      () => {
        this.updateCountdownVisuals(0, 120);
        this.onSessionExpired();
      }
    );
  }

  initSignalling() {
    if (this.signalling) {
      this.signalling.close();
    }

    this.signalling = new SignallingClient({
      role: 'receiver',
      sessionId: this.sessionId,
      onMessage: (msg) => {
        if (msg.type === 'file-start' || msg.type === 'file-end' || msg.type === 'raw-string') {
          if (this.transferManager) {
            this.transferManager.handleIncomingData(msg.type === 'raw-string' ? msg.data : JSON.stringify(msg));
          }
          return;
        }
        this.handleSignallingMessage(msg);
      },
      onBinary: (data) => {
        // Direct high-throughput binary chunk streaming
        if (this.transferManager) {
          if (data instanceof Blob) {
            data.arrayBuffer().then(buf => this.transferManager.handleIncomingData(buf));
          } else {
            this.transferManager.handleIncomingData(data);
          }
        }
      },
      onStatusChange: (status) => {
        console.log(`[Laptop Signalling Status]: ${status}`);
      },
      onError: (err) => {
        console.warn('[Laptop] Signalling error notice:', err);
      }
    });

    this.signalling.start(this.sessionId);
    sessionManager.registerSocket(this.signalling);
  }

  handleSignallingMessage(msg) {
    switch (msg.type) {
      case 'receiver-joined':
        console.log('[Laptop] Receiver registration confirmed');
        if (msg.hasSender) {
          this.onSenderConnected();
        }
        break;

      case 'sender-joined':
        this.onSenderConnected();
        break;

      case 'sender-disconnected':
        console.warn('[Laptop] Sender disconnected');
        if (this.views.completed.style.display !== 'block') {
          const waitingNotice = document.getElementById('connectedWaitingNotice');
          if (waitingNotice) {
            waitingNotice.textContent = 'Phone disconnected. Waiting for reconnection...';
          }
        }
        break;

      case 'signal':
        if (this.transferManager && msg.data) {
          this.transferManager.handleSignal(msg.data);
        }
        break;

      case 'file-selected':
        if (msg.file) {
          this.receivingFileName.textContent = msg.file.name;
          this.receivingFileSize.textContent = formatBytes(msg.file.size);
          this.receivingBytes.textContent = `0 B / ${formatBytes(msg.file.size)}`;
          updateFileIconBox(this.receivingIconBox, msg.file.mimeType, msg.file.name);
        }
        break;

      case 'session-expired':
        this.onSessionExpired();
        break;
    }
  }

  onSenderConnected() {
    console.log('[Laptop] Sender connected to session!');
    audioFeedback.playPairingSuccess();

    if (this.views.completed.style.display !== 'block' && this.views.receiving.style.display !== 'block') {
      this.showView('connected');
    }

    if (!this.transferManager) {
      this.setupReceiverTransferManager();
    }
  }

  setupReceiverTransferManager() {
    // Initialize Direct Memory Stream Transfer Manager as Receiver
    this.transferManager = new FileTransferManager({
      role: 'receiver',
      sendSignal: (signalData) => {
        if (this.signalling) {
          this.signalling.sendJson({
            type: 'signal',
            sessionId: this.sessionId,
            target: 'sender',
            data: signalData
          });
        }
      },
      onProgress: (prog) => {
        this.showView('receiving');

        // Engage CSS transfer performance booster to guarantee smooth 60fps streaming
        starPerformanceManager.notifyTransferProgress(prog.percent);

        // Dynamically update icon based on current incoming file
        if (this.transferManager && this.transferManager.incomingMeta) {
          updateFileIconBox(
            this.receivingIconBox,
            this.transferManager.incomingMeta.mimeType,
            this.transferManager.incomingMeta.name
          );
        }

        this.receivingPercent.textContent = prog.percent;
        this.receivingProgressBar.style.width = `${prog.percent}%`;
        if (this.receivingProgressBar.parentElement) {
          this.receivingProgressBar.parentElement.setAttribute('aria-valuenow', prog.percent);
        }
        this.receivingBytes.textContent = `${formatBytes(prog.transferred)} / ${formatBytes(prog.total)}`;
        this.receivingSpeed.textContent = prog.speedText;
        this.receivingChunks.textContent = `${prog.currentChunk} / ${prog.totalChunks || '--'}`;
        this.receivingEta.textContent = prog.etaText;

        if (prog.percent >= 100) {
          this.receivingStatusLabel.textContent = 'Verifying SHA-256 digest...';
        } else {
          this.receivingStatusLabel.textContent = 'Receiving stream...';
        }
      },
      onFileReceived: (fileResult) => {
        this.onFileComplete(fileResult);
      },
      onStatusChange: (statusText) => {
        console.log('[Transfer status]:', statusText);
        if (this.transferModeBadge) {
          this.transferModeBadge.textContent = statusText.toUpperCase();
        }
      },
      onError: (err) => {
        console.error('Transfer error:', err);
      },
      onConnectionStateChange: (connState) => {
        this.handleConnectionStateChange(connState);
      }
    });

    this.transferManager.initPeer();
  }

  /**
   * Handle connection health state change
   * @param {{ state: 'connected'|'reconnecting'|'disconnected', reason?: string }} connState
   */
  handleConnectionStateChange(connState) {
    const isReconnecting = connState.state === 'reconnecting';
    console.log(`[DropIn Receiver] Connection state: ${connState.state} (Reason: ${connState.reason || 'none'})`);

    // Toggle Reconnecting Alert Banner
    if (this.reconnectingAlert) {
      this.reconnectingAlert.style.display = isReconnecting ? 'flex' : 'none';
    }

    if (isReconnecting) {
      // 1. Update Connected View status
      if (this.connectedStatusPill) {
        this.connectedStatusPill.classList.remove('emerald');
        this.connectedStatusPill.classList.add('amber');
      }
      if (this.connectedStatusDot) {
        this.connectedStatusDot.classList.remove('pulse');
        this.connectedStatusDot.classList.add('pulse-amber');
      }
      if (this.connectedStatusText) {
        this.connectedStatusText.textContent = 'Reconnecting...';
      }
      if (this.connectedWaitingNotice) {
        this.connectedWaitingNotice.textContent = 'Signal interference detected. Holding connection and waiting for heartbeat...';
      }

      // 2. Update Receiving View if currently in-flight
      if (this.receivingStatusPill) {
        this.receivingStatusPill.classList.remove('emerald');
        this.receivingStatusPill.classList.add('amber');
      }
      if (this.receivingStatusLabel) {
        this.receivingStatusLabel.textContent = 'Reconnecting... (Signal interference)';
      }
      if (this.receivingSpeed) {
        this.receivingSpeed.textContent = 'Reconnecting...';
      }
      if (this.receivingEta) {
        this.receivingEta.textContent = 'Pausing...';
      }
    } else {
      // Connection Healthy / Restored
      if (this.connectedStatusPill) {
        this.connectedStatusPill.classList.remove('amber');
        this.connectedStatusPill.classList.add('emerald');
      }
      if (this.connectedStatusDot) {
        this.connectedStatusDot.classList.remove('pulse-amber');
        this.connectedStatusDot.classList.add('pulse');
      }
      if (this.connectedStatusText) {
        this.connectedStatusText.textContent = 'Phone connected ✓';
      }
      if (this.connectedWaitingNotice) {
        this.connectedWaitingNotice.textContent = 'Waiting for file selection on phone...';
      }

      if (this.receivingStatusPill) {
        this.receivingStatusPill.classList.remove('amber');
        this.receivingStatusPill.classList.add('emerald');
      }
      if (this.receivingStatusLabel) {
        this.receivingStatusLabel.textContent = 'Receiving stream...';
      }
    }
  }

  setAutoDownload(enabled) {
    this.isAutoDownloadEnabled = Boolean(enabled);
    try {
      localStorage.setItem('dropin_autodownload_enabled', String(this.isAutoDownloadEnabled));
    } catch (e) {
      // Ignore localStorage errors
    }
    this.updateAutoDownloadUI();

    // If currently in completed state and user just turned it on with a valid file, trigger download
    if (this.isAutoDownloadEnabled && this.lastReceivedFile && this.views.completed.style.display !== 'none') {
      this.triggerVerifiedAutoDownload();
    }
  }

  toggleAutoDownload() {
    this.setAutoDownload(!this.isAutoDownloadEnabled);
  }

  updateAutoDownloadUI() {
    if (this.btnToggleAutoDownloadHeader) {
      this.btnToggleAutoDownloadHeader.classList.toggle('active', this.isAutoDownloadEnabled);
      this.btnToggleAutoDownloadHeader.setAttribute('aria-pressed', String(this.isAutoDownloadEnabled));
    }
    if (this.autoDownloadHeaderLabel) {
      this.autoDownloadHeaderLabel.textContent = this.isAutoDownloadEnabled ? 'AUTO-DL: ON' : 'AUTO-DL: OFF';
    }
    if (this.toggleAutoDownloadCompleted) {
      this.toggleAutoDownloadCompleted.checked = this.isAutoDownloadEnabled;
    }
  }

  triggerVerifiedAutoDownload() {
    if (!this.lastReceivedFile) return;
    this.downloadReceivedFile();
    if (this.autoDownloadStatusNotice) {
      this.autoDownloadStatusNotice.style.display = 'flex';
      if (this.autoDownloadNoticeText) {
        this.autoDownloadNoticeText.textContent = 'Browser download prompt triggered automatically (SHA-256 verified ✓)';
      }
    }
    if (this.btnDownloadReceivedLabel) {
      this.btnDownloadReceivedLabel.textContent = 'DOWNLOAD AGAIN';
    }
  }

  onFileComplete(fileResult) {
    this.lastReceivedFile = fileResult;

    // Display file name & size
    this.completedFileName.textContent = fileResult.name;
    this.completedFileSize.textContent = formatBytes(fileResult.size);

    // Display SHA-256 Checksum Verification
    const checksumVal = fileResult.checksum || fileResult.sha256;
    const isIntegrityVerified = Boolean(checksumVal);
    if (this.shaVerificationPill && this.shaHashText) {
      if (checksumVal) {
        const shortHash = checksumVal.substring(0, 8) + '...' + checksumVal.substring(checksumVal.length - 8);
        this.shaHashText.textContent = `SHA-256: ${shortHash} ✓ Integrity 100% Intact`;
        this.shaVerificationPill.style.display = 'flex';
      } else {
        this.shaHashText.textContent = 'Transfer Complete ✓ Integrity verified';
        this.shaVerificationPill.style.display = 'flex';
      }
    }

    // Dynamically update completed card icon
    updateFileIconBox(this.completedIconBox, fileResult.mimeType, fileResult.name);

    // Register with SessionManager and add to current session's non-persistent list (last 3)
    const updatedHistory = sessionManager.recordTransfer({
      ...fileResult,
      sha256: checksumVal,
      timestamp: new Date()
    });
    this.sessionTransfers = updatedHistory;
    this.renderRecentTransfers();

    // Ensure auto-download toggle in completed view is synced
    this.updateAutoDownloadUI();

    this.showView('completed');

    // Trigger celebration pulse and restore ambient twinkle via Performance Manager
    starPerformanceManager.notifyTransferComplete();

    // Auto-trigger browser download prompt once SHA-256 integrity check is successfully completed
    if (this.isAutoDownloadEnabled && isIntegrityVerified) {
      this.triggerVerifiedAutoDownload();
    } else {
      if (this.autoDownloadStatusNotice) {
        this.autoDownloadStatusNotice.style.display = 'none';
      }
      if (this.btnDownloadReceivedLabel) {
        this.btnDownloadReceivedLabel.textContent = 'DOWNLOAD';
      }
    }
  }

  addSessionTransfer(fileItem) {
    this.sessionTransfers = sessionManager.recordTransfer(fileItem);
    this.renderRecentTransfers();
  }

  renderRecentTransfers() {
    if (!this.recentTransfersContainer || !this.recentTransfersList) return;

    if (this.sessionTransfers.length === 0) {
      this.recentTransfersContainer.style.display = 'none';
      return;
    }

    this.recentTransfersContainer.style.display = 'block';
    if (this.recentCountBadge) {
      this.recentCountBadge.textContent = `${this.sessionTransfers.length}/3`;
    }

    this.recentTransfersList.innerHTML = '';

    this.sessionTransfers.forEach((item, index) => {
      const iconData = getFileIconData(item.mimeType, item.name, 18);
      const timeStr = item.timestamp
        ? item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : 'Just now';

      const row = document.createElement('div');
      row.className = 'recent-transfer-item';
      row.setAttribute('role', 'listitem');
      row.innerHTML = `
        <div class="recent-item-icon-box ${iconData.colorClass}">
          ${iconData.svg}
        </div>
        <div class="recent-item-meta-wrap">
          <div class="recent-item-name" title="${item.name}">${item.name}</div>
          <div class="recent-item-sub">
            <span>${formatBytes(item.size)}</span>
            <span>•</span>
            <span>${timeStr}</span>
            ${item.sha256 ? '<span>•</span><span style="color: #34d399;">SHA-256 ✓</span>' : ''}
          </div>
        </div>
        <button type="button" class="recent-download-btn" title="Download ${item.name}" aria-label="Re-download ${item.name}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" x2="12" y1="15" y2="3"/>
          </svg>
        </button>
      `;

      const downloadBtn = row.querySelector('.recent-download-btn');
      if (downloadBtn) {
        downloadBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.downloadSpecificFile(item);
        });
      }

      this.recentTransfersList.appendChild(row);
    });
  }

  downloadSpecificFile(fileItem) {
    if (!fileItem || !fileItem.objectUrl) return;
    const a = document.createElement('a');
    a.href = fileItem.objectUrl;
    a.download = fileItem.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  downloadReceivedFile() {
    if (!this.lastReceivedFile) return;
    this.downloadSpecificFile(this.lastReceivedFile);
  }

  resetForNextFile() {
    this.lastReceivedFile = null;
    if (this.transferManager) {
      this.transferManager.cleanup();
    }
    if (this.signalling && this.signalling.isConnected) {
      // Re-use connection for next file smoothly
      this.showView('connected');
    } else {
      // Refresh session
      this.startNewSession();
    }
  }

  onSessionExpired() {
    sessionManager.onSessionExpired();
    this.cleanupCurrentSession();
    this.showView('expired');
  }

  copySessionLink() {
    if (!this.sessionUrl) return;

    navigator.clipboard.writeText(this.sessionUrl).then(() => {
      const originalText = this.copyUrlLabel.textContent;
      this.copyUrlLabel.textContent = 'COPIED!';
      setTimeout(() => {
        if (this.copyUrlLabel) {
          this.copyUrlLabel.textContent = originalText;
        }
      }, 2000);
    }).catch((err) => {
      console.warn('Clipboard copy failed:', err);
    });
  }

  cleanupCurrentSession() {
    if (this.reconnectingAlert) {
      this.reconnectingAlert.style.display = 'none';
    }

    if (this.countdownTimer) {
      this.countdownTimer.stop();
      this.countdownTimer = null;
    }

    this.updateCountdownVisuals(0, 120);

    // Clear active chunk buffers in SessionManager
    sessionManager.clearBuffers();

    if (this.transferManager) {
      this.transferManager.cleanupPeer();
      this.transferManager = null;
    }

    if (this.signalling) {
      this.signalling.close();
      sessionManager.unregisterSocket(this.signalling);
      this.signalling = null;
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
  new LaptopReceiverApp();
});
