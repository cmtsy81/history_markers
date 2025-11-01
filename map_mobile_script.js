/**
 * map_mobile_script.js
 * Mobile-only script: Bottom panel %15 + Detay button → Fullscreen
 * + Floating controls (Dil + Konum Bul) + Geolocation
 */

let isMobileMode = () => {
  // Touch capability ve ekran genişliğine göre mobile mode
  return window.matchMedia("(max-width: 768px) and (hover: none) and (pointer: coarse)").matches;
};

let mobilePanel = null;
let detailsPanel = document.getElementById('detailsPanel');
let userLocationMarker = null;
let watchPositionId = null;

// ===== FLOATING CONTROLS (Dil + Konum Bul) =====

function createFloatingControls() {
  if (document.getElementById('floatingControls')) return;

  const container = document.createElement('div');
  container.id = 'floatingControls';
  container.style.cssText = `
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 998;
    display: flex;
    flex-direction: row;
    gap: 10px;
    align-items: center;
  `;

  // Dil butonları
  const langContainer = document.createElement('div');
  langContainer.style.cssText = `
    display: flex;
    gap: 6px;
    background: #ffffff;
    padding: 8px;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  `;

  ['tr', 'en', 'de', 'fr'].forEach(lang => {
    const btn = document.createElement('button');
    btn.textContent = lang.toUpperCase();
    btn.className = lang === currentLang ? 'lang-btn active' : 'lang-btn';
    btn.dataset.lang = lang;
    btn.style.cssText = `
      width: 32px;
      height: 32px;
      border: 1px solid #e0e0e0;
      background: ${lang === currentLang ? '#0099ff' : '#f8f9fa'};
      color: ${lang === currentLang ? '#ffffff' : '#888'};
      border-radius: 4px;
      cursor: pointer;
      font-weight: 600;
      font-size: 11px;
      transition: all 0.2s;
    `;
    btn.addEventListener('click', () => changeMobileLanguage(lang));
    langContainer.appendChild(btn);
  });

  // Konum bul butonu
  const locationBtn = document.createElement('button');
  locationBtn.id = 'locationBtn';
  locationBtn.textContent = '📍';
  locationBtn.style.cssText = `
    width: 44px;
    height: 44px;
    border: none;
    background: #0099ff;
    color: #ffffff;
    border-radius: 50%;
    cursor: pointer;
    font-size: 20px;
    box-shadow: 0 2px 8px rgba(0,153,255,0.3);
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  `;


  let isTracking = false;

  locationBtn.addEventListener('click', () => {
    if (isTracking) {
      // Tracking aktifse durdur
      stopLocationTracking();
      if (userLocationMarker) map.removeLayer(userLocationMarker);
      userLocationMarker = null;
      locationBtn.style.opacity = '0.5';  // Mat yap (kapalı)
      locationBtn.textContent = '📍';
      isTracking = false;
    } else {
      // Tracking kapalıysa başlat
      locationBtn.style.opacity = '1';  // Parlak yap (açık)
      requestUserLocation();
      isTracking = true;
    }
  });

// Başlangıçta mat yap
  locationBtn.style.opacity = '0.5';
  
  locationBtn.addEventListener('mouseover', () => {
    locationBtn.style.transform = 'scale(1.1)';
    locationBtn.style.boxShadow = '0 4px 12px rgba(0,153,255,0.4)';
  });
  locationBtn.addEventListener('mouseout', () => {
    locationBtn.style.transform = 'scale(1)';
    locationBtn.style.boxShadow = '0 2px 8px rgba(0,153,255,0.3)';
  });
  

  container.appendChild(langContainer);
  container.appendChild(locationBtn);
  document.body.appendChild(container);

  
}

