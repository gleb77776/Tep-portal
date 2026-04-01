# Tep Portal — мобильный клиент (Expo / React Native)

Минимальный клиент к существующему бэкенду: вход через `POST /api/v1/user/login`, профиль через `GET /api/v1/user/me?username=…`. Ключ хранения логина совпадает с вебом: `ad_username`.

## Запуск

```bash
cd mobile
npm install
npm start
```

Дальше — Expo Go на телефоне или эмулятор (`npm run android`).

## URL бэкенда

По умолчанию в `app.json` → `expo.extra.apiBaseUrl`:

- **Android Emulator:** `http://10.0.2.2:8000` (доступ к `localhost:8000` на ПК)
- **Реальное устройство в Wi‑Fi:** замените на `http://<IP-вашего-ПК>:8000`
- **iOS Simulator:** обычно `http://127.0.0.1:8000`

Для HTTP на Android включено `usesCleartextTraffic`. В продакшене — HTTPS и свой домен.

## Следующие шаги разработки

- Экраны разделов (новости, проекты) повторно используют те же эндпоинты, что `frontend/src`.
- Опционально: Expo SecureStore для чувствительных данных, deep links, push.
