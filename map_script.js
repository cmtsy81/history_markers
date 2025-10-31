/*
 * File: map_script.js (Updated with IndexedDB Cache)
 * Açıklama: Harita başlatma, veri çekme (fetch), filtreleme, pin yönetimi ve smart cache sistemi
 */

// --- SABİTLER ---
const API_BASE = "http://localhost:3000/api/v1";
const INDEX_CACHE_TIME = 5 * 60 * 1000; // 5 dakika (development)
const DETAIL_CACHE_TIME = 24 * 60 * 60 * 1000; // 24 saat
const MIN_ZOOM_TO_SHOW_LIST = 13;
const CLUSTER_THRESHOLD = 50; // Cluster'da bu sayıdan az marker varsa detayları indir

// --- CUSTOM MARKER İKONLARI ---
const customIcon = L.icon({
  iconUrl: '/custom_marker.png', 
  iconSize: [40, 40],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32]
});

const customIconSelected = L.icon({
  iconUrl: '/custom_marker2.png', 
  iconSize: [40, 40],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32]
});

// --- GLOBAL DEĞİŞKENLER ---
let map;
let markerClusterGroup;
let geoIndexData = [];
let detailCache = new Map(); // Memory cache (session)
let currentHeavyLocation = null;
let currentLang = 'tr';
let allCategories = {};
let allCities = [];
let selectedLocationId = null;
const markerMap = {};
let lastIndexFetch = 0;
let db; // IndexedDB bağlantısı

// --- İNDEXEDDB BAŞLATMA ---
async function initIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('travelAppCache', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve();
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Marker detayları store
      if (!db.objectStoreNames.contains('markerDetails')) {
        const detailStore = db.createObjectStore('markerDetails', { keyPath: 'id' });
        detailStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      
      // Index verisi store
      if (!db.objectStoreNames.contains('geoIndex')) {
        db.createObjectStore('geoIndex', { keyPath: 'cacheKey' });
      }
    };
  });
}

// --- İNDEXEDDB CACHE FONKSIYONLARI ---

async function getFromIndexedDB(storeName, key) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('IndexedDB not initialized'));
      return;
    }
    const tx = db.transaction([storeName], 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(key);
    
    request.onsuccess = () => {
      const result = request.result;
      if (result) {
        console.log(`📦 IndexedDB get: ${key}`, result);
      }
      resolve(result);
    };
    request.onerror = () => reject(request.error);
  });
}

async function saveToIndexedDB(storeName, data) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('IndexedDB not initialized'));
      return;
    }
    const tx = db.transaction([storeName], 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(data);
    
    request.onsuccess = () => {
      console.log(`💾 IndexedDB save: ${data.id || data.cacheKey}`);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

function isCacheValid(timestamp, maxAge) {
  return (Date.now() - timestamp) < maxAge;
}

// --- HAL KONTROL ---

function isOnline() {
  return navigator.onLine;
}

function showNotification(message, type = 'info') {
  // type: 'info', 'warning', 'error'
  console.log(`[${type.toUpperCase()}] ${message}`);
  // İleride Toast kütüphanesi eklenebilir
}

// --- HARITA VE VERİ BAŞLATMA ---

function initMap() {
  map = L.map('map').setView([50.0, 15.0], 5); // Tüm Avrupa
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19
  }).addTo(map);

  markerClusterGroup = L.markerClusterGroup();
  map.addLayer(markerClusterGroup);

  // Cluster click event
  markerClusterGroup.on('clusterclick', handleClusterClick);
  
  map.on('moveend', updateLocationList);
}

/**
 * Cluster'a tıklandığında çalışır
 */
function handleClusterClick(e) {
  const cluster = e.layer;
  const childCount = cluster.getChildCount();
  
  console.log(`Cluster tıklandı. İçinde ${childCount} marker var.`);

    cluster.zoomToShowLayer(cluster, function () {
        // Zoom işlemi bittikten sonra yapılacaklar (isteğe bağlı)
        console.log("Optimal zoom tamamlandı.");
    });
  
  if (childCount <= CLUSTER_THRESHOLD) {
    // Cluster'daki marker ID'lerini topla
    const markerIds = [];
    cluster.getAllChildMarkers().forEach(marker => {
      const markerId = marker.options.locationId;
      if (markerId) markerIds.push(markerId);
    });
    
    console.log(`${childCount} marker'ın detayları indiriliyor...`);
    loadClusterDetails(markerIds);
  } else {
    showNotification(`Daha fazla yakınlaşın (${childCount} marker)`, 'info');
    map.zoomIn();
  }
}

