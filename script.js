// ===== API ENDPOINTS =====
// const API_LOCATIONS = "http://localhost:3000/api/v1/locations";
// const API_CITIES = "http://localhost:3000/api/v1/meta/cities";
// const API_CATEGORIES = "http://localhost:3000/api/v1/categories";
// const API_TAGS = "http://localhost:3000/api/v1/tags";



const API_LOCATIONS = "https://history-markers.onrender.com/api/v1/locations";
const API_CITIES = "https://history-markers.onrender.com/api/v1/meta/cities";
const API_CATEGORIES = "https://history-markers.onrender.com/api/v1/categories";
const API_TAGS = "https://history-markers.onrender.com/api/v1/tags";



// ===== GLOBAL VARIABLES =====
let allCategories = [];
let allTags = [];
let editMapInstance = null;
let editMapMarker = null;
let cityCache = new Map();
let currentCityData = [];
let locationDetailsCache = new Map();
let lastSelectedLocation = null;

const DEFAULT_LOCATION = {
  lat: 38.4237,
  lng: 27.1449,
  city: 'izmir',
  title: 'Yeni Lokasyon'
};

// ===== DOM ELEMENTS =====
const cityFilter = document.getElementById('cityFilter');
const categoryFilter = document.getElementById('categoryFilter');
const locationList = document.getElementById('locationList');
const locationForm = document.getElementById('locationForm');
const locationTitle = document.getElementById('locationTitle');
const placeholder = document.getElementById('placeholder');
const currentLocationIdInput = document.getElementById('currentLocationId');
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

const inputs = {
  tr: { title: document.getElementById('title_tr'), desc: document.getElementById('desc_tr'), audio: document.getElementById('audio_tr') },
  en: { title: document.getElementById('title_en'), desc: document.getElementById('desc_en'), audio: document.getElementById('audio_en') },
  de: { title: document.getElementById('title_de'), desc: document.getElementById('desc_de'), audio: document.getElementById('audio_de') },
  fr: { title: document.getElementById('title_fr'), desc: document.getElementById('desc_fr'), audio: document.getElementById('audio_fr') }
};

// ===== TOAST NOTIFICATION =====
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ===== LOAD CITIES =====
async function loadCities() {
  try {
    const res = await fetch(API_CITIES);
    const cities = await res.json();
    cities.forEach(city => {
      const opt = document.createElement('option');
      opt.value = city;
      opt.textContent = city.charAt(0).toUpperCase() + city.slice(1);
      cityFilter.appendChild(opt);
    });
  } catch (err) {
    console.error("Şehirler yüklenemedi:", err);
    showToast("Şehirler yüklenemedi", "error");
  }
}

// ===== LOAD METADATA =====
async function loadMetaData() {
  try {
    const catRes = await fetch(API_CATEGORIES);
    allCategories = await catRes.json();
    const catSelect = document.getElementById('loc_category');
    allCategories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.key;
      opt.textContent = cat.translations.tr;
      catSelect.appendChild(opt);

      const filterOpt = document.createElement('option');
      filterOpt.value = cat.key;
      filterOpt.textContent = cat.translations.tr;
      categoryFilter.appendChild(filterOpt);
    });

    const tagRes = await fetch(API_TAGS);
    allTags = await tagRes.json();
    const tagsContainer = document.getElementById('loc_tags_container');
    tagsContainer.innerHTML = '';
    allTags.forEach(tag => {
      const div = document.createElement('div');
      div.className = 'tag-item';
      div.innerHTML = `
        <input type="checkbox" id="tag-${tag.key}" value="${tag.key}">
        <label for="tag-${tag.key}">${tag.translations.tr}</label>
      `;
      tagsContainer.appendChild(div);
    });
  } catch (err) {
    console.error("Meta veri yüklenemedi:", err);
    showToast("Meta veri yüklenemedi", "error");
  }
}

