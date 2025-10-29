const express = require('express');
// ... (require('express') vs. hemen sonrası)
const path = require('path'); // Node.js'in dosya yolları için standart modülü

//const { MongoClient } = require('mongodb');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');

// --- 1. YAPILANDIRMA ---

// BURAYA EN SON ÇALIŞAN ATLAS BAĞLANTI ADRESİNİZİ YAPIŞTIRIN
const CONNECTION_STRING = "mongodb+srv://cmtsy:Eda.2010@cmtsy01.q7voyf0.mongodb.net/?appName=cmtsy01";
const DB_NAME = "travelAppDB";
const PORT = process.env.PORT || 3000; // API sunucumuz 3000 portundan çalışacak

const app = express();

// --- 2. ARA YAZILIMLAR (Middleware) ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'assets/public'))); // Public klasörü sun
app.use(express.static(path.join(__dirname, '/'))); // Ana dizindeki tüm dosyaları sun

let db; // MongoDB veritabanı bağlantısını burada tutacağız

// --- 3. TEMEL API ENDPOINT'İ (ESKİ BBOX) ---
// Not: Bu API'yi yeni mimaride kullanmayacağız, ancak silmiyoruz.
app.get('/api/v1/locations', async (req, res) => {
  try {
    // ... (Mevcut BBox API kodunuz - değişiklik yok) ...
    const { sw_lat, sw_lng, ne_lat, ne_lng, lang = 'en' } = req.query;
    if (!sw_lat || !sw_lng || !ne_lat || !ne_lng) {
      return res.status(400).json({ 
        error: "Eksik koordinat parametreleri. 'sw_lat', 'sw_lng', 'ne_lat', 'ne_lng' gereklidir." 
      });
    }
    const swLat = parseFloat(sw_lat);
    const swLng = parseFloat(sw_lng);
    const neLat = parseFloat(ne_lat);
    const neLng = parseFloat(ne_lng);
    const query = {
      location: {
        $geoWithin: {
          $box: [
            [swLng, swLat], 
            [neLng, neLat]
          ]
        }
      }
    };
    const { city } = req.query;
    if (city && city.trim() !== '') {
      query.city = city;
    }
    const pipeline = [
      { $match: query },
      {
        $project: {
          id: 1,
          location: 1,
          categoryKey: 1,
          tagKeys: 1,
          thumbnailUrl: 1,
          imageUrls: 1,
          city: 1,
          builtYear: 1,
          lat: 1,
          lng: 1,
          isPublished: 1,
          title: `$translations.${lang}.title`,
          description: `$translations.${lang}.description`,
          audioPath: `$translations.${lang}.audioPath`
        }
      }
    ];
    const locations = await db.collection('locations').aggregate(pipeline).toArray();
    res.json(locations);
  } catch (err) {
    console.error("API Hatası:", err);
    res.status(500).json({ error: "Sunucu hatası oluştu." });
  }
});