// Dil değiştir (mobile)
function changeMobileLanguage(lang) {
  currentLang = lang;
  
  // Dil butonlarını güncelle
  document.querySelectorAll('#floatingControls .lang-btn').forEach(btn => {
    if (btn.dataset.lang === lang) {
      btn.style.background = '#0099ff';
      btn.style.color = '#ffffff';
      btn.classList.add('active');
    } else {
      btn.style.background = '#f8f9fa';
      btn.style.color = '#888';
      btn.classList.remove('active');
    }
  });

  loadCategories();
  throttledUpdateMarkers();
  throttledUpdateList();

  if (currentHeavyLocation) {
    showDetails(currentHeavyLocation);
  }

// Mobile panel açıksa güncelle
    if (selectedLocationId && mobilePanel && mobilePanel.style.display === 'flex') {
    const location = geoIndexData.find(loc => loc.id === selectedLocationId);
    if (location) {
        const title = location.translations?.[currentLang]?.title || location.id;
        const categoryName = allCategories[location.categoryKey] || '-';
        document.getElementById('mobileTitle').textContent = title;
        document.getElementById('mobileCategory').textContent = `${location.city} • ${categoryName}`;
    }
}
}

// ===== GEOLOCATION =====

function requestUserLocation() {
  if (!navigator.geolocation) {
    showNotification('Geolocation desteklenmiyor', 'error');
    return;
  }

  const btn = document.getElementById('locationBtn');
  btn.style.opacity = '0.5';
  btn.style.pointerEvents = 'none';

  // İlk konum al
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      centerMapOnUserLocation(latitude, longitude);
      showUserMarker(latitude, longitude);
      
      // Sürekli tracking başlat
      startLocationTracking();
      
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
      showNotification('✅ Konumunuz bulundu', 'info');
    },
    (error) => {
      console.error('Geolocation error:', error);
      showNotification('❌ Konum alınamadı: ' + error.message, 'error');
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
}

function centerMapOnUserLocation(lat, lng) {
  map.setView([lat, lng], 16);
}

function showUserMarker(lat, lng) {
  if (userLocationMarker) {
    userLocationMarker.setLatLng([lat, lng]);
  } else {
    userLocationMarker = L.marker([lat, lng], {
      icon: L.icon({
        iconUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIxNiIgZmlsbD0iIzAwOTlmZiIgb3BhY2l0eT0iMC4zIi8+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iOCIgZmlsbD0iIzAwOTlmZiIvPjwvc3ZnPg==',
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        popupAnchor: [0, -20]
      })
    }).addTo(map);
  }
}

function startLocationTracking() {
  if (watchPositionId) {
    navigator.geolocation.clearWatch(watchPositionId);
  }

  watchPositionId = navigator.geolocation.watchPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      showUserMarker(latitude, longitude);
      centerMapOnUserLocation(latitude, longitude);
    },
    (error) => {
      console.error('Tracking error:', error);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
}

function stopLocationTracking() {
  if (watchPositionId) {
    navigator.geolocation.clearWatch(watchPositionId);
    watchPositionId = null;
  }
  if (userLocationMarker) {
    map.removeLayer(userLocationMarker);
    userLocationMarker = null;
  }
}

// ===== MOBILE PANEL (Existing Code) =====