// ===== MAP INITIALIZATION =====
function initEditMap(lat, lng) {
  if (editMapInstance) {
    editMapInstance.remove();
    editMapInstance = null;
  }
  
  editMapInstance = L.map('editMap').setView([lat, lng], 15);
  
  // BASE LAYERS
  const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    name: 'Street'
  });
  
  const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles © Esri',
    name: 'Satellite'
  });
  
  const tonerLayer = L.tileLayer('https://tile.openstreetmap.de/tiles/osmde/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    name: 'Toner'
  });
  
  streetLayer.addTo(editMapInstance);
  
  // LAYER CONTROL
  const baseLayers = {
    'Street': streetLayer,
    'Satellite': satelliteLayer,
    'Toner': tonerLayer
  };
  
  L.control.layers(baseLayers).addTo(editMapInstance);
  
  editMapMarker = L.marker([lat, lng], { draggable: true }).addTo(editMapInstance);
  
  editMapMarker.on('dragend', (e) => {
    const coords = e.target.getLatLng();
    document.getElementById('loc_lat').value = coords.lat.toFixed(6);
    document.getElementById('loc_lng').value = coords.lng.toFixed(6);
  });

  editMapInstance.on('click', (e) => {
    editMapMarker.setLatLng(e.latlng);
    document.getElementById('loc_lat').value = e.latlng.lat.toFixed(6);
    document.getElementById('loc_lng').value = e.latlng.lng.toFixed(6);
  });
}

// ===== GET LOCATION DETAILS =====
async function getLocationDetails(id) {
  if (locationDetailsCache.has(id)) {
    console.log(`📦 "${id}" cache'den yükleniyor...`);
    return locationDetailsCache.get(id);
  }

  console.log(`🌐 "${id}" API'den çekiliyor...`);
  try {
    const res = await fetch(`${API_LOCATIONS}/${id}`);
    const loc = await res.json();
    locationDetailsCache.set(id, loc);
    return loc;
  } catch (err) {
    console.error("Lokasyon yüklenemedi:", err);
    showToast("Lokasyon yüklenemedi", "error");
    throw err;
  }
}

// ===== RENDER LOCATION LIST =====
function renderLocationList(locationsToRender) {
  locationList.innerHTML = '';

  if (locationsToRender.length === 0) {
    locationList.innerHTML = '<li style="text-align: center; padding: 20px; color: #999;">Lokasyon bulunamadı</li>';
    return;
  }

  locationsToRender.forEach(loc => {
    const li = document.createElement('li');
    const title = loc.translations?.tr?.title || loc.translations?.en?.title || loc.id;
    li.textContent = title;
    li.dataset.id = loc.id;
    locationList.appendChild(li);
  });
}

// ===== APPLY FILTERS =====
function applyFiltersAndRenderList() {
  const selectedCategory = categoryFilter.value;

  if (!selectedCategory) {
    renderLocationList(currentCityData);
    return;
  }

  const filteredData = currentCityData.filter(loc => loc.categoryKey === selectedCategory);
  renderLocationList(filteredData);
}

// ===== LOAD LOCATIONS =====
async function loadLocations(selectedCity) {
  locationList.innerHTML = '<li style="text-align: center; padding: 20px; color: #999;">Yükleniyor...</li>';

  if (!selectedCity) {
    currentCityData = [];
    renderLocationList([]);
    return;
  }

  if (cityCache.has(selectedCity)) {
    console.log(`"${selectedCity}" önbellekten yükleniyor...`);
    currentCityData = cityCache.get(selectedCity);
    applyFiltersAndRenderList();
    return;
  }

  console.log(`"${selectedCity}" API'den çekiliyor...`);
  try {
    let url = `${API_LOCATIONS.replace('locations', 'admin/list-by-city')}?city=${selectedCity}`;
    const res = await fetch(url);
    const locs = await res.json();

    cityCache.set(selectedCity, locs);
    currentCityData = locs;
    applyFiltersAndRenderList();
  } catch (err) {
    console.error("Lokasyonlar yüklenemedi:", err);
    showToast("Lokasyonlar yüklenemedi", "error");
    locationList.innerHTML = '<li style="text-align: center; padding: 20px; color: #999;">Hata oluştu</li>';
  }
}

