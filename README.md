# fasthook-cli

`fasthook-cli` - локальный CLI для FastHook. Он умеет открывать tunnel для CLI destination и вызывать основные REST-команды FastHook API из терминала.

API по умолчанию: `https://api.fasthook.io/v1`  
Tunnel endpoint по умолчанию: `https://tunnel.fasthook.io/connect`

## Требования

- Node.js `20` или новее для запуска из исходников.
- FastHook project API key, например `fhp_xxx`.
- Для tunnel нужна CLI destination в FastHook dashboard, например `des_xxx`.

## Установка

```bash
npm install
npm run build
```

После сборки CLI можно запускать несколькими способами.

## Запуск как Node.js CLI

Из корня репозитория:

```bash
npx . --help
npx . login --api-key fhp_xxx
npx . tunnel --destination des_xxx --to 8080
```

То же самое напрямую через собранный файл:

```bash
node dist/index.js --help
node dist/index.js login --api-key fhp_xxx
node dist/index.js tunnel --destination des_xxx --to http://localhost:8080
```

Для разработки без ручной сборки:

```bash
npm run dev -- --help
npm run dev -- tunnel --destination des_xxx --to 8080
```

Если пакет установлен как bin, команда называется `fasthook`:

```bash
fasthook --help
fasthook tunnel --destination des_xxx --to 8080
```

## Запуск как Windows exe

В репозитории уже может лежать `fasthook.exe`. Его можно запускать без установленного Node.js:

```powershell
.\fasthook.exe --help
.\fasthook.exe login --api-key fhp_xxx
.\fasthook.exe tunnel --destination des_xxx --to 8080
```

Собрать новый exe:

```bash
npm run build:exe
```

Скрипт собирает `dist/index.js` и создает `fasthook.exe` для Windows x64.

## Быстрый старт

Сохранить API key:

```bash
npx . login --api-key fhp_xxx
```

Сохранить destination по умолчанию:

```bash
npx . config --destination des_xxx
```

Запустить tunnel на локальный порт `8080`:

```bash
npx . tunnel
```

Или явно:

```bash
npx . tunnel --destination des_xxx --to 8080
npx . tunnel des_xxx 8080
npx . tunnel 8080
```

`8080` нормализуется в `http://localhost:8080`. Также можно передавать `localhost:8080`, `http://localhost:8080` или локальный URL с path.

## Конфигурация

По умолчанию настройки сохраняются в:

```text
~/.fasthook/config.json
```

Путь можно переопределить переменной `FASTHOOK_CONFIG`.

Посмотреть текущую конфигурацию:

```bash
npx . config
```

Сохранить значения:

```bash
npx . config --destination des_xxx
npx . config --team tm_xxx
npx . login --api-key fhp_xxx --team tm_xxx
```

Удалить локальную конфигурацию:

```bash
npx . logout
```

Важно: local target не сохраняется в config. Он задается только на время запуска tunnel через `--to`, `FASTHOOK_LOCAL_URL` или позиционный аргумент.

## Переменные окружения

```bash
FASTHOOK_API_KEY=fhp_xxx
FASTHOOK_TEAM_ID=tm_xxx
FASTHOOK_DESTINATION_ID=des_xxx
FASTHOOK_LOCAL_URL=http://localhost:8080
FASTHOOK_CONFIG=/path/to/config.json
```

Для PowerShell:

```powershell
$env:FASTHOOK_API_KEY="fhp_xxx"
$env:FASTHOOK_DESTINATION_ID="des_xxx"
$env:FASTHOOK_LOCAL_URL="http://localhost:8080"
```

## Общие опции

| Опция | Описание |
| --- | --- |
| `--api-key fhp_xxx` | API key. Можно заменить переменной `FASTHOOK_API_KEY` или сохранить через `login`. |
| `--team tm_xxx` | Team id для API запросов. Также поддерживается `FASTHOOK_TEAM_ID`. |
| `-d, --destination des_xxx` | CLI destination id для tunnel. |
| `-t, --to 8080` | Локальная цель tunnel: порт или URL. |
| `--local-url 8080` | Синоним `--to` для tunnel. |
| `--json '{...}'` | JSON body для `POST`, `PUT`, `PATCH`. |
| `--json-file file.json` | JSON body из файла. |
| `-q, --quiet` | Минимум логов tunnel: connect/disconnect и фатальные ошибки. |
| `-v, --verbose` | Подробные логи tunnel по каждой доставке. |
| `-h, --help` | Показать справку. |

Для resource-команд все неизвестные флаги превращаются в query params. Например:

```bash
npx . requests list --limit 25 --status failed
```

отправит параметры `limit=25` и `status=failed`.

## JSON body

Создать или обновить ресурс можно через `--json`:

