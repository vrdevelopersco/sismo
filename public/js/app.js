// public/js/app.js
// Controlador principal de la aplicación DETECCION-SISMO (PWA + Desktop + Liquid Glass Bar)

import { SeismicMap } from './map.js';
import { SeismicAudioSynthesizer } from './audio.js';
import { SeismicWaveSimulator } from './waves.js';
import { SeismicTimelineController } from './timeline.js';

class SismoApp {
  constructor() {
    this.events = [];
    this.selectedEvent = null;
    this.currentTab = 'map';
    this.feedLimit = 40;
    this.filters = {
      country: 'colombia', // Default Colombia
      minMag: 0,
      maxDepth: 700,
      source: 'all',
      hours: 48
    };

    this.socket = null;
    this.audio = new SeismicAudioSynthesizer();
    this.map = null;
    this.waveSim = null;
    this.timeline = null;
    this.latestStats = null;

    this.init();
  }

  async init() {
    // 1. Registrar Service Worker para PWA
    this.registerPWA();

    // 2. Configurar listeners de la UI PRIMERO
    try {
      this.setupUIListeners();
      this.setupLiquidGlassNav();
    } catch (e) {
      console.error('Error configurando listeners de UI:', e);
    }

    // 3. Inicializar mapa Leaflet
    try {
      this.map = new SeismicMap(
        'map',
        (ev) => this.selectEvent(ev),
        (ev) => this.startWaveSimulation(ev)
      );
    } catch (e) {
      console.error('Error inicializando mapa:', e);
    }

    // 4. Inicializar simulador de ondas
    try {
      if (this.map?.map) {
        this.waveSim = new SeismicWaveSimulator(this.map.map);
      }
    } catch (e) {}

    // 5. Inicializar línea de tiempo
    try {
      this.timeline = new SeismicTimelineController((hours) => {
        this.filters.hours = hours;
        this.applyFiltersAndRender();
      });
    } catch (e) {}

    // 6. Escuchar evento custom de popup para áreas de impacto y ondas
    window.addEventListener('simulate_sismo_wave', (e) => {
      if (e.detail) {
        this.startWaveSimulation(e.detail);
      }
    });

    // 7. Cargar caché local válido (si existe)
    try {
      const cached = localStorage.getItem('sismo_events_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.events = parsed;
          this.applyFiltersAndRender();
        }
      }
    } catch (e) {}

    // 8. Carga rápida REST en segundo plano
    this.fastInitialLoad();

    // 9. Conectar WebSockets con Socket.io
    this.connectSocket();