// ===== SWITCH TAB =====
function switchTab(lang) {
  tabs.forEach(t => t.classList.toggle('active', t.dataset.lang === lang));
  tabContents.forEach(c => c.classList.toggle('active', c.id === `content-${lang}`));
  
  if (lang === 'settings' && editMapInstance) {
    setTimeout(() => {
      editMapInstance.invalidateSize();
    }, 100);
  }
}

// ===== NEW LOCATION =====
document.getElementById('newLocationBtn').addEventListener('click', async (e) => {
  e.preventDefault();

  locationForm.classList.add('active');
  placeholder.style.display = 'none';
  
  document.getElementById('currentLocationId').value = '';
  locationTitle.textContent = '🆕 Yeni Lokasyon';
  document.getElementById('deleteBtn').style.display = 'none';
  
  ['tr', 'en', 'de', 'fr'].forEach(lang => {
    inputs[lang].title.value = '';
    inputs[lang].desc.value = '';
    inputs[lang].audio.value = '';
  });

  document.getElementById('loc_id').value = '';
  document.getElementById('loc_builtYear').value = '';
  document.getElementById('loc_thumbnailUrl').value = '';
  document.getElementById('loc_isPublished').value = 'false';
  document.getElementById('loc_category').value = '';
  
  document.querySelectorAll('#loc_tags_container input[type="checkbox"]').forEach(chk => {
    chk.checked = false;
  });

  let newLat, newLng, newCity;

  if (lastSelectedLocation) {
    newLat = lastSelectedLocation.lat;
    newLng = lastSelectedLocation.lng;
    newCity = lastSelectedLocation.city;
    console.log(`📍 Marker seçili: ${newCity} konumundan yeni lokasyon oluşturuluyor...`);
  } else {
    newLat = DEFAULT_LOCATION.lat;
    newLng = DEFAULT_LOCATION.lng;
    newCity = DEFAULT_LOCATION.city;
    console.log(`📍 Default konum kullanılıyor: İzmir Konak Saat Kulesi`);
  }

  document.getElementById('loc_lat').value = newLat;
  document.getElementById('loc_lng').value = newLng;
  document.getElementById('loc_city').value = newCity;

  initEditMap(newLat, newLng);

  switchTab('tr');

  document.querySelectorAll('.sidebar-list li.active').forEach(li => li.classList.remove('active'));
});

// ===== SELECT LOCATION =====
locationList.addEventListener('click', async (e) => {
  if (e.target.tagName !== 'LI') return;
  const id = e.target.dataset.id;
  if (!id) return;

  document.querySelectorAll('.sidebar-list li.active').forEach(li => li.classList.remove('active'));
  e.target.classList.add('active');

  try {
    const loc = await getLocationDetails(id);

    lastSelectedLocation = {
      lat: loc.lat,
      lng: loc.lng,
      city: loc.city,
      id: loc.id
    };

    locationTitle.textContent = loc.translations.tr.title || loc.translations.en.title;
    currentLocationIdInput.value = loc.id;
    placeholder.style.display = 'none';
    locationForm.classList.add('active');

    document.getElementById('deleteBtn').style.display = 'block';

    ['tr', 'en', 'de', 'fr'].forEach(lang => {
      if (loc.translations[lang]) {
        inputs[lang].title.value = loc.translations[lang].title || '';
        inputs[lang].desc.value = loc.translations[lang].description || '';
        inputs[lang].audio.value = loc.translations[lang].audioPath || '';
      }
    });

    document.getElementById('loc_id').value = loc.id;
    document.getElementById('loc_city').value = loc.city || '';
    document.getElementById('loc_builtYear').value = loc.builtYear || '';
    document.getElementById('loc_thumbnailUrl').value = loc.thumbnailUrl || '';
    document.getElementById('loc_isPublished').value = loc.isPublished ? 'true' : 'false';
    document.getElementById('loc_category').value = loc.categoryKey || '';

    document.querySelectorAll('#loc_tags_container input[type="checkbox"]').forEach(chk => {
      chk.checked = loc.tagKeys && loc.tagKeys.includes(chk.value);
    });

    if (loc.lat && loc.lng) {
      initEditMap(loc.lat, loc.lng);
      document.getElementById('loc_lat').value = loc.lat;
      document.getElementById('loc_lng').value = loc.lng;
    }

    switchTab('tr');
  } catch (err) {
    console.error("Lokasyon yüklenemedi:", err);
  }
});