```bash
npx . destinations create --json '{"name":"Local dev","type":"cli","path":"/webhooks/orders"}'
```

Или через файл:

```bash
npx . destinations update des_xxx --json-file destination.json
```

В PowerShell одинарные кавычки вокруг JSON обычно удобнее, потому что двойные кавычки внутри JSON не нужно экранировать.

## Tunnel

```bash
npx . tunnel [destination_id] [local_target]
npx . tunnel --destination des_xxx --to 8080
npx . tunnel --destination des_xxx --to http://localhost:8080
```

Если `destination` сохранен в config или передан через `FASTHOOK_DESTINATION_ID`, можно запускать:

```bash
npx . tunnel
npx . tunnel 8080
```

Tunnel принимает только локальные HTTP(S) цели: `localhost`, `127.0.0.1` или `::1`. Если в FastHook destination настроен path, он будет добавлен к локальному target. Например destination path `/webhooks/orders` и target `http://localhost:8080` дадут запрос на:

```text
http://localhost:8080/webhooks/orders
```

Логи:

```bash
npx . tunnel --verbose
npx . tunnel --quiet
```

## Команды аккаунта и config

| Команда | Что делает |
| --- | --- |
| `fasthook login --api-key fhp_xxx [--team tm_xxx]` | Сохраняет API key и опционально team id. |
| `fasthook login fhp_xxx` | То же самое, API key передан позиционно. |
| `fasthook logout` | Удаляет локальный config file. |
| `fasthook config` | Показывает путь config, masked API key, destination и team id. |
| `fasthook config --destination des_xxx` | Сохраняет destination id. |
| `fasthook config --team tm_xxx` | Сохраняет team id. |
| `fasthook auth me` | Проверяет текущий API key через FastHook API. |
| `fasthook auth logout` | Вызывает API logout на сервере. Это не то же самое, что локальный `fasthook logout`. |

## Resource-команды

Общий формат:

```bash
fasthook <resource> <action> [id] [extra-id] [--json '{...}'] [query flags]
```

Если action не передан, используется `list`:

```bash
npx . sources
npx . sources list
```

### Sources

| Команда | HTTP |
| --- | --- |
| `fasthook sources list` | `GET /sources` |
| `fasthook sources get <id>` | `GET /sources/:id` |
| `fasthook sources create --json '{...}'` | `POST /sources` |
| `fasthook sources upsert --json '{...}'` | `PUT /sources` |
| `fasthook sources update <id> --json '{...}'` | `PUT /sources/:id` |
| `fasthook sources delete <id>` | `DELETE /sources/:id` |
| `fasthook sources enable <id>` | `POST /sources/:id/enable` |
| `fasthook sources disable <id>` | `POST /sources/:id/disable` |

### Destinations

| Команда | HTTP |
| --- | --- |
| `fasthook destinations list` | `GET /destinations` |
| `fasthook destinations get <id>` | `GET /destinations/:id` |
| `fasthook destinations create --json '{...}'` | `POST /destinations` |
| `fasthook destinations upsert --json '{...}'` | `PUT /destinations` |
| `fasthook destinations update <id> --json '{...}'` | `PATCH /destinations/:id` |
| `fasthook destinations delete <id>` | `DELETE /destinations/:id` |
| `fasthook destinations enable <id>` | `POST /destinations/:id/enable` |
| `fasthook destinations disable <id>` | `POST /destinations/:id/disable` |

### Connections

| Команда | HTTP |
| --- | --- |
| `fasthook connections list` | `GET /connections` |
| `fasthook connections get <id>` | `GET /connections/:id` |
| `fasthook connections create --json '{...}'` | `POST /connections` |
| `fasthook connections upsert --json '{...}'` | `PUT /connections` |
| `fasthook connections update <id> --json '{...}'` | `PUT /connections/:id` |
| `fasthook connections delete <id>` | `DELETE /connections/:id` |
| `fasthook connections pause <id>` | `PUT /connections/:id/pause` |
| `fasthook connections unpause <id>` | `PUT /connections/:id/unpause` |
| `fasthook connections enable <id>` | `POST /connections/:id/enable` |
| `fasthook connections disable <id>` | `POST /connections/:id/disable` |
| `fasthook connections latest-input <id>` | `GET /connections/:id/latest-input` |

### Transformations

| Команда | HTTP |
| --- | --- |
| `fasthook transformations list` | `GET /transformations` |
| `fasthook transformations get <id>` | `GET /transformations/:id` |
| `fasthook transformations create --json '{...}'` | `POST /transformations` |
| `fasthook transformations upsert --json '{...}'` | `PUT /transformations` |
| `fasthook transformations update <id> --json '{...}'` | `PUT /transformations/:id` |
| `fasthook transformations delete <id>` | `DELETE /transformations/:id` |
| `fasthook transformations run --json '{...}'` | `PUT /transformations/run` |
| `fasthook transformations executions <id>` | `GET /transformations/:id/executions` |
| `fasthook transformations execution <id> <executionId>` | `GET /transformations/:id/executions/:executionId` |

