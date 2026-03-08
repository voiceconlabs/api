(function() {
  const WIDGET_VERSION = '1.0.0';
  const API_BASE_URL = 'http://localhost:3800';

  class VoiceConfWidget {
    constructor(config) {
      this.config = config;
      this.room = null;
      this.isConnected = false;
      this.isMuted = false;
      this.isCallActive = false;
      this.init();
    }

    init() {
      this.injectStyles();
      this.createWidget();
      this.loadLiveKitSDK();
    }

    injectStyles() {
      const style = document.createElement('style');
      style.textContent = `
        .voiceconf-widget {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 999999;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        }

        .voiceconf-call-button {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border: none;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
        }

        .voiceconf-call-button:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 16px rgba(102, 126, 234, 0.6);
        }

        .voiceconf-call-button svg {
          width: 28px;
          height: 28px;
          fill: white;
        }

        .voiceconf-call-panel {
          position: absolute;
          bottom: 80px;
          right: 0;
          width: 320px;
          background: white;
          border-radius: 16px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
          padding: 24px;
          display: none;
          flex-direction: column;
          gap: 16px;
        }

        .voiceconf-call-panel.active {
          display: flex;
        }

        .voiceconf-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .voiceconf-panel-title {
          font-size: 18px;
          font-weight: 600;
          color: #1a202c;
        }

        .voiceconf-close-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          color: #718096;
        }

        .voiceconf-status {
          padding: 12px;
          background: #f7fafc;
          border-radius: 8px;
          text-align: center;
          font-size: 14px;
          color: #4a5568;
        }

        .voiceconf-status.connected {
          background: #c6f6d5;
          color: #22543d;
        }

        .voiceconf-status.connecting {
          background: #fef3c7;
          color: #78350f;
        }

        .voiceconf-controls {
          display: flex;
          gap: 12px;
          justify-content: center;
        }

        .voiceconf-control-btn {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .voiceconf-control-btn.mute {
          background: #e2e8f0;
        }

        .voiceconf-control-btn.mute:hover {
          background: #cbd5e0;
        }

        .voiceconf-control-btn.mute.active {
          background: #fc8181;
        }

        .voiceconf-control-btn.hangup {
          background: #fc8181;
        }

        .voiceconf-control-btn.hangup:hover {
          background: #f56565;
        }

        .voiceconf-control-btn svg {
          width: 20px;
          height: 20px;
          fill: #1a202c;
        }

        .voiceconf-control-btn.hangup svg {
          fill: white;
        }

        .voiceconf-powered {
          text-align: center;
          font-size: 11px;
          color: #a0aec0;
          margin-top: 8px;
        }

        .voiceconf-powered a {
          color: #667eea;
          text-decoration: none;
        }

        @keyframes voiceconf-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .voiceconf-connecting-indicator {
          animation: voiceconf-pulse 1.5s ease-in-out infinite;
        }
      `;
      document.head.appendChild(style);
    }

    createWidget() {
      const widget = document.createElement('div');
      widget.className = 'voiceconf-widget';
      widget.innerHTML = `
        <button class="voiceconf-call-button" id="voiceconf-toggle">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
          </svg>
        </button>
        <div class="voiceconf-call-panel" id="voiceconf-panel">
          <div class="voiceconf-panel-header">
            <div class="voiceconf-panel-title">Voice Call</div>
            <button class="voiceconf-close-btn" id="voiceconf-close">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"/>
              </svg>
            </button>
          </div>
          <div class="voiceconf-status" id="voiceconf-status">
            Click "Start Call" to begin
          </div>
          <div class="voiceconf-controls" id="voiceconf-controls" style="display:none;">
            <button class="voiceconf-control-btn mute" id="voiceconf-mute" title="Mute">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            </button>
            <button class="voiceconf-control-btn hangup" id="voiceconf-hangup" title="Hang Up">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.68-1.36-2.66-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
              </svg>
            </button>
          </div>
          <button class="voiceconf-control-btn" id="voiceconf-start" style="width:100%; height:48px; background:#667eea; color:white; font-weight:600; border-radius:8px;">
            Start Call
          </button>
          <div class="voiceconf-powered">
            Powered by <a href="https://voiceconf.com" target="_blank">VoiceConf</a>
          </div>
        </div>
      `;

      document.body.appendChild(widget);

      this.attachEventListeners();
    }

    attachEventListeners() {
      document.getElementById('voiceconf-toggle').addEventListener('click', () => {
        const panel = document.getElementById('voiceconf-panel');
        panel.classList.toggle('active');
      });

      document.getElementById('voiceconf-close').addEventListener('click', () => {
        document.getElementById('voiceconf-panel').classList.remove('active');
      });

      document.getElementById('voiceconf-start').addEventListener('click', () => {
        this.startCall();
      });

      document.getElementById('voiceconf-mute').addEventListener('click', () => {
        this.toggleMute();
      });

      document.getElementById('voiceconf-hangup').addEventListener('click', () => {
        this.endCall();
      });
    }

    loadLiveKitSDK() {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/livekit-client/dist/livekit-client.umd.min.js';
      script.onload = () => {
        console.log('[VoiceConf] LiveKit SDK loaded', typeof window.LivekitClient);
      };
      script.onerror = (error) => {
        console.error('[VoiceConf] SDK load error:', error);
        this.updateStatus('Failed to load voice SDK', 'error');
      };
      document.head.appendChild(script);
    }

    async startCall() {
      if (this.isCallActive) return;

      this.updateStatus('Connecting...', 'connecting');
      document.getElementById('voiceconf-start').style.display = 'none';
      document.getElementById('voiceconf-controls').style.display = 'flex';

      try {
        const response = await fetch(`${API_BASE_URL}/api/livekit/widget/call`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            callId: this.config.callId || `widget-${Date.now()}`,
            userId: this.config.userId || `guest-${Date.now()}`,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to create call session');
        }

        const { token, url, roomName } = await response.json();

        const LiveKit = window.LivekitClient || window.LiveKit;
        if (!LiveKit) {
          throw new Error('LiveKit SDK not loaded');
        }

        this.room = new LiveKit.Room();

        this.room.on('connected', () => {
          this.isConnected = true;
          this.isCallActive = true;
          this.updateStatus('Connected', 'connected');
        });

        this.room.on('disconnected', () => {
          this.handleDisconnect();
        });

        await this.room.connect(url, token);

        await this.room.localParticipant.setMicrophoneEnabled(true);

      } catch (error) {
        console.error('[VoiceConf] Call failed:', error);
        this.updateStatus('Call failed. Please try again.', 'error');
        this.resetUI();
      }
    }

    toggleMute() {
      if (!this.room) return;

      this.isMuted = !this.isMuted;
      this.room.localParticipant.setMicrophoneEnabled(!this.isMuted);

      const muteBtn = document.getElementById('voiceconf-mute');
      if (this.isMuted) {
        muteBtn.classList.add('active');
        this.updateStatus('Microphone muted', 'connected');
      } else {
        muteBtn.classList.remove('active');
        this.updateStatus('Connected', 'connected');
      }
    }

    async endCall() {
      if (this.room) {
        await this.room.disconnect();
      }
      this.handleDisconnect();
    }

    handleDisconnect() {
      this.isConnected = false;
      this.isCallActive = false;
      this.isMuted = false;
      this.room = null;
      this.updateStatus('Call ended', 'disconnected');
      this.resetUI();
    }

    resetUI() {
      document.getElementById('voiceconf-start').style.display = 'block';
      document.getElementById('voiceconf-controls').style.display = 'none';
      document.getElementById('voiceconf-mute').classList.remove('active');
    }

    updateStatus(message, state) {
      const statusEl = document.getElementById('voiceconf-status');
      statusEl.textContent = message;
      statusEl.className = 'voiceconf-status';

      if (state === 'connected') {
        statusEl.classList.add('connected');
      } else if (state === 'connecting') {
        statusEl.classList.add('connecting', 'voiceconf-connecting-indicator');
      }
    }
  }

  function initWidget() {
    const script = document.currentScript || document.querySelector('script[data-call-id]');

    if (!script) {
      console.error('[VoiceConf] Widget script not found');
      return;
    }

    const config = {
      callId: script.getAttribute('data-call-id'),
      userId: script.getAttribute('data-user-id'),
      position: script.getAttribute('data-position') || 'bottom-right',
      theme: script.getAttribute('data-theme') || 'default',
    };

    new VoiceConfWidget(config);
    console.log('[VoiceConf] Widget initialized', WIDGET_VERSION);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidget);
  } else {
    initWidget();
  }
})();