// ===== SAVE LOCATION =====
locationForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = currentLocationIdInput.value;

  const updateData = {
    city: document.getElementById('loc_city').value.toLowerCase(),
    builtYear: parseInt(document.getElementById('loc_builtYear').value) || null,
    thumbnailUrl: document.getElementById('loc_thumbnailUrl').value,
    isPublished: document.getElementById('loc_isPublished').value === 'true',
    categoryKey: document.getElementById('loc_category').value || null,
    tagKeys: Array.from(document.querySelectorAll('#loc_tags_container input[type="checkbox"]:checked')).map(el => el.value),
    translations: {
      tr: { title: inputs.tr.title.value, description: inputs.tr.desc.value, audioPath: inputs.tr.audio.value },
      en: { title: inputs.en.title.value, description: inputs.en.desc.value, audioPath: inputs.en.audio.value },
      de: { title: inputs.de.title.value, description: inputs.de.desc.value, audioPath: inputs.de.audio.value },
      fr: { title: inputs.fr.title.value, description: inputs.fr.desc.value, audioPath: inputs.fr.audio.value }
    },
    lat: parseFloat(document.getElementById('loc_lat').value) || null,
    lng: parseFloat(document.getElementById('loc_lng').value) || null
  };

  try {
    if (!id) {
      console.log('📝 Yeni lokasyon oluşturuluyor...');
      const res = await fetch(API_LOCATIONS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });

      if (res.ok) {
        const newLocation = await res.json();
        showToast('✓ Yeni lokasyon oluşturuldu!', 'success');
        locationDetailsCache.set(newLocation.id, newLocation);
        
        const selectedCity = cityFilter.value;
        if (selectedCity === newLocation.city) {
          currentCityData.push(newLocation);
          renderLocationList(currentCityData);
        }
        
        locationForm.classList.remove('active');
        placeholder.style.display = 'block';
        locationTitle.textContent = 'Lokasyon Seçin';
        lastSelectedLocation = null;
      } else {
        showToast('✗ Oluşturma başarısız', 'error');
      }
    } else {
      console.log('✏️ Lokasyon güncelleniyor...');
      updateData.id = id;
      
      const res = await fetch(`${API_LOCATIONS}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });

      if (res.ok) {
        showToast('✓ Lokasyon kaydedildi!', 'success');
        const savedLocation = await fetch(`${API_LOCATIONS}/${id}`).then(r => r.json());
        locationDetailsCache.set(id, savedLocation);
        
        const index = currentCityData.findIndex(loc => loc.id === id);
        if (index !== -1) {
          currentCityData[index] = savedLocation;
          renderLocationList(currentCityData);
        }
        
        const li = document.querySelector(`[data-id="${id}"]`);
        if (li) li.textContent = savedLocation.translations.tr.title || savedLocation.translations.en.title;
      } else {
        showToast('✗ Kaydetme başarısız', 'error');
      }
    }
  } catch (err) {
    console.error("İşlem hatası:", err);
    showToast('✗ Hata: ' + err.message, 'error');
  }
});

// ===== DELETE LOCATION =====
document.getElementById('deleteBtn').addEventListener('click', async () => {
  const id = currentLocationIdInput.value;
  if (!id) return;

  const modalOverlay = document.getElementById('deleteModalOverlay');
  const locationNameEl = document.getElementById('deleteModalLocationName');
  locationNameEl.textContent = locationTitle.textContent;
  modalOverlay.classList.add('active');

  const confirmBtn = document.getElementById('deleteModalConfirm');
  const cancelBtn = document.getElementById('deleteModalCancel');
  
  const newConfirmBtn = confirmBtn.cloneNode(true);
  const newCancelBtn = cancelBtn.cloneNode(true);
  confirmBtn.replaceWith(newConfirmBtn);
  cancelBtn.replaceWith(newCancelBtn);

  newConfirmBtn.addEventListener('click', async () => {
    modalOverlay.classList.remove('active');
    
    try {
      const res = await fetch(`${API_LOCATIONS}/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });

      if (res.ok) {
        showToast('✓ Lokasyon silindi!', 'success');
        locationDetailsCache.delete(id);
        
        const selectedCity = cityFilter.value;
        if (selectedCity) {
          currentCityData = currentCityData.filter(loc => loc.id !== id);
          renderLocationList(currentCityData);
        }
        
        locationForm.classList.remove('active');
        placeholder.style.display = 'block';
        locationTitle.textContent = 'Lokasyon Seçin';
        lastSelectedLocation = null;
      } else {
        showToast('✗ Silme başarısız', 'error');
      }
    } catch (err) {
      console.error("Silme hatası:", err);
      showToast('✗ Hata: ' + err.message, 'error');
    }
  });

  newCancelBtn.addEventListener('click', () => {
    modalOverlay.classList.remove('active');
  });
});

