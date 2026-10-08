# Отслеживание ошибок (Sentry)

Если у хозяина или гостя что-то сломалось, ошибка сама приходит в Sentry:
на каком экране, на каком телефоне, в каком месте кода. Скриншоты присылать
не нужно — достаточно сказать «посмотри Sentry».

Пока ключ не вписан, приложение и сервер ничего никуда не отправляют.

## Что уходит и что нет

- Уходит: текст ошибки, место в коде, экран, модель телефона и браузер.
- Не уходит: имена, телефоны гостей, IP-адреса, содержимое форм.
  Секретные ключи брони вырезаются из адресов (`?t=[filtered]`).

## Подключение (10 минут, один раз)

1. Зарегистрируйтесь на <https://sentry.io> (бесплатного тарифа Developer
   хватает на бету). Регион данных — **EU**.
2. Создайте проект **Browser JavaScript** → название `voyz-app`.
   Скопируйте **DSN** — строка вида `https://…@….ingest.de.sentry.io/…`.
3. Создайте второй проект **Node.js** → `voyz-server`, скопируйте его DSN.
4. **Приложение:** GitHub → репозиторий → Settings → Secrets and variables →
   Actions → вкладка **Variables** → New repository variable:
   `VITE_SENTRY_DSN` = DSN проекта `voyz-app`.
   Затем Actions → «Web — check and publish» → Run workflow (и «Android» тоже).
5. **Сервер:** Render → `voyz-booking-api` → Environment →
   `SENTRY_DSN` = DSN проекта `voyz-server` → Save. Сервер перезапустится сам.
   На своём сервере — строка `SENTRY_DSN=` в `deploy/.env`.

## Уведомления

В Sentry: Alerts → Create Alert → «Issues» → «A new issue is created» →
отправлять на почту. Можно подключить Telegram через интеграцию Sentry.