// --- 3B. KATEGORİ API ENDPOINT'LERİ (FAZ 1) ---
// ... (Kategoriler için olan GET, POST, PUT, DELETE kodlarınızın tamamı - değişiklik yok) ...
app.get('/api/v1/categories', async (req, res) => {
  try {
    const categories = await db.collection('categories').find({}).toArray();
    res.json(categories);
  } catch (err) {
    console.error("Kategori listeleme hatası:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});
app.post('/api/v1/categories', async (req, res) => {
  try {
    const newCategory = req.body;
    if (!newCategory.key || !newCategory.translations || 
        !newCategory.translations.tr || !newCategory.translations.en ||
        !newCategory.translations.de || !newCategory.translations.fr) {
      return res.status(400).json({ 
        error: "Eksik bilgi: 'key' ve 'translations.tr', 'en', 'de', 'fr' alanları zorunludur." 
      });
    }
    const result = await db.collection('categories').insertOne(newCategory);
    const createdDocument = {
      _id: result.insertedId,
      ...newCategory
    };
    res.status(201).json(createdDocument);
  } catch (err) {
    console.error("Kategori ekleme hatası:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});
app.put('/api/v1/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    let objectId;
    try {
      objectId = new ObjectId(id);
    } catch (err) {
      return res.status(400).json({ error: "Geçersiz ID formatı." });
    }
    if (!updateData.key || !updateData.translations ||
        !updateData.translations.tr || !updateData.translations.en ||
        !updateData.translations.de || !updateData.translations.fr) {
      return res.status(400).json({ 
        error: "Eksik bilgi: 'key' ve 'translations.tr', 'en', 'de', 'fr' alanları zorunludur." 
      });
    }
    const result = await db.collection('categories').updateOne(
      { _id: objectId },
      { $set: { key: updateData.key, translations: updateData.translations } }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Kategori bulunamadı." });
    }
    res.json({ message: "Kategori başarıyla güncellendi.", updatedId: id });
  } catch (err) {
    console.error("Kategori güncelleme hatası:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});
app.delete('/api/v1/categories/:id', async (req, res) => {
  try {
    const { id } = req.params; 
    let objectId;
    try {
      objectId = new ObjectId(id);
    } catch (err) {
      return res.status(400).json({ error: "Geçersiz ID formatı." });
    }
    const result = await db.collection('categories').deleteOne({ _id: objectId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Kategori bulunamadı." });
    }
    res.status(204).send(); 
  } catch (err) {
    console.error("Kategori silme hatası:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});


// --- 3C. ETİKET API ENDPOINT'LERİ (FAZ 2) ---
// ... (Etiketler için olan GET, POST, PUT, DELETE kodlarınızın tamamı - değişiklik yok) ...
app.get('/api/v1/tags', async (req, res) => {
  try {
    const tags = await db.collection('tags').find({}).toArray();
    res.json(tags);
  } catch (err) {
    console.error("Etiket listeleme hatası:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});
app.post('/api/v1/tags', async (req, res) => {
  try {
    const newTag = req.body;
    if (!newTag.key || !newTag.translations || 
        !newTag.translations.tr || !newTag.translations.en ||
        !newTag.translations.de || !newTag.translations.fr) {
      return res.status(400).json({ 
        error: "Eksik bilgi: 'key' ve 'translations.tr', 'en', 'de', 'fr' alanları zorunludur." 
      });
    }
    const result = await db.collection('tags').insertOne(newTag);
    const createdDocument = {
      _id: result.insertedId,
      ...newTag
    };
    res.status(201).json(createdDocument);
  } catch (err) {
    console.error("Etiket ekleme hatası:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});
app.put('/api/v1/tags/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    let objectId;
    try {
      objectId = new ObjectId(id);
    } catch (err) {
      return res.status(400).json({ error: "Geçersiz ID formatı." });
    }
    if (!updateData.key || !updateData.translations ||
        !updateData.translations.tr || !updateData.translations.en ||
        !updateData.translations.de || !updateData.translations.fr) {
      return res.status(400).json({ 
        error: "Eksik bilgi: 'key' ve 'translations.tr', 'en', 'de', 'fr' alanları zorunludur." 
      });
    }
    const result = await db.collection('tags').updateOne(
      { _id: objectId },
      { $set: { key: updateData.key, translations: updateData.translations } }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Etiket bulunamadı." });
    }
    res.json({ message: "Etiket başarıyla güncellendi.", updatedId: id });
  } catch (err) {
    console.error("Etiket güncelleme hatası:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});
app.delete('/api/v1/tags/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let objectId;
    try {
      objectId = new ObjectId(id);
    } catch (err) {
      return res.status(400).json({ error: "Geçersiz ID formatı." });
    }
    const result = await db.collection('tags').deleteOne({ _id: objectId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Etiket bulunamadı." });
    }
    res.status(204).send(); 
  } catch (err) {
    console.error("Etiket silme hatası:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});


// --- (YENİ) HARİTA "GEO-INDEX" API'LERİ (YENİ MİMARİ) ---

/**
 * GET /api/v1/locations/index
 * Haritanın ilk yüklemesi için TÜM lokasyonların HAFİF (lightweight)
 * verisini (sadece 'id', 'lat', 'lng', 'city', 'categoryKey' ve 'title' objesi) döndürür.
 */
app.get('/api/v1/locations/index', async (req, res) => {
  try {
    const projection = {
      _id: 0,
      id: 1,
      lat: 1,
      lng: 1,
      city: 1,
      categoryKey: 1,
      // DİREKT İHTİYACIMIZ OLAN ALT ALANLARI İSTİYORUZ.
      "translations.tr.title": 1,
      "translations.en.title": 1,
      "translations.de.title": 1,
      "translations.fr.title": 1,
      // Not: Bu, 'description' ve 'audioPath' gibi ağır verileri almaz.
      //"translations.title": 1 // Sadece 'title' objesini al (tüm diller)
    };
    
    // Sadece 'Yayında (True)' olanları haritada göster
    const locationsIndex = await db.collection('locations')
      .find({ isPublished: true }) 
      .project(projection)
      .toArray();
      
    res.json(locationsIndex);
  } catch (err) {
    console.error("Lokasyon index çekme hatası:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

/**
 * GET /api/v1/locations/details/:id
 * Haritada bir pine tıklandığında, o TEK lokasyonun TÜM AĞIR verilerini
 * (tüm çeviriler, etiketler, yıl vb.) getirir.
 */
app.get('/api/v1/locations/details/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // 'id' (string) alanına göre arama yapıyoruz
    const location = await db.collection('locations').findOne({ id: id }); 

    if (!location) {
      return res.status(404).json({ error: "Lokasyon bulunamadı." });
    }
    
    // Frontend'in (showDetails) 4 dili de işlemesi için tüm 'translations' objesini yolluyoruz
    res.json(location);

  } catch (err) {
    console.error("Tekil lokasyon detayı çekme hatası:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});


// --- 3D. LOKASYON YÖNETİM (CRUD) API'LERİ (FAZ 3) ---

/**
 * GET /api/v1/meta/cities
 * Filtre dropdown'ı için veritabanındaki TÜM EŞSİZ şehir adlarını çeker.
 */
app.get('/api/v1/meta/cities', async (req, res) => {
  try {
    // ... (Mevcut meta/cities kodunuz - değişiklik yok) ...
    const cities = await db.collection('locations').distinct('city');
    res.json(cities.sort()); 
  } catch (err) {
    console.error("Şehir listesi çekme hatası:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});


/**
 * GET /api/v1/locations/:id
 * (Bu, YÖNETİM PANELİ'nin kullandığı detay endpoint'idir. 'details/:id' ile aynıdır
 * ama ayırıyoruz ki ileride admin için farklı veriler (örn: yayınlanmamış) gönderebilelim.)
 */
app.get('/api/v1/locations/:id', async (req, res) => {
  try {
    // ... (Mevcut locations/:id kodunuz - değişiklik yok) ...
    const { id } = req.params; 
    const location = await db.collection('locations').findOne({ id: id }); 
    if (!location) {
      return res.status(404).json({ error: "Lokasyon bulunamadı." });
    }
    res.json(location);
  } catch (err) {
    console.error("Tekil lokasyon çekme hatası:", err); 
    res.status(500).json({ error: "Sunucu hatası" });
  }
});


/**
 * PUT /api/v1/locations/:id
 * Lokasyon yönetim panelindeki "Kaydet" butonu.
 */
app.put('/api/v1/locations/:id', async (req, res) => {
  try {
    // ... (Mevcut PUT locations/:id kodunuz - değişiklik yok) ...
    const { id } = req.params;
    const updateData = req.body;
    delete updateData._id; 
    const result = await db.collection('locations').updateOne(
      { id: id },
      { $set: updateData }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Güncellenecek lokasyon bulunamadı." });
    }
    res.json({ message: "Lokasyon başarıyla güncellendi.", updatedId: id });
  } catch (err) {
    console.error("Lokasyon güncelleme hatası:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});




// --- 4. SUNUCUYU BAŞLATMA ---

// Önce MongoDB'ye bağlan, BAŞARILI olursa API sunucusunu başlat
MongoClient.connect(CONNECTION_STRING)
  .then(client => {
    console.log('✅ MongoDB Atlas\'a başarıyla bağlandı.');
    db = client.db(DB_NAME); // Veritabanı bağlantısını 'db' değişkenine ata

    // Veritabanı hazır, şimdi API'yi dinlemeye başla
    app.listen(PORT, () => {
      console.log(`🚀 API Sunucusu http://localhost:${PORT} adresinde çalışıyor.`);
      // Eski BBox endpoint'ini log'dan kaldırabiliriz, ama zararı yok.
      console.log(`🗺️ Lokasyon endpoint'i: http://localhost:${PORT}/api/v1/locations`);
    });
  })
  .catch(err => {
    console.error('❌ MongoDB bağlantı hatası!');
    console.error(err);
    process.exit(1); // Bağlanamazsa uygulamayı durdur
  });