/**
 * Cluster'daki markerların detaylarını indir
 */
async function loadClusterDetails(markerIds) {
  if (!markerIds || markerIds.length === 0) return;

  const toFetch = [];
  const cached = {};

  // Hangileri cache'de var, hangisi yok kontrol et
  for (let id of markerIds) {
    try {
      const cached_data = await getFromIndexedDB('markerDetails', id);
      
      if (cached_data) {
        const isValid = isCacheValid(cached_data.timestamp, DETAIL_CACHE_TIME);
        const age = Math.floor((Date.now() - cached_data.timestamp) / 1000 / 60); // dakika
        
        if (cached_data.timestamp && isValid) {
          console.log(`✅ Cache geçerli: ${id} (${age} dakika eski)`);
          cached[id] = cached_data.data;
        } else {
          console.log(`⏰ Cache eski: ${id} (${age} dakika eski, max: ${DETAIL_CACHE_TIME / 1000 / 60 / 60} saat)`);
          toFetch.push(id);
        }
      } else {
        console.log(`❌ Cache boş: ${id}`);
        toFetch.push(id);
      }
    } catch (err) {
      console.log(`❌ Cache read hatası: ${id} -`, err.message);
      toFetch.push(id);
    }
  }

  // Eksikleri API'den çek
  if (toFetch.length > 0 && isOnline()) {
    try {
      const response = await fetch(`${API_BASE}/locations/cluster-details?ids=${toFetch.join(',')}`);
      const freshData = await response.json();
      
      // Yeni veriler cache'e yaz
      for (let item of freshData) {
        cached[item.id] = item;
        await saveToIndexedDB('markerDetails', {
          id: item.id,
          data: item,
          timestamp: Date.now()
        });
      }
      
      console.log(`✅ ${toFetch.length} marker detayı indirildi`);
      // Cluster detaylarını göster
      showClusterDetails(Object.values(cached));
    } catch (err) {
      console.error('Cluster detayları indirilemedi:', err);
      if (Object.keys(cached).length === 0) {
        showNotification('⚠️ Veri indirilemedi', 'error');
        return;
      }
      // Kısmi veri bile varsa göster
      showClusterDetails(Object.values(cached));
    }
  } else if (toFetch.length > 0 && !isOnline()) {
    if (Object.keys(cached).length === 0) {
      showNotification('📡 İnternet bağlantısı yok ve cache boş', 'error');
      return;
    }
    showNotification('📡 Çevrimdışı mod. Eski veriler gösteriliyor', 'warning');
    showClusterDetails(Object.values(cached));
  } else if (toFetch.length === 0 && Object.keys(cached).length > 0) {
    // Tüm veriler cache'den geldi
    showClusterDetails(Object.values(cached));
  }
}

/**
 * Cluster detaylarını sidebar'da göster
 */
function showClusterDetails(locations) {
  const listEl = document.getElementById('locationList');
  
  if (locations.length === 0) {
    listEl.innerHTML = '<div class="empty-state">Veri bulunamadı</div>';
    return;
  }

  // Marker'ların opacity'sini güncelle ve index item'larını işaretle
  locations.forEach(loc => {
    if (markerMap[loc.id]) {
      markerMap[loc.id].setOpacity(1.0);
    }
    const indexItem = geoIndexData.find(item => item.id === loc.id);
    if (indexItem) {
      indexItem.isCached = true;
    }
  });

  listEl.innerHTML = locations.map(loc => {
    const title = (loc.translations && loc.translations[currentLang] && loc.translations[currentLang].title) 
                  ? loc.translations[currentLang].title 
                  : loc.id;
    const categoryName = allCategories[loc.categoryKey] || loc.categoryKey || '-';
    
    // Cache'de veri varsa beyaz, yoksa pembe
    const bgColor = '#ffffff';
    
    return `
      <div class="location-item ${loc.id === selectedLocationId ? 'active' : ''}" 
            data-location-id="${loc.id}" 
            onclick="handleMarkerClick('${loc.id}')"
            style="background-color: ${bgColor};">
        <div class="location-title">${title}</div>
        <div class="location-meta">${loc.city} • ${categoryName}</div>
      </div>
    `;
  }).join('');
}

