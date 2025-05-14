# Read Mail Outlook API

API để đọc mail Outlook với Node.js

## Cài đặt

1. Clone repository
2. Cài đặt dependencies:
```bash
npm install
```

## Chạy ứng dụng

Chạy ở môi trường development:
```bash
npm run dev
```

Chạy ở môi trường production:
```bash
npm start
```

## API Endpoints

### POST /getMails

Kiểm tra quyền truy cập mail của refresh token.

**Request Body:**
```json
{
    "payload": "xxx@hotmail.com|xxx|M.C539_SN1.0.U.-xxx|9e5f94bc-e8a4-4e73-b8be-xxxxxxxx3",
}
```

**Response:**
```json
{
    "success": true,
    "data": {
        "mails": [
            {
                "subject": "Your subject mail",
                "from": "\"example\" <email@email.example.com>",
                "date": "2025-05-08T21:26:38.000Z",
                "body": "BODY[TEXT] {74934}\r\n--c2KlqyyW9CRe=_?:\r\nContent-Type: text/plain;\r\n ....."
            }
        ],
        "refresh_token": "M.C539_BL2.0.U.-xxxx"
    }
}
``` 