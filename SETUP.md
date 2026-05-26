# 🔧 Admin Panel Setup (Firebase)

## 1. Firebase Project yaratish

1. https://console.firebase.google.com ga o'ting
2. "Add project" bosing → nom bering (masalan: `ai-agent-analytics`)
3. Google Analytics — o'chirib qo'yishingiz mumkin
4. "Create project" bosing

## 2. Realtime Database yaratish

1. Firebase Console → Build → **Realtime Database**
2. "Create Database" bosing
3. Location: `us-central1` (yoki yaqin region)
4. Security rules: **"Start in test mode"** tanlang (keyinroq himoyalaymiz)
5. "Enable" bosing

## 3. Firebase Config olish

1. Firebase Console → Project Settings (⚙️ icon)
2. "General" tab → pastda "Your apps" → **Web app** (</> icon) bosing
3. App nom bering → "Register app"
4. Ko'rsatilgan `firebaseConfig` ni nusxalang

## 4. Admin Panel'ga config qo'yish

`admin-panel/admin.js` faylida:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",                    // ← O'zingizniki
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.firebaseio.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

## 5. Extension'ga analytics URL qo'yish

Extension Settings (options) sahifasida eng pastda:
- **Firebase Realtime DB URL** maydoniga:
  `https://your-project-default-rtdb.firebaseio.com`

Bu URL extension'dan analytics yuborish uchun ishlatiladi.

## 6. Admin Panel'ni ochish

`admin-panel/index.html` faylini brauzerda oching:
- Lokal: fayl sifatida oching
- Yoki hosting'ga joylashtiring (Firebase Hosting, Vercel, Netlify)

## 7. Security Rules (production uchun)

Firebase Console → Realtime Database → Rules:

```json
{
  "rules": {
    "events": {
      ".read": false,
      ".write": true
    },
    "users": {
      "$uid": {
        ".read": false,
        ".write": true
      }
    },
    "stats": {
      ".read": false,
      ".write": true
    }
  }
}
```

Admin panel uchun alohida auth qo'shishingiz mumkin.

## 📊 Nima ko'rasiz

| Bo'lim | Ma'lumot |
|--------|----------|
| Dashboard | Jami userlar, so'rovlar, aktiv userlar, amallar, 7 kunlik grafik |
| Foydalanuvchilar | Har bir user: ID, birinchi kirish, oxirgi faollik, so'rovlar soni, asosiy AI |
| AI Providerlar | Har bir AI: so'rovlar, xatolar, muvaffaqiyat %, taqqoslash |
| So'rovlar | Jadval: vaqt, user, AI, xabar, amallar, holat |
| Real-time | Jonli feed — userlar nima qilayotganini real-time ko'rish |
