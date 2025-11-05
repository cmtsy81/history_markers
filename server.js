// DOSYA: server.js (DÜZELTİLMİŞ VE "EV ÖDEVİ" EKLENMİŞ HALİ)

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
// ... (Bu /api/v1/locations kodunda değişiklik yok) ...
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

// --- YENİ EKLENEN KATEGORİ FİLTRESİ KODU ---
const { categoryKey } = req.query;
if (categoryKey && categoryKey.trim() !== '') {
  query.categoryKey = categoryKey;
}
// --- BİTTİ ---
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
// ... (Bu /index, /cluster-details, /details/:id kodlarında değişiklik yok) ...
app.get('/api/v1/locations/index', async (req, res) => {
  try {
    const projection = {
      _id: 0,
      id: 1,
      lat: 1,
      lng: 1,
      city: 1,
      categoryKey: 1,
      lastUpdated: 1, 
      "translations.tr.title": 1,
      "translations.en.title": 1,
      "translations.de.title": 1,
      "translations.fr.title": 1,
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
app.get('/api/v1/locations/cluster-details', async (req, res) => {
  try {
    const { ids } = req.query;
    
    if (!ids || ids.trim() === '') {
      return res.status(400).json({ error: "ids parametresi gereklidir." });
    }
    
    const idArray = ids.split(',').map(id => id.trim());
    
    const locations = await db.collection('locations')
      .find({ id: { $in: idArray } })
      .toArray();
    
    res.json(locations);
    
  } catch (err) {
    console.error("Cluster detayları çekme hatası:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});
app.get('/api/v1/locations/details/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const location = await db.collection('locations').findOne({ id: id }); 

    if (!location) {
      return res.status(404).json({ error: "Lokasyon bulunamadı." });
    }
    
    res.json(location);

  } catch (err) {
    console.error("Tekil lokasyon detayı çekme hatası:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});


// --- 3D. LOKASYON YÖNETİM (CRUD) API'LERİ (FAZ 3) ---
// ... (Bu /meta/cities kodunda değişiklik yok) ...
app.get('/api/v1/meta/cities', async (req, res) => {
  try {
    const cities = await db.collection('locations').distinct('city');
    res.json(cities.sort()); 
  } catch (err) {
    console.error("Şehir listesi çekme hatası:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// ... (Bu 'generateLocationId' kodunda değişiklik yok) ...
async function generateLocationId(city) {
  try {
    const lastLocation = await db.collection('locations')
      .find({ id: { $regex: `^${city}_` } })
      .sort({ _id: -1 })
      .limit(1)
      .toArray();

    if (lastLocation.length === 0) {
      return `${city}_001`;
    }

    const lastId = lastLocation[0].id;
    const lastNumber = parseInt(lastId.split('_')[1]);
    const newNumber = String(lastNumber + 1).padStart(3, '0');
    
    return `${city}_${newNumber}`;
  } catch (err) {
    console.error("ID oluşturma hatası:", err);
    return `${city}_001`;
  }
}

// ... (Bu POST /locations kodunda değişiklik yok) ...
app.post('/api/v1/locations', async (req, res) => {
  try {
    const { 
      city, lat, lng, translations, builtYear, thumbnailUrl, 
      isPublished, categoryKey, tagKeys
    } = req.body;

    if (!city || lat === undefined || lng === undefined) {
      return res.status(400).json({ error: "Şehir, lat ve lng zorunludur." });
    }

    if (!translations || !translations.tr || !translations.tr.title) {
      return res.status(400).json({ error: "TR başlığı zorunludur." });
    }

    const newId = await generateLocationId(city.toLowerCase());

    const newLocation = {
      id: newId,
      city: city.toLowerCase(),
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      location: {
        type: "Point",
        coordinates: [parseFloat(lng), parseFloat(lat)] // GeoJSON: [lng, lat]
      },
      builtYear: builtYear || null,
      thumbnailUrl: thumbnailUrl || '',
      imageUrls: [],
      isPublished: isPublished || false,
      categoryKey: categoryKey || null,
      tagKeys: tagKeys || [],
      address: null,
      openingHours: null,
      websiteUrl: null,
      ticketUrl: null,
      ourScore: null,
      packageId: null,
      translations: {
        tr: translations.tr || { title: '', description: '', audioPath: '' },
        en: translations.en || { title: '', description: '', audioPath: '' },
        de: translations.de || { title: '', description: '', audioPath: '' },
        fr: translations.fr || { title: '', description: '', audioPath: '' }
      },
      lastUpdated: new Date()
    };

    const result = await db.collection('locations').insertOne(newLocation);

    console.log(`✅ Yeni lokasyon oluşturuldu: ${newId} (${city})`);
    res.status(201).json(newLocation);

  } catch (err) {
    console.error("Lokasyon oluşturma hatası:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// ... (Bu /admin/list-by-city kodunda değişiklik yok) ...
app.get('/api/v1/admin/list-by-city', async (req, res) => {
    try {
      const { city } = req.query;

      if (!city || city.trim() === '') {
        return res.status(400).json({ error: "Şehir (city) parametresi gereklidir." });
      }

      const query = {
        city: city
      };
      
      const projection = {
        _id: 0,
        id: 1,
        city: 1,
        categoryKey: 1, 
        "translations.tr.title": 1,
        "translations.en.title": 1,
        "translations.de.title": 1,
        "translations.fr.title": 1,
      };

      const locations = await db.collection('locations')
        .find(query)
        .project(projection)
        .toArray();
        
      res.json(locations);

    } catch (err) {
      console.error("Şehre göre liste çekme hatası:", err);
      res.status(500).json({ error: "Sunucu hatası" });
    }
  });

// ... (Bu /locations/:id (GET) kodunda değişiklik yok) ...
app.get('/api/v1/locations/:id', async (req, res) => {
  try {
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

// ... (Bu PUT /locations/:id kodunda değişiklik yok) ...
app.put('/api/v1/locations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    delete updateData._id;
    
    if (updateData.lat !== undefined && updateData.lng !== undefined) {
      updateData.location = {
        type: "Point",
        coordinates: [parseFloat(updateData.lng), parseFloat(updateData.lat)]
      };
    }
    
    updateData.lastUpdated = new Date();

    const result = await db.collection('locations').updateOne(
      { id: id },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Güncellenecek lokasyon bulunamadı." });
    }

    console.log(`✅ Lokasyon güncellendi: ${id}`);
    res.json({ message: "Lokasyon başarıyla güncellendi.", updatedId: id });

  } catch (err) {
    console.error("Lokasyon güncelleme hatası:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// ... (Bu DELETE /locations/:id kodunda değişiklik yok) ...
app.delete('/api/v1/locations/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.collection('locations').deleteOne({ id: id });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Silinecek lokasyon bulunamadı." });
    }

    console.log(`✅ Lokasyon silindi: ${id}`);
    res.status(200).json({ message: "Lokasyon başarıyla silindi.", deletedId: id });

  } catch (err) {
    console.error("Lokasyon silme hatası:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});


// --- (YENİ) PAKET YÖNETİMİ API'LERİ (FAZ 4 - "EV ÖDEVİ") ---

/**
 * ADIM 1.A: PAKET LİSTESİ API'si
 * 'paketler.html' sayfası için tüm mevcut şehirleri (paketleri)
 * ve içlerindeki toplam marker sayısını listeler.
 */
app.get('/api/v1/packages/summary', async (req, res) => {
  console.log("API İsteği: /packages/summary (Paket Listesi) çekiliyor...");
  
  try {
    // MongoDB'nin "Aggregation Pipeline" (Toplama Hattı) özelliğini kullanıyoruz.
    // 'db.collection' kullanarak senin native driver koduna uyum sağlandı.
    const summary = await db.collection('locations').aggregate([
      {
        // 1. Aşama: Sadece yayında olanları filtrele
        $match: { isPublished: true }
      },
      {
        // 2. Aşama: "city" (şehir) alanına göre grupla
        $group: {
          _id: "$city", // "city" alanını 'id' olarak grupla (örn: "budapest")
          markerCount: { $sum: 1 } // Her gruptaki dökümanları say
        }
      },
      {
        // 3. Aşama: Çıktıyı "şık" hale getir
        $project: {
          _id: 0, // MongoDB'nin '_id' alanını kaldır
          id: "$_id", // '_id'yi 'id' olarak yeniden adlandır
          name: { // 'budapest' kelimesini 'Budapest' (Baş Harfi Büyük) yap
            $concat: [
              { $toUpper: { $substrCP: [ "$_id", 0, 1 ] } },
              { $substrCP: [ "$_id", 1, { $strLenCP: "$_id" } ] }
            ]
          },
          markerCount: 1, // Sayım sonucunu dahil et
          
          // Not: sizeMB (tahmini boyut) hesaplaması çok karmaşık.
          // "Tane tane" gidelim, onu şimdilik '0' yapıyoruz.
          sizeMB: 0 
        }
      },
      {
        // 4. Aşama: Şehir adına (id) göre sırala
        $sort: { id: 1 } 
      }
    ]).toArray(); // <-- Native driver için .toArray() gerekli

    res.json(summary);

  } catch (err) {
    console.error("Paket özeti (summary) çekilemedi:", err);
    res.status(500).json({ message: "Sunucu hatası: " + err.message });
  }
});

// (Buraya 'Adım 1.B' olan /packages/details/:cityId endpoint'i gelecek)


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