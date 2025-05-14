const express = require('express');
const cors = require('cors');
const OutlookService = require('./services/outlook.service');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// API endpoint
app.post('/getMails', async (req, res) => {
    try {
        const { payload } = req.body;
        const [mail, password, refreshToken, clientId] = payload.split('|');
        if (!mail || !password || !refreshToken || !clientId) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu thông tin cần thiết'
            });
        }

        const outlookService = new OutlookService(mail, password, refreshToken, clientId);
        const mails = await outlookService.getMails();

        return res.status(200).json({
            success: true,
            data: mails
        });

    } catch (error) {
        console.error('Lỗi:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Lỗi server',
            error: error.message
        });
    }
});

// Khởi động server
app.listen(port, () => {
    console.log(`Server đang chạy tại http://localhost:${port}`);
}); 