### Requests

| Команда | HTTP |
| --- | --- |
| `fasthook requests list` | `GET /requests` |
| `fasthook requests count` | `GET /requests/count` |
| `fasthook requests get <id>` | `GET /requests/:id` |
| `fasthook requests retry <id>` | `POST /requests/:id/retry` |
| `fasthook requests events <id>` | `GET /requests/:id/events` |
| `fasthook requests ignored-events <id>` | `GET /requests/:id/ignored_events` |
| `fasthook requests bulk-operations list` | `GET /requests/bulk_operations` |
| `fasthook requests bulk-operations create --json '{...}'` | `POST /requests/bulk_operations` |
| `fasthook requests bulk-operations cancel <id>` | `POST /requests/bulk_operations/:id/cancel` |

### Events

| Команда | HTTP |
| --- | --- |
| `fasthook events list` | `GET /events` |
| `fasthook events count` | `GET /events/count` |
| `fasthook events get <id>` | `GET /events/:id` |
| `fasthook events retry <id>` | `POST /events/:id/retry` |
| `fasthook events bulk-operations list` | `GET /events/bulk_operations` |
| `fasthook events bulk-operations create --json '{...}'` | `POST /events/bulk_operations` |
| `fasthook events bulk-operations cancel <id>` | `POST /events/bulk_operations/:id/cancel` |

### Attempts

| Команда | HTTP |
| --- | --- |
| `fasthook attempts list` | `GET /attempts` |
| `fasthook attempts get <id>` | `GET /attempts/:id` |

### Metrics

| Команда | HTTP |
| --- | --- |
| `fasthook metrics requests` | `GET /metrics/requests` |
| `fasthook metrics events` | `GET /metrics/events` |

### Project secrets

| Команда | HTTP |
| --- | --- |
| `fasthook project-secrets get` | `GET /project-secrets` |
| `fasthook project-secrets update --json '{...}'` | `PUT /project-secrets` |
| `fasthook project-secrets rotate` | `POST /project-secrets/rotate` |

## Raw API fallback

Если нужной команды нет в списке, можно вызвать API напрямую:

```bash
npx . api GET /sources
npx . api POST /destinations --json '{"name":"Local dev"}'
npx . api PATCH /destinations/des_xxx --json-file destination.json
```

Путь без домена считается относительным к `https://api.fasthook.io/v1`.

## Скрипты проекта

| Скрипт | Что делает |
| --- | --- |
| `npm run build` | Компилирует TypeScript в `dist/`. |
| `npm run dev -- <args>` | Запускает CLI из `src/` через `tsx`. |
| `npm start -- <args>` | Запускает `node dist/index.js`. |
| `npm test` | Собирает проект и запускает тесты. |
| `npm run build:exe` | Собирает Windows `fasthook.exe`. |

## Generated Control API contract

`contracts/control-api.openapi.json`, `contracts/control-api.schemas.json` and
`src/generated/control-api-client.ts` are synchronized from the backend-owned contract catalog.
The snapshot is intentionally partial: it covers only the eight project API key management
operations. Run `node scripts/check-control-api-contracts.mjs` to verify local checksums. Pull requests
run only this credential-free local gate. A separate trusted push/manual CI job compares the artifacts
with the backend when the read-only `FASTHOOK_BACKEND_READ_TOKEN` secret is configured; PR-controlled
code never receives that token.

The generated client's direct mode requires an explicit owner/site-admin session bearer in a
non-browser/non-Worker server context. It accepts the official HTTPS API origin by default; another
HTTPS origin requires an explicit matching `trustedServerOrigin`. Browser callers must use cookie mode
through the dashboard proxy. Existing CLI commands continue to authenticate with a project API key and
do not expose the owner-only key-management methods yet.
Regenerate from a sibling backend checkout with
`node ../fasthook/scripts/sync-control-api-consumers.mjs --write --consumer cli`.

## Примеры

```bash
# Проверить авторизацию
npx . auth me

# Получить список destinations
npx . destinations list

# Создать CLI destination
npx . destinations create --json '{"name":"Local CLI","type":"cli","path":"/webhooks"}'

# Запустить tunnel с подробными логами
npx . tunnel --destination des_xxx --to 8080 --verbose

# Повторить request
npx . requests retry req_xxx

# Посмотреть events конкретного request
npx . requests events req_xxx
```
