const fs = require('fs').promises;
const path = require('path');
const { MongoClient } = require('mongodb');

// --- 1. YAPILANDIRMA ---

// !!! BURAYA KENDİ ATLAS BAĞLANTI ADRESİNİZİ YAPIŞTIRIN !!!
const CONNECTION_STRING = "mongodb+srv://cmtsy:Eda.2010@cmtsy01.q7voyf0.mongodb.net/?appName=cmtsy01";

const DB_NAME = "travelAppDB"; // Hedef veritabanı adı

// İşlenecek koleksiyonların ve kaynak dosyalarının haritası
const COLLECTIONS_TO_SYNC = [
  {
    name: "locations",
    fileName: "locations_v2.json"
  },
  {
    name: "categories",
    fileName: "categories.json"
  },
  {
    name: "tags",
    fileName: "tags.json"
  }
];

// --- 2. YARDIMCI FONKSİYONLAR ---

/**
 * Bir JSON dosyasını okur ve içeriğini (dizi olarak) döndürür.
 * Dosya { "key": [...] } formatındaysa içindeki diziyi akıllıca bulur.
 */
async function readJsonFile(fileName) {
  const filePath = path.join(__dirname, fileName);
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const parsedData = JSON.parse(data);

    // Veri zaten bir dizi ise (örn: locations_v2.json)
    if (Array.isArray(parsedData)) {
      return parsedData;
    }

    // Veri bir nesne ise (örn: { "markers": [...] } veya { "categories": [...] })
    // İçindeki ilk (ve tek) diziyi bul ve onu döndür
    if (typeof parsedData === 'object' && parsedData !== null) {
      const keys = Object.keys(parsedData);
      if (keys.length === 1 && Array.isArray(parsedData[keys[0]])) {
        console.log(`  (${fileName}) -> "${keys[0]}" anahtarı altındaki dizi okundu.`);
        return parsedData[keys[0]];
      }
    }
    
    throw new Error(`Dosya formatı anlaşılamadı. Dizi [ ... ] veya { "key": [ ... ] } olmalı.`);

  } catch (err) {
    console.error(`❌ Hata: ${filePath} dosyası okunamadı veya parse edilemedi.`, err.message);
    throw err; // Ana işlemi durdur
  }
}

// --- 3. ANA İŞLEM FONKSİYONU ---

async function runSync() {
  // Bağlantı string'inin doldurulup doldurulmadığını kontrol et
  if (CONNECTION_STRING.includes("kullanici:sifre") || CONNECTION_STRING.includes("...")) {
    console.error("--- ❌ HATA ---");
    console.error("Lütfen 'CONNECTION_STRING' değişkenini kendi MongoDB Atlas adresinizle güncelleyin.");
    return; // Script'i çalıştırma
  }

  console.log("MongoDB Atlas'a bağlanılıyor...");
  const client = new MongoClient(CONNECTION_STRING);

  try {
    // 1. Bağlan
    await client.connect();
    const db = client.db(DB_NAME);
    console.log(`✅ Başarıyla bağlandı. Veritabanı: ${DB_NAME}`);
    console.log("---");

    // 2. Koleksiyonları döngüye al ve senkronize et
    for (const collectionInfo of COLLECTIONS_TO_SYNC) {
      const collectionName = collectionInfo.name;
      const fileName = collectionInfo.fileName;
      
      console.log(`🔄 İşlem başlıyor: "${collectionName}" koleksiyonu...`);

      // 2a. Kaynak JSON dosyasını oku
      const data = await readJsonFile(fileName);

      if (!data || data.length === 0) {
        console.warn(`  ⚠️ Uyarı: ${fileName} boş veya geçersiz. "${collectionName}" koleksiyonu atlanıyor.`);
        continue;
      }

      const collection = db.collection(collectionName);

      // 2b. Eski verileri sil (Mükerrerliği engelleme kuralı)
      console.log(`  - Eski veriler siliniyor (deleteMany)...`);
      await collection.deleteMany({});

      // 2c. Yeni verileri ekle
      console.log(`  - ${data.length} adet yeni veri ekleniyor (insertMany)...`);
      await collection.insertMany(data);
      
      console.log(`  👍 "${collectionName}" koleksiyonu başarıyla senkronize edildi.`);
    }

    console.log("---");
    console.log("✨✨✨ Veri aktarımı başarıyla tamamlandı! ✨✨✨");

  } catch (err) {
    console.error("\n--- ❌ KRİTİK HATA OLUŞTU ---");
    console.error(err.message);
    if (err.name === 'MongoNetworkError') {
      console.error("İPUCU: MongoDB Atlas'ta mevcut IP adresinizi beyaz listeye (Whitelist) eklediğinizden emin olun!");
    }
  } finally {
    // 3. Ne olursa olsun bağlantıyı kapat
    console.log("Bağlantı kapatılıyor...");
    await client.close();
  }
}

// Script'i çalıştır
runSync();