/**
 * Index verisini (hafif veri) çek veya cache'den al
 */
async function loadGeoIndex() {
  const now = Date.now();
  
  // Memory cache ve 5 dakika kontrolü
  if (geoIndexData.length > 0 && (now - lastIndexFetch) < INDEX_CACHE_TIME) {
    console.log('✅ Geo-Index memory cache kullanılıyor.');
    updateMapMarkers();
    updateLocationList();
    return;
  }

  console.log("🔄 Yeni Geo-Index çekiliyor...");
  
  try {
    const response = await fetch(`${API_BASE}/locations/index`);
    geoIndexData = await response.json();
    lastIndexFetch = now;
    
    // IndexedDB'ye de kaydet (1 gün geçerliliği ile)
    await saveToIndexedDB('geoIndex', {
      cacheKey: 'currentIndex',
      data: geoIndexData,
      timestamp: Date.now()
    });
    
    console.log(`✅ ${geoIndexData.length} marker çekildi`);
    updateMapMarkers();
    updateLocationList();
  } catch (err) {
    console.error('Geo-Index çekilemedi:', err);
    
    // Offline fallback: IndexedDB'den eski indexi al
    try {
      const cached = await getFromIndexedDB('geoIndex', 'currentIndex');
      if (cached) {
        geoIndexData = cached.data;
        showNotification('⚠️ Eski veriler gösteriliyor (çevrimdışı)', 'warning');
        updateMapMarkers();
        updateLocationList();
        return;
      }
    } catch (dbErr) {
      console.error('IndexedDB fallback hatası:', dbErr);
    }
    
    document.getElementById('locationList').innerHTML = '<div class="empty-state">Hata: Konum verileri yüklenemedi</div>';
  }
}

async function loadCategories() {
  try {
    const res = await fetch(`${API_BASE}/categories`);
    const categories = await res.json();
    const select = document.getElementById('categoryFilter');
    
    select.innerHTML = '<option value="">Tüm Kategoriler</option>';
    allCategories = {}; 
    
    categories.forEach(cat => {
      const opt = document.createElement('option');
      const translatedName = cat.translations[currentLang] || cat.key;
      opt.value = cat.key;
      opt.textContent = translatedName;
      select.appendChild(opt);
      allCategories[cat.key] = translatedName; 
    });
  } catch (err) {
    console.error('Kategoriler yüklenemedi:', err);
  }
}

async function loadCities() {
  try {
    const res = await fetch(`${API_BASE}/meta/cities`);
    allCities = await res.json();
    const select = document.getElementById('cityFilter');
    allCities.forEach(city => {
      const opt = document.createElement('option');
      opt.value = city;
      opt.textContent = city.charAt(0).toUpperCase() + city.slice(1);
      select.appendChild(opt);
    });
  } catch (err) {
    console.error('Şehirler yüklenemedi:', err);
  }
}

// --- HARITA VE LİSTE GÜNCELLEME ---

function updateMapMarkers() {
  markerClusterGroup.clearLayers(); 
  Object.keys(markerMap).forEach(key => delete markerMap[key]);

  const selectedCategory = document.getElementById('categoryFilter').value;
  const selectedCity = document.getElementById('cityFilter').value;
  const search = document.getElementById('searchInput').value.toLowerCase();

  const displayLocations = geoIndexData.filter(loc => {
    const title = (loc.translations && loc.translations[currentLang] && loc.translations[currentLang].title) 
                  ? loc.translations[currentLang].title 
                  : (loc.id || '');
                    
    const matchesSearch = title.toLowerCase().includes(search);
    const matchesCategory = !selectedCategory || loc.categoryKey === selectedCategory;
    const matchesCity = !selectedCity || loc.city === selectedCity;
    return matchesSearch && matchesCategory && matchesCity;
  });

  displayLocations.forEach(loc => {
    const lat = loc.lat, lng = loc.lng;
    if (!lat || !lng) return;
    
    const isSelected = loc.id === selectedLocationId;
    const marker = L.marker([lat, lng], {
      icon: isSelected ? customIconSelected : customIcon,
      locationId: loc.id, // Cluster detayları için ID saklayalım
      opacity: 0.5
    });
      
    marker.on('click', () => handleMarkerClick(loc.id)); 
    markerMap[loc.id] = marker;
    markerClusterGroup.addLayer(marker);
  });
}

