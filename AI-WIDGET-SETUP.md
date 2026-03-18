# AI Widget for Tilda

В папке подготовлены файлы:

- `t123-ai-widget-varicosenet.html` — готовый HTML/CSS/JS-блок для вставки в `T123` на Tilda.
- `api/varicosenet-chat.mjs` — готовый Vercel endpoint, который принимает сообщения от виджета и отправляет их в OpenAI API.
- `package.json` — зависимости проекта для Vercel.
- `vercel.json` — конфиг функций Vercel.

## Как это работает

1. Пользователь пишет вопрос в чат на лендинге.
2. Виджет из `T123` отправляет запрос на ваш backend endpoint.
3. Сервер вызывает OpenAI API и возвращает текст ответа.
4. Виджет показывает ответ и, при необходимости, подталкивает к записи на консультацию.

## Почему ключ нельзя вставлять в T123

OpenAI в официальной API reference прямо указывает, что API key является секретом и его нельзя хранить в клиентском коде браузера. Ключ должен использоваться только на сервере.

Источник:
- [API Reference - Authentication](https://platform.openai.com/docs/api-reference)

## Почему здесь выбран Responses API

OpenAI рекомендует Responses API для новых проектов и текстовых диалогов. Он также поддерживает многошаговый диалог через `previous_response_id`, что удобно для чата на лендинге.

Источники:
- [Text generation guide](https://platform.openai.com/docs/guides)
- [Responses API reference](https://platform.openai.com/docs/api-reference/responses/retrieve)
- [Using GPT-5.2](https://platform.openai.com/docs/guides/latest-model)

## Как запустить на Vercel

1. Создайте новый проект в Vercel и привяжите к нему эту папку или загрузите ее в Git-репозиторий.
2. Убедитесь, что файл endpoint лежит по пути `api/varicosenet-chat.mjs`.
3. В настройках проекта Vercel добавьте переменные окружения:

```env
OPENAI_API_KEY=your_secret_key
OPENAI_MODEL=gpt-5.2
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_chat_id
CRM_WEBHOOK_URL=https://your-crm.example.com/webhook
```

4. Выполните деплой.
5. После деплоя endpoint будет доступен по адресу вида:

```text
https://your-project-name.vercel.app/api/varicosenet-chat
```

6. Этот URL вставьте в `apiUrl` внутри конфига Tilda.

## Что вставить в Tilda

Перед кодом виджета вставьте:

```html
<script>
  window.VARICOSENET_AI_CHAT_CONFIG = {
    apiUrl: "https://your-project-name.vercel.app/api/varicosenet-chat",
    bookingUrl: "#popup:myform",
    phoneUrl: "tel:+74752431521",
    siteName: "Варикоза нет",
    metricaCounterId: 12345678,
    metricaLeadGoal: "chat_lead_sent"
  };
</script>
```

После этого вставьте весь код из `t123-ai-widget-varicosenet.html` в блок `T123`.

## Как теперь работает лидогенерация

1. Посетитель задает 2-3 вопроса боту.
2. Если бот видит интерес к консультации или диалог уже достаточно прогрет, он показывает форму захвата.
3. Посетитель оставляет имя и телефон.
4. Vercel endpoint принимает лид и отправляет уведомление в Telegram и в CRM webhook.
5. После успешной отправки фронтенд вызывает цель в Яндекс Метрике.
6. В Telegram и CRM приходит имя, телефон и последние сообщения из чата.

## Как подключить CRM webhook

В переменную `CRM_WEBHOOK_URL` укажите endpoint вашей CRM или промежуточного интегратора.

Сервер отправляет JSON такого вида:

```json
{
  "source": "tilda-ai-widget",
  "createdAt": "2026-03-18T14:00:00.000Z",
  "leadType": "consultation_request",
  "patient": {
    "name": "Мария",
    "phone": "+79991234567"
  },
  "meta": {
    "conversationId": "resp_...",
    "page": "https://varicosenet.ru/"
  },
  "conversation": [
    {
      "role": "user",
      "content": "Какие симптомы варикоза нельзя игнорировать?"
    }
  ]
}
```

## Как подключить Яндекс Метрику

1. На сайте должен быть установлен счетчик Метрики.
2. В Метрике создайте цель типа `JavaScript-событие`.
3. Укажите идентификатор цели, например `chat_lead_sent`.
4. Передайте в конфиг виджета `metricaCounterId` и `metricaLeadGoal`.

В виджете используется официальный вызов JavaScript API Метрики:
`ym(counterId, 'reachGoal', target[, params])`

Источники:
- [reachGoal — Яндекс Метрика](https://yandex.ru/support/metrica/ru/objects/reachgoal)

## Как получить Telegram-настройки

1. Создайте Telegram-бота через `@BotFather`.
2. Получите `TELEGRAM_BOT_TOKEN`.
3. Добавьте бота в нужный чат или напишите ему напрямую.
4. Узнайте `chat_id` этого чата.

Если захотите, следующим шагом можно добавить дублирование лида в Google Sheets или более сложную валидацию перед отправкой в CRM.

## Что можно улучшить дальше

- добавить лид-форму после 2-3 сообщений;
- сохранять обращения в CRM или Telegram;
- ограничить темы ответов только контентом лендинга;
- подключить базу знаний по клинике;
- добавить модерацию входящих сообщений;
- подменять CTA в зависимости от вопроса.