// ===== MAP SEARCH =====
async function searchLocation(query) {
  if (!query.trim()) {
    showToast('Yer adı yazınız', 'info');
    return;
  }

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=10`
    );
    const results = await res.json();

    if (results.length === 0) {
      showToast('❌ Yer bulunamadı', 'error');
      return;
    }

    const dropdown = document.getElementById('searchResultsDropdown');
    dropdown.innerHTML = '';
    dropdown.classList.add('active');

    results.forEach((result) => {
      const div = document.createElement('div');
      div.className = 'search-result-item';
      div.textContent = result.display_name;
      div.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectSearchResult(result);
        dropdown.classList.remove('active');
        document.getElementById('mapSearchInput').value = result.display_name;
      });
      dropdown.appendChild(div);
    });
  } catch (err) {
    console.error("Arama hatası:", err);
    showToast('Arama sırasında hata oluştu', 'error');
  }
}

function selectSearchResult(result) {
  const { lat, lon, display_name } = result;
  
  if (editMapInstance) {
    editMapInstance.flyTo([lat, lon], 15, { duration: 1 });
    editMapMarker.setLatLng([lat, lon]);
    
    document.getElementById('loc_lat').value = parseFloat(lat).toFixed(6);
    document.getElementById('loc_lng').value = parseFloat(lon).toFixed(6);
    
    showToast(`✓ ${display_name.split(',')[0]}`, 'success');
  }
}

document.getElementById('mapSearchBtn').addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  const query = document.getElementById('mapSearchInput').value;
  searchLocation(query);
});

document.getElementById('mapSearchInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    const query = document.getElementById('mapSearchInput').value;
    searchLocation(query);
  }
});

// ===== EVENT LISTENERS =====
tabs.forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.lang));
});

cityFilter.addEventListener('change', () => {
  locationForm.classList.remove('active');
  placeholder.style.display = 'block';
  locationTitle.textContent = "Lokasyon Seçin";
  loadLocations(cityFilter.value);
});

categoryFilter.addEventListener('change', () => {
  applyFiltersAndRenderList();
});

// ===== INITIALIZE =====
loadCities();
loadMetaData();