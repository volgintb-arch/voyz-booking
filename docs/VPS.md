# Перенос на свой сервер (живой сезон, D-006)

Всё — база, сервер, HTTPS, ежедневные бэкапы — запускается одной командой из
папки `deploy/`.

## 1. Арендовать сервер

VPS у хостинга в Кыргызстане (ElCat, Aknet, Megaline и др.):

| Параметр | Минимум | Комфортно |
|---|---|---|
| Процессор | 1 ядро | 2 ядра |
| Память | 2 ГБ | 4 ГБ |
| Диск | 20 ГБ SSD | 40 ГБ SSD |
| Система | Ubuntu 24.04 | Ubuntu 24.04 |

Нужен **белый (публичный) IP** и доступ по SSH.

## 2. Домен

Например `api.voyz.kg`: у регистратора домена добавьте запись **A** → IP сервера.

## 3. Запустить

На сервере (подключившись по SSH):

```bash
curl -fsSL https://get.docker.com | sh
git clone https://github.com/volgintb-arch/voyz-booking.git
cd voyz-booking/deploy
cp .env.example .env
nano .env          # заполнить: домен, пароли, токен бота
docker compose up -d --build
```

Проверка: `https://api.voyz.kg/health` → `{"ok":true}`.
Сертификат HTTPS Caddy получает сам за минуту после запуска.

Случайные строки для паролей: `openssl rand -base64 33 | tr -d '/+='`.

## 4. Перенести данные с Render

Адрес базы Render: Render → база **voyz-db** → **Connections** →
**External Database URL** (это секрет — только в терминал сервера).

```bash
# 1) выгрузка из Render
docker run --rm postgres:17-alpine pg_dump --no-owner --no-privileges \
  "postgresql://voyz:ПАРОЛЬ@dpg-xxxx.frankfurt-postgres.render.com/voyz" > voyz.sql

# 2) загрузка в новую базу: сначала остановить API, чтобы он не создал пустые таблицы
docker compose stop api
docker compose exec -T db psql -U voyz -d voyz -c 'drop schema public cascade; create schema public;'
docker compose exec -T db psql -U voyz -d voyz < voyz.sql
docker compose start api
```

Фотографии объектов хранятся в той же базе — переедут вместе с ней.

**Важно:** `SERVER_SECRET` в `.env` должен быть **тем же**, что на Render
(Render → сервис → Environment), иначе сохранённые ключи Aynes не расшифруются.

## 5. Переключить приложение

- GitHub → Settings → Variables → `VITE_API_URL` = `https://api.voyz.kg/` →
  Actions → Web и Android → Run workflow.
- Telegram-бот переключится на новый сервер сам при запуске.
- Render после проверки можно остановить.

## Бэкапы и обновления

- Каждую ночь: `deploy/backups/voyz-ГГГГ-ММ-ДД.dump`, хранятся 14 дней.
  Копируйте их и на другой компьютер (например, `scp` раз в неделю).
- Восстановление: `docker compose exec -T db pg_restore -U voyz -d voyz --clean < backups/voyz-ДАТА.dump`.
- Обновить сервер до новой версии: `git pull && docker compose up -d --build`.
