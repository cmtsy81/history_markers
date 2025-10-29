const fs = require('fs').promises;
const path = require('path');

// --- Eşleştirme Haritaları (Kurallar) ---
const categoryMap = {
  "Saray": "palace",
  "Müze": "museum",
  "Kale": "castle",
  "Kilise": "church",
  "Meydan": "square",
  "Köprü": "bridge",
  "Park": "park",
  "Bina": "building", // Örnekten "Bina" eklendi
  // Eklemeler buraya...
};

const tagMap = {
  "unesco": "unesco",
  "tarihi": "historical",
  "kale": "castle",
  "müze": "museum",
  "ikonik": "iconic",
  "manzara": "viewpoint",
  "dini": "religious",
  "mimari": "architecture", // Örnekten "mimari" eklendi
  "neogotik": "neo-gothic", // Örnekten "neogotik" eklendi
  // Eklemeler buraya...
};

// --- Dosya Yolları ---
const INPUT_FILE = path.join(__dirname, 'locations_original.json');
const OUTPUT_FILE = path.join(__dirname, 'locations_v2.json');

/**
 * Tek bir lokasyon objesini v1'den v2 formatına dönüştürür.
 * (Bu fonksiyonda değişiklik yok)
 */
function transformLocation(obj) {
  const { category, tags, imageFile, translations, lat, lng, ...rest } = obj;

  const location = {
    type: "Point",
    coordinates: [lng, lat]
  };

  // Haritada olmayan kategoriyi logla ama null ata
  const categoryKey = categoryMap[category] || null;
  if (!categoryKey && category) {
    console.warn(`  [Uyarı] Bilinmeyen kategori: "${category}" (ID: ${obj.id}) -> 'null' olarak ayarlandı.`);
  }

  // Haritada olmayan etiketleri logla ve filtrele
  const tagKeys = tags
    .map(tag => {
      const mappedTag = tagMap[tag];
      if (!mappedTag && tag) {
        console.warn(`  [Uyarı] Bilinmeyen etiket: "${tag}" (ID: ${obj.id}) -> atlanacak.`);
      }
      return mappedTag;
    })
    .filter(Boolean);

  const thumbnailUrl = imageFile;
  const imageUrls = [imageFile];

  const newTranslations = Object.entries(translations)
    .reduce((acc, [langCode, transData]) => {
      const { audioFile, ...transRest } = transData;
      acc[langCode] = {
        ...transRest,
        audioPath: audioFile
      };
      return acc;
    }, {});

  const newFields = {
    address: null,
    openingHours: null,
    websiteUrl: null,
    ticketUrl: null,
    ourScore: null,
    packageId: null,
  };

  return {
    ...rest,
    lat,
    lng,
    location,
    categoryKey,
    tagKeys,
    thumbnailUrl,
    imageUrls,
    ...newFields,
    translations: newTranslations
  };
}

/**
 * Ana işlem fonksiyonu (SON REVİZYON)
 */
async function runTransformation() {
  try {
    // 1. Orijinal dosyayı oku
    console.log(`Okunuyor: ${INPUT_FILE}...`);
    const data = await fs.readFile(INPUT_FILE, 'utf8');
    const originalData = JSON.parse(data);

    let originalLocations; // İşlenecek *asıl* lokasyon dizisi

    // 2. Veri yapısını akıllıca kontrol et
    if (Array.isArray(originalData)) {
      console.log("Kök veri yapısı 'dizi' (array) olarak algılandı.");
      originalLocations = originalData;
    } else if (typeof originalData === 'object' && originalData !== null && Array.isArray(originalData.markers)) {
      // DÜZELTME: "locations" yerine "markers" anahtarını ara
      console.log("Kök 'nesne' (object) olarak algılandı. 'markers' anahtarındaki dizi işlenecek.");
      originalLocations = originalData.markers; // DİZİYİ İÇERİDEN AL
    } else {
      throw new Error("Giriş dosyası bir JSON dizisi [ ... ] veya { \"markers\": [ ... ] } formatında olmalıdır.");
    }

    if (!originalLocations || originalLocations.length === 0) {
      throw new Error("İşlenecek lokasyon bulunamadı (dizi boş veya tanımsız).");
    }

    console.log(`${originalLocations.length} adet lokasyon bulundu.`);

    // 3. Tüm lokasyonları dönüştür
    console.log("Dönüşüm başlıyor...");
    const transformedLocations = originalLocations.map(transformLocation);

    // 4. Yeni dosyayı yaz
    console.log(`Yazılıyor: ${OUTPUT_FILE}...`);
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(transformedLocations, null, 2));

    console.log("\n--- ✨ Dönüşüm Başarıyla Tamamlandı! ---");
    console.log(`Toplam ${transformedLocations.length} lokasyon işlendi.`);
    console.log(`Çıktı dosyası: ${OUTPUT_FILE}`);

  } catch (error) {
    console.error("\n--- ❌ HATA OLUŞTU ---");
    console.error(error.message);
  }
}

// Script'i çalıştır
runTransformation();