function createMobilePanel() {
  if (document.getElementById('mobilePanelWrapper')) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'mobilePanelWrapper';
  wrapper.style.cssText = `
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 15vh;
    background: #ffffff;
    border-top: 1px solid #e8e8e8;
    z-index: 999;
    display: none;
    flex-direction: column;
    padding: 12px;
    overflow-y: auto;
    box-shadow: 0 -2px 8px rgba(0,0,0,0.06);
    animation: slideUp 0.3s ease;
  `;

  wrapper.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: start; gap: 8px;">
      <div style="flex: 1;">
        <h3 id="mobileTitle" style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #1a1a1a;">-</h3>
        <p id="mobileCategory" style="margin: 0; font-size: 12px; color: #999;">-</p>
      </div>
      <button id="detailBtn" style="
        padding: 8px 16px;
        background: #0099ff;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
        font-size: 12px;
        white-space: nowrap;
        flex-shrink: 0;
      ">Detay</button>
      <button id="closeMobileBtn" style="
        background: none;
        border: none;
        color: #ddd;
        cursor: pointer;
        font-size: 24px;
        padding: 0;
        flex-shrink: 0;
      ">✕</button>
    </div>
  `;

  document.body.appendChild(wrapper);
  mobilePanel = wrapper;

  document.getElementById('detailBtn').addEventListener('click', openFullscreen);
  document.getElementById('closeMobileBtn').addEventListener('click', closeMobilePanel);
}

function openMobilePanel(locationId) {
  if (!isMobileMode()) return;

  createMobilePanel();

  const location = geoIndexData.find(loc => loc.id === locationId);
  if (!location) return;

  const title = location.translations?.[currentLang]?.title || location.id;
  const categoryName = allCategories[location.categoryKey] || '-';

  document.getElementById('mobileTitle').textContent = title;
  document.getElementById('mobileCategory').textContent = `${location.city} • ${categoryName}`;

  mobilePanel.style.display = 'flex';
}

async function openFullscreen() {
  if (!selectedLocationId) return;

  detailsPanel.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100vh !important;
    max-height: 100vh !important;
    z-index: 2000 !important;
    border: none !important;
    padding: 16px !important;
    display: block !important;
    overflow-y: auto !important;
    background: #ffffff !important;
    animation: slideUp 0.3s ease !important;
  `;

  if (mobilePanel) mobilePanel.style.display = 'none';

  const overlay = document.createElement('div');
  overlay.id = 'fullscreenOverlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.3);
    z-index: 1999;
    display: none;
  `;
  document.body.appendChild(overlay);
}

function closeMobilePanel() {
  if (mobilePanel) {
    mobilePanel.style.display = 'none';
  }
  selectedLocationId = null;
  currentHeavyLocation = null;
}

function closeFullscreenPanel() {
  if (!isMobileMode()) {
    closeDetails();
    return;
  }

  detailsPanel.style.cssText = '';
  detailsPanel.classList.remove('active');

  const overlay = document.getElementById('fullscreenOverlay');
  if (overlay) overlay.remove();

  if (mobilePanel && selectedLocationId) {
    openMobilePanel(selectedLocationId);
  } else {
    closeMobilePanel();
  }
}

function mapClickListener(e) {
  if (!isMobileMode()) return;

  if (e.target.closest('#mobilePanelWrapper') ||
      e.target.closest('#detailsPanel') ||
      e.target.closest('.details-panel')) {
    return;
  }

  closeMobilePanel();
  closeFullscreenPanel();
}

const originalHandleMarkerClick = window.handleMarkerClick;
window.handleMarkerClick = async function(id) {
  if (!isMobileMode()) {
    originalHandleMarkerClick(id);
    return;
  }

  selectedLocationId = id;

  let locationDetails = await getLocationDetails(id);
  if (!locationDetails) return;

  currentHeavyLocation = locationDetails;
  
  // Marker'ı PARLAK YAP (detay çekildiğinden cache'ye yazılmıştır)
  if (markerMap[id]) {
    markerMap[id].setOpacity(1.0);
  }
  
  // Index item'ını da güncelle
  const indexItem = geoIndexData.find(loc => loc.id === id);
  if (indexItem) {
    indexItem.isCached = true;
  }

  focusMapOnLocation(locationDetails);
  showDetails(locationDetails);
  detailsPanel.classList.add('active');
  detailsPanel.style.display = 'none';

  openMobilePanel(id);
};



window.addEventListener('resize', () => {
  const wasOnMobile = mobilePanel?.style.display === 'flex';

  if (!isMobileMode() && wasOnMobile) {
    if (mobilePanel) mobilePanel.style.display = 'none';
    detailsPanel.style.cssText = '';
    detailsPanel.classList.add('active');
  } else if (isMobileMode() && !wasOnMobile && selectedLocationId) {
    detailsPanel.style.display = 'none';
    openMobilePanel(selectedLocationId);
  }
});

const closeBtn = document.querySelector('.close-btn');
if (closeBtn) {
  closeBtn.addEventListener('click', closeFullscreenPanel);
}

document.getElementById('map').addEventListener('click', mapClickListener);

// ===== INITIALIZATION =====

window.addEventListener('load', () => {
  if (isMobileMode()) {
    createFloatingControls();
  }
});

window.addEventListener('resize', () => {
  if (isMobileMode() && !document.getElementById('floatingControls')) {
    createFloatingControls();
  } else if (!isMobileMode() && document.getElementById('floatingControls')) {
    document.getElementById('floatingControls').remove();
  }
});

console.log('✅ Mobile script yüklendi (geolocation + floating controls)');