async function updateLocationList() {
  const listEl = document.getElementById('locationList');
  const search = document.getElementById('searchInput').value.toLowerCase();
  const selectedCategory = document.getElementById('categoryFilter').value;
  const selectedCity = document.getElementById('cityFilter').value;
  
  const currentZoom = map.getZoom();
  if (currentZoom < MIN_ZOOM_TO_SHOW_LIST) {
    listEl.innerHTML = '<div class="empty-state">Lokasyonları listelemek için<br>haritaya yakınlaşın...</div>';
    return;
  }

  const bounds = map.getBounds();

  let filtered = geoIndexData.filter(loc => {
    const title = (loc.translations && loc.translations[currentLang] && loc.translations[currentLang].title) 
                  ? loc.translations[currentLang].title 
                  : (loc.id || '');
    const matchesSearch = title.toLowerCase().includes(search);
    const matchesCategory = !selectedCategory || loc.categoryKey === selectedCategory;
    const matchesCity = !selectedCity || loc.city === selectedCity;
    
    if (!matchesSearch || !matchesCategory || !matchesCity) {
        return false;
    }

    if (!loc.lat || !loc.lng) return false;
    const markerLatLng = L.latLng(loc.lat, loc.lng);
    const matchesBounds = bounds.contains(markerLatLng);
    
    return matchesBounds;
  });
  
  const MAX_LIST_ITEMS = 100;
  let hasMoreItems = false;
  if (filtered.length > MAX_LIST_ITEMS) {
    filtered = filtered.slice(0, MAX_LIST_ITEMS);
    hasMoreItems = true;
  }

  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="empty-state">Bu alanda sonuç bulunamadı</div>';
    return;
  }

  // Sadece ekrana sığan marker'lar için cache durumunu kontrol et
  for (let loc of filtered) {
    try {
      const cached = await getFromIndexedDB('markerDetails', loc.id);
      loc.isCached = cached && cached.timestamp && isCacheValid(cached.timestamp, DETAIL_CACHE_TIME);
    } catch (err) {
      loc.isCached = false;
    }
  }

  listEl.innerHTML = filtered.map(loc => {
    const categoryName = allCategories[loc.categoryKey] || loc.categoryKey || '-';
    const title = (loc.translations && loc.translations[currentLang] && loc.translations[currentLang].title) 
                  ? loc.translations[currentLang].title 
                  : loc.id;
    
    // Cache'de veri varsa beyaz, yoksa pembe background
    const bgColor = loc.isCached ? '#ffffff' : '#ffe0e6';
    
    return `
      <div class="location-item ${loc.id === selectedLocationId ? 'active' : ''}" 
            data-location-id="${loc.id}" 
            onclick="handleMarkerClick('${loc.id}')"
            style="background-color: ${bgColor};">
        <div class="location-title">${title}</div>
        <div class="location-meta">${loc.city} • ${categoryName}</div>
      </div>
    `}).join('');
  
  if (hasMoreItems) {
    listEl.innerHTML += '<div class="empty-state">(Liste, performans için ilk 100 sonuçla sınırlandırıldı...)</div>';
  }
}

// --- DETAY VE ETKİLEŞİM ---

/**
 * Marker veya liste öğesine tıklandığında detay çek
 */
async function handleMarkerClick(id) {
  if (!id) return;
  
  document.getElementById('detailsPanel').classList.add('active');
  document.getElementById('detailsTitle').textContent = "Yükleniyor...";
  document.getElementById('detailsDesc').textContent = "...";
  
  if (selectedLocationId && markerMap[selectedLocationId]) {
    markerMap[selectedLocationId].setIcon(customIcon);
  }
  document.querySelectorAll('.location-item.active').forEach(el => el.classList.remove('active'));
  
  selectedLocationId = id;
  if (markerMap[id]) {
    markerMap[id].setIcon(customIconSelected);
  }
  const listItem = document.querySelector(`[data-location-id="${id}"]`);
  if (listItem) listItem.classList.add('active');

  // Detay verisini al (cache veya API)
  let locationDetails = await getLocationDetails(id);
  
  if (!locationDetails) {
    document.getElementById('detailsTitle').textContent = "Hata oluştu";
    return;
  }
  
  currentHeavyLocation = locationDetails;
  
  // Marker'ı keskin yap (opacity 1.0)
  if (markerMap[id]) {
    markerMap[id].setOpacity(1.0);
  }
  
  // İlgili index item'ını da güncelle (harita kaydırıldığında beyaz gösterilsin)
  const indexItem = geoIndexData.find(loc => loc.id === id);
  if (indexItem) {
    indexItem.isCached = true;
  }
  
  focusMapOnLocation(locationDetails);
  showDetails(locationDetails);
}