    // 10. Sincronización periódica de métricas de base de datos cada 10s
    setInterval(() => this.fetchStats(), 10000);
  }

  registerPWA() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then((reg) => console.log('📱 [PWA] Service Worker activo:', reg.scope))
          .catch((err) => console.warn('⚠️ [PWA] Error en Service Worker:', err));
      });
    }
  }

  async fastInitialLoad() {
    try {
      const [sismosRes, statsRes] = await Promise.all([
        fetch('/api/sismos?limit=300').then((r) => r.json()),
        fetch('/api/stats').then((r) => r.json())
      ]);

      if (statsRes) {
        this.latestStats = statsRes;
        this.updateStats(statsRes);
      }

      if (sismosRes?.events) {
        this.events = sismosRes.events;
        try {
          localStorage.setItem('sismo_events_cache', JSON.stringify(this.events.slice(0, 150)));
        } catch (e) {}
        this.applyFiltersAndRender();
      }
    } catch (err) {
      console.warn('Carga rápida falló, esperando WebSocket:', err);
    }
  }

  connectSocket() {
    this.socket = io({
      extraHeaders: {
        'bypass-tunnel-reminder': 'true',
        'Bypass-Tunnel-Reminder': 'true'
      }
    });

    this.socket.on('connect', () => {
      console.log('⚡ Conectado al servidor DETECCION-SISMO en tiempo real.');
      const statusDot = document.getElementById('live-status-dot');
      const statusDotM = document.getElementById('live-status-dot-m');
      if (statusDot) statusDot.style.background = '#10b981';
      if (statusDotM) statusDotM.style.background = '#10b981';
    });

    this.socket.on('disconnect', () => {
      const statusDot = document.getElementById('live-status-dot');
      const statusDotM = document.getElementById('live-status-dot-m');
      if (statusDot) statusDot.style.background = '#ef4444';
      if (statusDotM) statusDotM.style.background = '#ef4444';
    });

    // Recibir datos iniciales
    this.socket.on('init_data', (data) => {
      if (data.events && data.events.length > 0) {
        this.events = data.events;
        try {
          localStorage.setItem('sismo_events_cache', JSON.stringify(this.events.slice(0, 150)));
        } catch (e) {}
        this.applyFiltersAndRender();
      }
      if (data.stats) {
        this.latestStats = data.stats;
        this.updateStats(data.stats);
      }
    });

    // Desbloquear AudioContext en el primer clic del usuario
    const unlockAudio = () => {
      this.audio.initContext();
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);

    // Evento en vivo de nuevo sismo
    this.socket.on('sismo_nuevo', (newEvent) => {
      console.log(`🔔 [NUEVO SISMO EN VIVO] M${newEvent.magnitude} - ${newEvent.place}`);
      
      // 1. Reproducir sonido acústico si está activado
      this.audio.playAlert(newEvent.magnitude);

      // 2. Notificación nativa
      this.showDesktopNotification(newEvent);

      // 3. Mostrar badge en Feed tab si no estamos en feed
      if (this.currentTab !== 'feed') {
        const badge = document.getElementById('nav-feed-badge');
        if (badge) badge.style.display = 'block';
      }

      // 4. Insertar al inicio del listado y mapa
      this.events = [newEvent, ...this.events.filter((e) => e.id !== newEvent.id)];

      this.applyFiltersAndRender();
      this.fetchStats();
    });

    // Evento de actualización de sismo existente
    this.socket.on('sismo_actualizado', (updatedEvent) => {
      this.events = this.events.map((e) => (e.id === updatedEvent.id ? updatedEvent : e));
      this.applyFiltersAndRender();
    });
  }

  async fetchStats() {
    try {
      const res = await fetch('/api/stats');
      const stats = await res.json();
      this.latestStats = stats;
      this.updateStats(stats);
    } catch (e) {
      console.warn('Error al actualizar stats:', e);
    }
  }

  updateStats(stats) {
    if (!stats) return;
    const total24h = document.getElementById('stat-total-24h');
    const col24h = document.getElementById('stat-colombia-24h');
    const strong24h = document.getElementById('stat-strongest');
    const multiCount = document.getElementById('stat-multisource');
    const dbTotal = document.getElementById('db-total-records');

    const mTotal = document.getElementById('m-stat-total');
    const mCol = document.getElementById('m-stat-colombia');
    const mStrong = document.getElementById('m-stat-strongest');
    const mMulti = document.getElementById('m-stat-multi');
    const mDb = document.getElementById('m-db-count');
    const mHeaderStrongest = document.getElementById('m-header-strongest');

    const strongestStr = stats.strongest24h ? `M${stats.strongest24h.magnitude}` : '—';

    if (total24h) total24h.textContent = stats.totalLast24h || 0;
    if (col24h) col24h.textContent = stats.totalColombia24h || 0;
    if (strong24h) strong24h.textContent = strongestStr;
    if (multiCount) multiCount.textContent = stats.multiSourceCount || 0;
    if (dbTotal && stats.database) {
      dbTotal.textContent = `${stats.database.totalRecords || 0} guardados`;
    }

    // Actualizar campos móviles
    if (mTotal) mTotal.textContent = stats.totalLast24h || 0;
    if (mCol) mCol.textContent = stats.totalColombia24h || 0;
    if (mStrong) mStrong.textContent = strongestStr;
    if (mMulti) mMulti.textContent = stats.multiSourceCount || 0;
    if (mDb && stats.database) mDb.textContent = `${stats.database.totalRecords || 0} registros`;
    if (mHeaderStrongest) mHeaderStrongest.textContent = strongestStr !== '—' ? `Max ${strongestStr}` : 'Sin sismos hoy';

    // Estados de servicios
    if (stats.services) {
      const sgcTag = document.getElementById('m-status-sgc');
      const usgsTag = document.getElementById('m-status-usgs');
      const emscTag = document.getElementById('m-status-emsc');

      if (sgcTag) sgcTag.textContent = stats.services.sgc?.status === 'ok' ? 'En Línea' : 'Reconectando';
      if (usgsTag) usgsTag.textContent = stats.services.usgs?.status === 'ok' ? 'En Línea' : 'Reconectando';
      if (emscTag) emscTag.textContent = stats.services.emsc?.status === 'ok' ? 'En Línea' : 'Reconectando';
    }
  }

  applyFiltersAndRender() {
    let filtered = [...this.events];

    // Filtro por Región / País
    if (this.filters.country === 'colombia') {
      filtered = filtered.filter((e) => e.isColombia);
    }

    // Filtro por Magnitud Mínima
    if (this.filters.minMag > 0) {
      filtered = filtered.filter((e) => e.magnitude >= this.filters.minMag);
    }

    // Filtro por Profundidad Máxima
    if (this.filters.maxDepth < 700) {
      filtered = filtered.filter((e) => e.depth <= this.filters.maxDepth);
    }

    // Filtro por Fuente
    if (this.filters.source !== 'all') {
      filtered = filtered.filter((e) => e.sources.includes(this.filters.source.toUpperCase()));
    }

    // Filtro por Horas
    if (this.filters.hours) {
      const cutoff = Date.now() - this.filters.hours * 3600 * 1000;
      filtered = filtered.filter((e) => new Date(e.time).getTime() >= cutoff);
    }

    // Renderizar en mapa
    this.map.renderEvents(filtered);

    // Renderizar lista en Sidebar
    this.renderFeed(filtered);

    // Actualizar contador en sidebar
    const countElem = document.getElementById('feed-count');
    if (countElem) countElem.textContent = `${filtered.length} eventos`;
  }

  renderFeed(events) {
    const feedContainer = document.getElementById('sismo-feed');
    if (!feedContainer) return;

    if (events.length === 0) {
      feedContainer.innerHTML = `
        <div style="padding: 20px; text-align: center; color: var(--text-dim); font-size: 0.8rem;">
          No hay sismos registrados con los filtros actuales.
        </div>
      `;
      return;
    }

    const now = Date.now();
    const displayLimit = this.feedLimit || 40;
    const visibleEvents = events.slice(0, displayLimit);
    let html = '';

    for (const ev of visibleEvents) {
      if (!ev) continue;
      const ageMin = Math.round((now - new Date(ev.time || Date.now()).getTime()) / (60 * 1000));
      const isRecent = ageMin <= 30;
      const isSelected = this.selectedEvent?.id === ev.id;
      const depthColor = ev.depthCategory?.color || '#f97316';
      
      let magColor = '#10b981';
      const magNum = Number(ev.magnitude) || 0;
      if (magNum >= 5.0) magColor = '#ef4444';
      else if (magNum >= 4.0) magColor = '#f59e0b';
      else if (magNum >= 3.0) magColor = '#3b82f6';

      const validSources = Array.isArray(ev.sources) ? ev.sources.filter((s) => s && typeof s === 'string') : [ev.primarySource || 'SGC'];
      const sourceBadges = validSources
        .map((s) => `<span class="source-badge source-${s.toLowerCase()}">${s}</span>`)
        .join(' ');

      const timeAgoStr = isNaN(ageMin) || ageMin < 1 ? 'Hace segundos' : ageMin < 60 ? `Hace ${ageMin}m` : `Hace ${Math.round(ageMin/60)}h`;

      html += `
        <div class="feed-item ${isSelected ? 'selected' : ''} ${isRecent ? 'recent' : ''}" data-id="${ev.id}">
          <div class="mag-badge" style="background: ${magColor}">
            ${magNum.toFixed(1)}
          </div>
          <div class="feed-info">
            <div class="feed-place">${ev.place || 'Ubicación registrada'}</div>
            <div class="feed-meta">
              <span class="feed-depth" style="color:${depthColor}">Prof: ${ev.depth || 0} km</span>
              <span class="feed-time">${timeAgoStr}</span>
            </div>
            <div class="feed-footer">
              <div class="sources-list">${sourceBadges}</div>
              <span style="font-size:0.62rem; color:${ev.mmi?.color || '#94a3b8'}">${ev.mmi?.label?.split('-')[0] || ''}</span>
            </div>
          </div>
        </div>
      `;
    }

    if (events.length > displayLimit) {
      html += `
        <button id="btn-load-more-feed" class="btn btn-outline" style="width:100%; margin-top:6px; justify-content:center; font-size:0.72rem; padding:8px;">
          Ver más sismos (${events.length - displayLimit} restantes)
        </button>
      `;
    }

    feedContainer.innerHTML = html;

    const loadMoreBtn = document.getElementById('btn-load-more-feed');
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', () => {
        this.feedLimit = (this.feedLimit || 40) + 40;
        this.renderFeed(events);
      });
    }

    // Delegación de eventos única
    if (!this._feedListenerAttached) {
      feedContainer.addEventListener('click', (e) => {
        const item = e.target.closest('.feed-item');
        if (!item) return;
        const id = item.getAttribute('data-id');
        const ev = this.events.find((x) => x.id === id);
        if (ev) {
          this.selectEvent(ev);
          // En móvil, si se seleccionó desde el feed, cerrar feed sheet para ver mapa
          if (window.innerWidth <= 900) {
            this.switchTab('map');
          }
        }
      });
      this._feedListenerAttached = true;
    }
  }

  selectEvent(ev) {
    this.selectedEvent = ev;
    this.map.focusEvent(ev);

    // Marcar item en sidebar
    document.querySelectorAll('.feed-item').forEach((el) => {
      el.classList.toggle('selected', el.getAttribute('data-id') === ev.id);
    });
  }

  startWaveSimulation(ev) {
    this.selectEvent(ev);
    this.waveSim.start(ev);

    // En móvil, abrir automáticamente la hoja de ondas
    if (window.innerWidth <= 900) {
      this.switchTab('waves');
    }
  }

  // 🌟 Liquid Glass Navigation Bar & Mobile Sheet Switcher
  setupLiquidGlassNav() {
    const tabs = document.querySelectorAll('.liquid-glass-bar .nav-tab');
    const tracker = document.getElementById('nav-pill-tracker');

    const updateTracker = (targetTab) => {
      if (!tracker || !targetTab) return;
      const nav = document.querySelector('.liquid-glass-bar');
      if (!nav) return;

      const navRect = nav.getBoundingClientRect();
      const tabRect = targetTab.getBoundingClientRect();
      const offsetLeft = tabRect.left - navRect.left;

      tracker.style.transform = `translateX(${offsetLeft - 6}px)`;
      tracker.style.width = `${tabRect.width}px`;
    };

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const tabId = tab.getAttribute('data-tab');
        this.triggerHaptic();
        this.switchTab(tabId);
      });
    });

    // Posición inicial del tracker
    setTimeout(() => {
      const activeTab = document.querySelector('.liquid-glass-bar .nav-tab.active');
      if (activeTab) updateTracker(activeTab);
    }, 150);

    window.addEventListener('resize', () => {
      const activeTab = document.querySelector('.liquid-glass-bar .nav-tab.active');
      if (activeTab) updateTracker(activeTab);
    });

    // Listeners de botones de cierre en sheets móviles
    const closeFeedBtn = document.getElementById('btn-close-feed-sheet');
    if (closeFeedBtn) {
      closeFeedBtn.addEventListener('click', () => this.switchTab('map'));
    }

    const closeStatsBtn = document.getElementById('btn-close-stats-sheet');
    if (closeStatsBtn) {
      closeStatsBtn.addEventListener('click', () => this.switchTab('map'));
    }
  }

  switchTab(tabId) {
    this.currentTab = tabId;

    // 1. Actualizar clases del navbar
    const tabs = document.querySelectorAll('.liquid-glass-bar .nav-tab');
    tabs.forEach((t) => {
      const isActive = t.getAttribute('data-tab') === tabId;
      t.classList.toggle('active', isActive);
      if (isActive) {
        const tracker = document.getElementById('nav-pill-tracker');
        const nav = document.querySelector('.liquid-glass-bar');
        if (tracker && nav) {
          const navRect = nav.getBoundingClientRect();
          const tabRect = t.getBoundingClientRect();
          tracker.style.transform = `translateX(${tabRect.left - navRect.left - 6}px)`;
          tracker.style.width = `${tabRect.width}px`;
        }
      }
    });

    const sidebar = document.getElementById('app-sidebar');
    const wavePanel = document.getElementById('wave-eta-panel');
    const statsModal = document.getElementById('stats-sheet-modal');
    const settingsModal = document.getElementById('settings-modal');

    // 2. Gestionar vistas según el tab
    if (tabId === 'map') {
      if (sidebar) sidebar.classList.remove('sheet-open');
      if (wavePanel) wavePanel.classList.remove('sheet-open');
      if (statsModal) statsModal.style.display = 'none';
      if (settingsModal) settingsModal.style.display = 'none';
      setTimeout(() => this.map?.map?.invalidateSize(), 200);
    } else if (tabId === 'feed') {
      if (sidebar) sidebar.classList.add('sheet-open');
      if (wavePanel) wavePanel.classList.remove('sheet-open');
      if (statsModal) statsModal.style.display = 'none';
      if (settingsModal) settingsModal.style.display = 'none';

      // Limpiar badge de feed
      const badge = document.getElementById('nav-feed-badge');
      if (badge) badge.style.display = 'none';
    } else if (tabId === 'waves') {
      if (sidebar) sidebar.classList.remove('sheet-open');
      if (statsModal) statsModal.style.display = 'none';
      if (settingsModal) settingsModal.style.display = 'none';

      // Si no hay sismo seleccionado, simular el más reciente
      if (!this.selectedEvent && this.events.length > 0) {
        this.startWaveSimulation(this.events[0]);
      } else {
        if (wavePanel) {
          wavePanel.style.display = 'block';
          wavePanel.classList.add('sheet-open');
        }
      }
    } else if (tabId === 'stats') {
      if (sidebar) sidebar.classList.remove('sheet-open');
      if (wavePanel) wavePanel.classList.remove('sheet-open');
      if (settingsModal) settingsModal.style.display = 'none';
      if (statsModal) {
        this.updateStats(this.latestStats);
        statsModal.style.display = 'flex';
      }
    } else if (tabId === 'settings') {
      if (sidebar) sidebar.classList.remove('sheet-open');
      if (wavePanel) wavePanel.classList.remove('sheet-open');
      if (statsModal) statsModal.style.display = 'none';
      if (settingsModal) {
        // Cargar valores actuales de localStorage
        const sgcVal = localStorage.getItem('sismo_sgc_interval') || '30';
        const usgsVal = localStorage.getItem('sismo_usgs_interval') || '30';
        const minSound = localStorage.getItem('sismo_min_sound') || '3.5';

        const sgcSelect = document.getElementById('setting-sgc-interval');
        const usgsSelect = document.getElementById('setting-usgs-interval');
        const soundSelect = document.getElementById('setting-min-sound');

        if (sgcSelect) sgcSelect.value = sgcVal;
        if (usgsSelect) usgsSelect.value = usgsVal;
        if (soundSelect) soundSelect.value = minSound;

        settingsModal.style.display = 'flex';
      }
    }
  }

  triggerHaptic() {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(12);
      } catch (e) {}
    }
  }

  setupUIListeners() {
    // Filtro Región (Colombia vs Global)
    const countrySelect = document.getElementById('filter-country');
    if (countrySelect) {
      countrySelect.addEventListener('change', (e) => {
        this.filters.country = e.target.value;
        this.applyFiltersAndRender();
      });
    }

    // Filtro Magnitud Mínima
    const magSelect = document.getElementById('filter-min-mag');
    if (magSelect) {
      magSelect.addEventListener('change', (e) => {
        this.filters.minMag = Number(e.target.value);
        this.applyFiltersAndRender();
      });
    }

    // Filtro Fuente
    const sourceSelect = document.getElementById('filter-source');
    if (sourceSelect) {
      sourceSelect.addEventListener('change', (e) => {
        this.filters.source = e.target.value;
        this.applyFiltersAndRender();
      });
    }

    // Filtro Horas
    const hoursSelect = document.getElementById('filter-hours');
    if (hoursSelect) {
      hoursSelect.addEventListener('change', (e) => {
        this.filters.hours = Number(e.target.value);
        this.applyFiltersAndRender();
      });
    }

    // Toggles de Capas Geológicas
    const platesCheck = document.getElementById('layer-plates');
    if (platesCheck) {
      platesCheck.addEventListener('change', (e) => this.map.togglePlates(e.target.checked));
    }

    const faultsCheck = document.getElementById('layer-faults');
    if (faultsCheck) {
      faultsCheck.addEventListener('change', (e) => this.map.toggleFaults(e.target.checked));
    }

    // Selector de tema de mapa
    const mapThemeSelect = document.getElementById('map-theme');
    if (mapThemeSelect) {
      const savedTheme = localStorage.getItem('sismo_map_theme') || 'dark';
      mapThemeSelect.value = savedTheme;
      mapThemeSelect.addEventListener('change', (e) => {
        this.map.setTileTheme(e.target.value);
      });
    }

    // Botones de sonido (Desktop y Móvil)
    const audioBtn = document.getElementById('btn-sound-toggle');
    const audioBtnM = document.getElementById('btn-sound-toggle-m');

    const handleSoundToggle = () => {
      this.triggerHaptic();
      const enabled = this.audio.toggle();
      if (audioBtn) {
        audioBtn.innerHTML = enabled ? '🔊 Sonido: ON' : '🔇 Sonido: OFF';
        audioBtn.classList.toggle('btn-outline', !enabled);
      }
      if (audioBtnM) {
        audioBtnM.innerHTML = enabled ? '🔊' : '🔇';
        audioBtnM.style.background = enabled ? 'rgba(59, 130, 246, 0.3)' : 'var(--surface2)';
      }
    };

    if (audioBtn) audioBtn.addEventListener('click', handleSoundToggle);
    if (audioBtnM) audioBtnM.addEventListener('click', handleSoundToggle);

    // Cerrar panel de simulación de ondas
    const closeWaveBtn = document.getElementById('btn-close-wave');
    if (closeWaveBtn) {
      closeWaveBtn.addEventListener('click', () => {
        this.waveSim.stop();
        const wavePanel = document.getElementById('wave-eta-panel');
        if (wavePanel) {
          wavePanel.style.display = 'none';
          wavePanel.classList.remove('sheet-open');
        }
        if (window.innerWidth <= 900) {
          this.switchTab('map');
        }
      });
    }

    // Botones de Refresco Manual
    const refreshBtn = document.getElementById('btn-refresh');
    const mRefreshBtn = document.getElementById('m-btn-refresh');

    const handleRefresh = async (btn) => {
      this.triggerHaptic();
      if (btn) {
        btn.innerHTML = '⏳ Actualizando...';
        btn.style.opacity = '0.7';
      }
      try {
        await fetch('/api/refresh', { method: 'POST' });
        await this.fastInitialLoad();
      } catch (e) {
        console.warn('Error en refresco:', e);
      } finally {
        if (btn) {
          btn.innerHTML = btn.id === 'm-btn-refresh' ? '🔄 Forzar Refresco Ahora' : '🔄 Actualizar';
          btn.style.opacity = '1';
        }
      }
    };

    if (refreshBtn) refreshBtn.addEventListener('click', () => handleRefresh(refreshBtn));
    if (mRefreshBtn) mRefreshBtn.addEventListener('click', () => handleRefresh(mRefreshBtn));

    // Modal de Ajustes
    const settingsBtn = document.getElementById('btn-settings');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsBtn = document.getElementById('btn-close-settings');
    const cancelSettingsBtn = document.getElementById('btn-cancel-settings');
    const formSettings = document.getElementById('form-settings');

    if (settingsBtn && settingsModal) {
      settingsBtn.addEventListener('click', () => {
        this.switchTab('settings');
      });
    }

    const hideSettings = () => {
      if (settingsModal) settingsModal.style.display = 'none';
      if (window.innerWidth <= 900) {
        this.switchTab('map');
      }
    };

    if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', hideSettings);
    if (cancelSettingsBtn) cancelSettingsBtn.addEventListener('click', hideSettings);

    if (formSettings) {
      formSettings.addEventListener('submit', async (e) => {
        e.preventDefault();
        const sgcSec = document.getElementById('setting-sgc-interval')?.value || '30';
        const usgsSec = document.getElementById('setting-usgs-interval')?.value || '30';
        const minSound = document.getElementById('setting-min-sound')?.value || '3.5';

        localStorage.setItem('sismo_sgc_interval', sgcSec);
        localStorage.setItem('sismo_usgs_interval', usgsSec);
        localStorage.setItem('sismo_min_sound', minSound);

        try {
          await fetch('/api/config/polling', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sgcIntervalSec: Number(sgcSec), usgsIntervalSec: Number(usgsSec) })
          });
        } catch (err) {
          console.warn('Error guardando configuración:', err);
        }

        hideSettings();
      });
    }

    // Botón de Notificaciones de Escritorio
    const notifBtn = document.getElementById('btn-notif-toggle');
    if (notifBtn) {
      this.updateNotifButtonState(notifBtn);
      notifBtn.addEventListener('click', async () => {
        if ('Notification' in window) {
          const perm = await Notification.requestPermission();
          this.updateNotifButtonState(notifBtn);
          if (perm === 'granted') {
            new Notification('🌍 DETECCION-SISMO', {
              body: '¡Notificaciones activadas con éxito! Recibirás alertas inmediatas de sismos.',
              icon: '/icons/icon-192.png'
            });
          }
        }
      });
    }
  }

  updateNotifButtonState(btn) {
    if (!('Notification' in window)) {
      btn.style.display = 'none';
      return;
    }
    if (Notification.permission === 'granted') {
      btn.innerHTML = '🔔 Notificaciones: ON';
      btn.classList.remove('btn-outline');
      btn.style.background = '#10b981';
    } else if (Notification.permission === 'denied') {
      btn.innerHTML = '🔕 Notificaciones: Bloqueadas';
      btn.classList.add('btn-outline');
    } else {
      btn.innerHTML = '🔔 Activar Notificaciones';
      btn.classList.add('btn-outline');
    }
  }

  showDesktopNotification(event) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const title = `🚨 SISMO M${event.magnitude} — ${event.place}`;
    const body = `Profundidad: ${event.depth} km (${event.depthCategory?.category})\nIntensidad: ${event.mmi?.label}\nRedes: ${event.sources.join(', ')}`;

    const notif = new Notification(title, {
      body,
      tag: event.id,
      renotify: true,
      icon: '/icons/icon-192.png'
    });

    notif.onclick = () => {
      window.focus();
      this.selectEvent(event);
      this.startWaveSimulation(event);
    };
  }
}

// Iniciar aplicación asegurando ejecución inmediata
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.app = new SismoApp();
  });
} else {
  window.app = new SismoApp();
}
