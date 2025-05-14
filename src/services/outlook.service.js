const { chromium } = require('playwright');
const { getTempMail, getCodeFromEmail } = require('../utils/temp-mail');
const tls = require('tls');
const { Buffer } = require('buffer');

const TYPE_IMAP = "IMAP";
const TYPE_GRAPH = "GRAPH";



class OutlookService {
    constructor(mail, password, refreshToken, clientId=process.env.PUBLIC_CLIENT_ID) {
        this.mail = mail;
        this.password = password;
        this.refreshToken = refreshToken;
        this.clientId = clientId;
    }

    async getDataFromRefreshToken(scope="") {
        try {
            const params = new URLSearchParams();
            params.append('client_id', this.clientId);
            params.append('grant_type', process.env.GRANT_TYPE_REFRESH_TOKEN);
            params.append('refresh_token', this.refreshToken);
            params.append('scope', scope);

            const response = await fetch(process.env.AUTH_BASE_URL + '/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: params
            });

            const data = await response.json();

            return data;
        } catch (error) {
            console.error('Lỗi khi refresh token:', error);
            throw new Error("Không lấy được dữ liệu từ refresh token");
        }
    }

    async getCodeGrantScopeReadMail() {
        const browser = await chromium.launch({
            headless: true
        });

        const context = await browser.newContext();
        const page = await context.newPage();

        let finalURL = '';
        context.on('request', request => {
            const url = request.url();
            if (url.startsWith('https://localhost/') && url.includes('code=')) {
                finalURL = url;
            }
        });

        try {
            // Điều hướng đến trang xác thực
            const authURL = getCodeGrantScopeReadMailURL();
            await page.goto(authURL);

            // Điền email
            await page.locator('input[type=email]').fill(this.mail);
            await page.locator('input[type=submit]').click();
            await page.waitForTimeout(2000);

            const passwordSpanSelector = "//span[text()='Use your password' or text()='Use your password instead']";
            if (await page.locator(passwordSpanSelector).first().isVisible()) {
                await page.locator(passwordSpanSelector).click();
            }

            await page.locator('input[type=password]').fill(this.password);
            await page.locator('button[type=submit]').click();
            await page.waitForTimeout(2000);

            // check div has text "Your account has been locked"
            const divLockedSelector = "//div[text()='Your account has been locked']";
            if (await page.locator(divLockedSelector).isVisible()) {
                throw new Error('Tài khoản đã bị khóa');
            }

            const inputEmailAddressSelector = "input#EmailAddress";
            if (await page.locator(inputEmailAddressSelector).isVisible()) {
                const { email: tempEmail } = await getTempMail();
                await page.locator(inputEmailAddressSelector).fill(tempEmail);
                await page.locator('input#iNext').click();

                await page.waitForTimeout(5000);

                const code = await getCodeFromEmail(tempEmail);
                await page.locator('input#iOttText').fill(code);
                await page.locator('input#iNext').click();
            }

            if (await page.locator('input#iOttText').isVisible()) {
                await page.goto(authURL);

                // Điền email
                await page.locator('input[type=email]').fill(this.mail);
                await page.locator('input[type=submit]').click();
                await page.waitForTimeout(2000);

                if (await page.locator(passwordSpanSelector).first().isVisible()) {
                    await page.locator(passwordSpanSelector).click();
                }

                if (await page.locator('input[type=password]').isVisible()) {
                    await page.locator('input[type=password]').fill(this.password);
                    await page.locator('button[type=submit]').click();
                    await page.waitForTimeout(2000);
                }
            }

            // Kiểm tra và nhấp nút Skip liên tục
            // while (true) {
            //     try {
            //         await page.waitForSelector("a#iShowSkip", { 
            //             state: "visible",
            //             timeout: 20000 
            //         });
            //         await page.locator("a#iShowSkip").click();
            //     } catch (error) {
            //         break;
            //     }

            //     await page.waitForTimeout(3000);
            // }

            // const skipForNowButtonSelector = "//button[text()='Skip for now']";
            // if (await page.locator(skipForNowButtonSelector).isVisible()) {
            //     await page.locator(skipForNowButtonSelector).click();
            // }

            // const allowButtonSelector = "//button[text()='Yes']";
            // if (await page.locator(allowButtonSelector).isVisible()) {
            //     await page.locator(allowButtonSelector).click();
            // }

            const buttonAcceptSelector = "//button[text()='Accept']";
            if (await page.locator(buttonAcceptSelector).isVisible()) {
                await page.locator(buttonAcceptSelector).click();
            }

            // Đợi cho đến khi có finalURL
            while (!finalURL) {
                await page.waitForTimeout(1000);
            }

            return finalURL.split('code=')[1] || '';
        } catch (error) {
            console.error('Lỗi trong quá trình xác thực:', error);
            throw new Error("Lỗi xác thực. Hãy thử lại!");
        } finally {
            await page.close();
            await context.close();
            await browser.close();
        }
    }

    async getAccessTokenFromCodeGrantScopeReadMail(code) {
        const params = new URLSearchParams();
        params.append('client_id', this.clientId);
        params.append('grant_type', process.env.GRANT_TYPE_AUTHORIZATION_CODE);
        params.append('code', code);
        params.append('redirect_uri', process.env.REDIRECT_URI);

        const response = await fetch(process.env.AUTH_BASE_URL + '/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params
        });

        const data = await response.json();
        return {
            access_token: data.access_token,
            refresh_token: data.refresh_token
        };
    }

    async getAccessToken() {
        const dataRefreshToken = await this.getDataFromRefreshToken();
        let currentRefreshToken = dataRefreshToken.refresh_token;
        const isReadMailByGraph = dataRefreshToken.scope && dataRefreshToken.scope.includes('Mail.Read');
        if (isReadMailByGraph) {
            const dataRefreshToken = await this.getDataFromRefreshToken('https://graph.microsoft.com/Mail.ReadWrite');
            return {
                type: TYPE_GRAPH,
                access_token: dataRefreshToken.access_token,
                refresh_token: currentRefreshToken
            } 
        }

        const isReadMailByIMAP = dataRefreshToken.scope && dataRefreshToken.scope.includes('IMAP.AccessAsUser.All');
        if (isReadMailByIMAP) {
            return {
                type: TYPE_IMAP,
                access_token: dataRefreshToken.access_token,
                refresh_token: dataRefreshToken.refresh_token
            };
        } else {
            const code = await this.getCodeGrantScopeReadMail();
            if (code) {
                const { access_token, refresh_token } = await this.getAccessTokenFromCodeGrantScopeReadMail(code);
                return {
                    type: TYPE_GRAPH,
                    access_token,
                    refresh_token
                };
            } else {
                throw new Error('Không thể lấy được mã xác thực');
            }
        }
    }

    async getMails() {
        const { type, access_token, refresh_token } = await this.getAccessToken();
        console.log(type);
        console.log(refresh_token);
        let data = [];
        if (type === TYPE_IMAP) {
            data = await this.getMailsByIMAP(access_token);
        } else {
            data = await this.getMailsByGraph(access_token);
        }

        return { mails: data, type, refresh_token };
    }

    async getMailsByIMAP(access_token) {
        const authString = `user=${this.mail}\x01auth=Bearer ${access_token}\x01\x01`;
        const authBase64 = Buffer.from(authString).toString('base64');

        return new Promise((resolve, reject) => {
            const socket = tls.connect(
                {
                    host: 'outlook.office365.com',
                    port: 993,
                    rejectUnauthorized: false
                },
                () => {
                    let tagCounter = 1;
                    let currentTag = '';
                    let buffer = '';
                    let state = 'GREETING';
                    const results = [];

                    const writeCmd = (cmd) => {
                        currentTag = `a${tagCounter++}`;
                        socket.write(`${currentTag} ${cmd}\r\n`);
                    };

                    const resetBuffer = () => (buffer = '');

                    socket.once('data', () => {
                        currentTag = `a${tagCounter++}`;
                        socket.write(`${currentTag} AUTHENTICATE XOAUTH2\r\n`);
                        state = 'WAIT_PLUS';
                    });

                    socket.on('data', (chunk) => {
                        buffer += chunk.toString();

                        if (state === 'WAIT_PLUS' && buffer.includes('+')) {
                            socket.write(`${authBase64}\r\n`);
                            resetBuffer();
                            state = 'AUTH_SENT';
                        }

                        else if (state === 'AUTH_SENT') {
                            if (buffer.includes(`${currentTag} OK`)) {
                                state = 'SELECT';
                                resetBuffer();
                                writeCmd('SELECT INBOX');
                            } else if (buffer.includes(`${currentTag} NO`) || buffer.includes(`${currentTag} BAD`)) {
                                reject(new Error('❌ Authentication failed.\n' + buffer));
                                socket.end();
                            }
                        }

                        else if (state === 'SELECT' && buffer.includes(`${currentTag} OK`)) {
                            state = 'SEARCH';
                            resetBuffer();
                            writeCmd('SEARCH ALL');
                        }

                        else if (state === 'SEARCH') {
                            if (buffer.includes(`${currentTag} OK`)) {
                                const idLine = buffer.split('\n').find(line => line.startsWith('* SEARCH'));
                                if (!idLine) {
                                    resolve([]); socket.end(); return;
                                }

                                const allIds = idLine.replace('* SEARCH', '').trim().split(' ').filter(Boolean);
                                const latestIds = allIds.slice(-Number(process.env.AMOUNT_MAIL_READ));
                                if (latestIds.length === 0) {
                                    resolve([]); socket.end(); return;
                                }

                                state = 'FETCH';
                                resetBuffer();
                                writeCmd(`FETCH ${latestIds.join(',')} (BODY[HEADER.FIELDS (SUBJECT FROM DATE)] BODY[TEXT])`);
                            }
                        }
                        else if (state === 'FETCH') {
                            if (buffer.includes(`${currentTag} OK`)) {
                                const fetchBlocks = buffer
                                    .split(/\*\s\d+\sFETCH/).slice(1) // Tách theo "* n FETCH"
                                    .map(block => {
                                        const subject = block.match(/Subject:\s*(.*)/i)?.[1]?.trim() || '(No subject)';
                                        const from = block.match(/From:\s*(.*)/i)?.[1]?.trim() || '(Unknown sender)';
                                        const date = block.match(/Date:\s*(.*)/i)?.[1]?.trim() ? new Date(block.match(/Date:\s*(.*)/i)[1].trim()).toISOString() : '(Unknown date)';
                                        const bodyMatch = block.match(/\r\n\r\n([\s\S]*)/); // content after empty line
                                        const body = bodyMatch?.[1]?.trim() || '(No body)';
                                        return { subject, from, date, body };
                                    });

                                resolve(fetchBlocks.reverse());
                                socket.end();
                            }
                        }
                    });

                    socket.on('error', (err) => reject(err));
                    socket.on('end', () => console.log('🔚 Connection closed'));
                }
            );
        });
    }

    async getMailsByGraph(access_token) {
        const response = await fetch(process.env.GRAPH_BASE_URL + `/me/messages?$select=sender,subject,body,receivedDateTime&$top=${process.env.AMOUNT_MAIL_READ}`, {
            headers: {
                'Authorization': `Bearer ${access_token}`
            }
        });

        const data = await response.json();

        return data.value.map(mail => ({
            subject: mail.subject || '(No subject)',
            from: `${mail.sender?.emailAddress?.name} <${mail.sender?.emailAddress?.address}>` || '(Unknown sender)',
            date: mail.receivedDateTime || '(Unknown date)',
            body: mail.body?.content || '(No body)'
        }));
    }
}

function getCodeGrantScopeReadMailURL() {
    const params = new URLSearchParams();
    params.append('client_id', process.env.CLIENT_ID);
    params.append('response_type', 'code');
    params.append('redirect_uri', process.env.REDIRECT_URI);
    params.append('response_mode', 'query');
    params.append('scope', process.env.SCOPE_READ_MAIL);

    return `${process.env.AUTH_BASE_URL}/authorize?${params.toString()}`;
}

function extractHtmlPartFromBodyText(bodyText) {
    // Tìm boundary thực tế
    const boundaryMatch = bodyText.match(/--=-(.+?)==/);
    if (!boundaryMatch) return null;
    const boundary = `--=-${boundaryMatch[1]}==`;

    // Tách các phần MIME
    const parts = bodyText.split(boundary).map(p => p.trim());

    for (const part of parts) {
        if (part.toLowerCase().includes('content-type: text/html')) {
            // Tìm đoạn sau phần header MIME
            const [, htmlContent] = part.split(/\r\n\r\n/);
            return htmlContent?.trim() || null;
        }
    }

    return null;
}

module.exports = OutlookService;