/**
 * Smart cache logic: Marker detaylarını al
 */
async function getLocationDetails(id) {
  // Memory cache kontrol
  if (detailCache.has(id)) {
    const cached = detailCache.get(id);
    if (isCacheValid(cached.timestamp, DETAIL_CACHE_TIME)) {
      console.log(`✅ Memory cache'den: ${id}`);
      return cached.data;
    }
  }

  // IndexedDB kontrol
  try {
    const dbCached = await getFromIndexedDB('markerDetails', id);
    if (dbCached && isCacheValid(dbCached.timestamp, DETAIL_CACHE_TIME)) {
      console.log(`✅ IndexedDB cache'den: ${id}`);
      detailCache.set(id, { data: dbCached.data, timestamp: dbCached.timestamp });
      return dbCached.data;
    }
  } catch (err) {
    console.error('IndexedDB read hatası:', err);
  }

  // API'den çek (internet varsa)
  if (isOnline()) {
    try {
      console.log(`🔄 API'den çekiliyor: ${id}`);
      const response = await fetch(`${API_BASE}/locations/details/${id}`);
      const locationDetails = await response.json();
      
      // Memory ve IndexedDB'ye kaydet
      const cacheEntry = { data: locationDetails, timestamp: Date.now() };
      detailCache.set(id, cacheEntry);
      
      try {
        await saveToIndexedDB('markerDetails', {
          id: id,
          data: locationDetails,
          timestamp: Date.now()
        });
      } catch (dbErr) {
        console.warn('IndexedDB save hatası:', dbErr);
      }
      
      return locationDetails;
    } catch (err) {
      console.error('API çekme hatası:', err);
      
      // API fail ama cache varsa (eski)
      const fallback = await getFromIndexedDB('markerDetails', id);
      if (fallback) {
        showNotification('⚠️ Eski veriler gösteriliyor', 'warning');
        return fallback.data;
      }
      
      return null;
    }
  }
  
  // Offline ve cache yok
  showNotification('📡 İnternet yok ve cache boş', 'error');
  return null;
}

function focusMapOnLocation(loc) {
  let lat, lng;
  if (loc.lat && loc.lng) { [lat, lng] = [loc.lat, loc.lng]; }
  else if (loc.location?.coordinates) { [lng, lat] = loc.location.coordinates; }
  else { return; }

  const MIN_FOCUSED_ZOOM = 17; 
  const currentZoom = map.getZoom();
  const targetZoom = Math.max(currentZoom, MIN_FOCUSED_ZOOM);
  
  map.flyTo([lat, lng], targetZoom, { duration: 1 });
}

