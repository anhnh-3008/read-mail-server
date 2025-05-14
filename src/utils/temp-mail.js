async function getTempMail() {
    try {
        const response = await fetch('https://api.internal.temp-mail.io/api/v3/email/new', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();
        return {
            email: result.email,
            token: result.token
        };
    } catch (error) {
        throw new Error(`Lỗi khi tạo email tạm thời: ${error.message}`);
    }
}

async function getNewestEmail(email) {
    try {
        const response = await fetch(`https://api.internal.temp-mail.io/api/v3/email/${email}/messages`);
        const result = await response.json();

        if (!Array.isArray(result) || result.length === 0) {
            throw new Error('Không tìm thấy email nào');
        }

        return result[result.length - 1].body_text;
    } catch (error) {
        throw new Error(`Lỗi khi lấy email ${email} mới nhất: ${error.message}`);
    }
}

async function getCodeFromEmail(email) {
    try {
        const mailText = await getNewestEmail(email);
        const regex = /Security code: (\d{6})/;
        const matches = mailText.match(regex);

        if (!matches || matches.length < 2) {
            throw new Error(`Không tìm thấy mã trong email ${email}`);
        }

        return matches[1];
    } catch (error) {
        throw new Error(`Lỗi khi lấy mã từ email ${email}: ${error.message}`);
    }
}

module.exports = {
    getTempMail,
    getNewestEmail,
    getCodeFromEmail
};