function showDetails(loc) {
  const title = loc.translations[currentLang]?.title || loc.id;
  const description = loc.translations[currentLang]?.description || "Açıklama mevcut değil.";
  const audioPath = loc.translations[currentLang]?.audioPath;
  
  document.getElementById('detailsTitle').textContent = title;
  document.getElementById('detailsDesc').textContent = description;
  
  const categoryName = allCategories[loc.categoryKey] || loc.categoryKey || '-';
  document.getElementById('detailsCity').textContent = `${loc.city}`;
  document.getElementById('detailsCategory').textContent = `${categoryName}`;
  document.getElementById('detailsBuiltYear').textContent = loc.builtYear || '-';
  
  const tagsDiv = document.getElementById('detailsTags');
  if (loc.tagKeys && loc.tagKeys.length > 0) {
    tagsDiv.innerHTML = loc.tagKeys.map(tagKey => 
      `<span style="background: #e3f2ff; color: #0099ff; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500;">${tagKey}</span>`
    ).join('');
  } else {
    tagsDiv.innerHTML = '<span style="color: #999; font-size: 13px;">Etiket yok</span>';
  }
  
  const thumbnailImage = document.getElementById('thumbnailImage');
  const galleryPlaceholderContent = document.getElementById('galleryPlaceholderContent');
  let imagePath = `/assets/images/demo.jpg`;
  
  if (loc.thumbnailUrl) {
    if (loc.thumbnailUrl.startsWith('/')) { imagePath = loc.thumbnailUrl; }
    else if (loc.thumbnailUrl.startsWith('assets/')) { imagePath = `/${loc.thumbnailUrl}`; }
    else { imagePath = `/assets/images/${loc.thumbnailUrl}`; }
  }
  
  thumbnailImage.onerror = () => {
    galleryPlaceholderContent.style.display = 'flex';
    thumbnailImage.style.display = 'none';
    thumbnailImage.onerror = null;
  };
  thumbnailImage.onload = () => {
    galleryPlaceholderContent.style.display = 'none';
    thumbnailImage.style.display = 'block';
  };
  thumbnailImage.src = imagePath;
  
  const audioSource = document.getElementById('audioSource');
  const audioPlayer = document.getElementById('audioPlayer');
  if (audioPath) {
    let fullAudioPath = audioPath.startsWith('/') || audioPath.startsWith('assets/') ? `/${audioPath}` : `/assets/audio/${audioPath}`;
    audioSource.src = fullAudioPath;
    audioPlayer.load();
    audioPlayer.style.display = 'block';
  } else {
    audioPlayer.style.display = 'none';
  }
  
  document.getElementById('detailsPanel').classList.add('active');
}

function closeDetails() {
  document.getElementById('detailsPanel').classList.remove('active');
  if (selectedLocationId && markerMap[selectedLocationId]) {
    markerMap[selectedLocationId].setIcon(customIcon);
  }
  document.querySelectorAll('.location-item.active').forEach(el => el.classList.remove('active'));
  selectedLocationId = null;
  currentHeavyLocation = null;
}

// --- OLAY DİNLEYİCİLERİ ---

document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentLang = btn.dataset.lang;
    
    loadCategories();
    updateMapMarkers();
    updateLocationList();
    
    if (currentHeavyLocation) {
      showDetails(currentHeavyLocation);
    }
  });
});

document.getElementById('searchInput').addEventListener('input', () => {
  updateMapMarkers();
  updateLocationList();
});
document.getElementById('cityFilter').addEventListener('change', () => {
  updateMapMarkers();
  updateLocationList();
});
document.getElementById('categoryFilter').addEventListener('change', () => {
  updateMapMarkers();
  updateLocationList();
});

// --- CACHE TEMİZLEME (TEST İÇİN) ---

async function clearAllCache() {
  try {
    // Memory cache'i temizle
    detailCache.clear();
    console.log('🧹 Memory cache temizlendi');
    
    // IndexedDB'den markerDetails sil
    const tx = db.transaction(['markerDetails'], 'readwrite');
    const store = tx.objectStore('markerDetails');
    store.clear();
    
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        console.log('🧹 IndexedDB markerDetails temizlendi');
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
    
    showNotification('✅ Cache temizlendi. Sayfayı yenileyebilirsiniz.', 'info');
  } catch (err) {
    console.error('Cache temizleme hatası:', err);
    showNotification('❌ Cache temizlenemedi', 'error');
  }
}

async function clearIndexCache() {
  try {
    const tx = db.transaction(['geoIndex'], 'readwrite');
    const store = tx.objectStore('geoIndex');
    store.clear();
    
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        console.log('🧹 Geo-Index cache temizlendi');
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
    
    geoIndexData = [];
    lastIndexFetch = 0;
    showNotification('✅ Index cache temizlendi. Sayfayı yenileyebilirsiniz.', 'info');
  } catch (err) {
    console.error('Index cache temizleme hatası:', err);
  }
}

// --- BAŞLANGIÇ ---

window.addEventListener('load', async () => {
  try {
    await initIndexedDB();
    console.log('✅ IndexedDB başlatıldı');
  } catch (err) {
    console.error('IndexedDB hatasası:', err);
  }
  
  initMap();
  loadCategories(); 
  loadCities(); 
  loadGeoIndex();
  
  // Test amaçlı: Console'da clearAllCache() veya clearIndexCache() yazabilirsiniz
  window.clearAllCache = clearAllCache;
  window.clearIndexCache = clearIndexCache;
  console.log('💡 Test için: clearAllCache() veya clearIndexCache() komutlarını kullanabilirsiniz');
});