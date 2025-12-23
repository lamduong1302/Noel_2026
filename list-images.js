/**
 * Node.js server đơn giản để list files
 * Chạy: node list-images.js
 * Truy cập: http://localhost:3001/list-images
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3001;
const IMAGES_DIR = path.join(__dirname, 'images');
const ALLOWED_EXTENSIONS = ['HEIC','.jpg', '.JPG', '.jpeg', '.png', '.webp', '.gif'];

const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'GET' && url.parse(req.url).pathname === '/list-images') {
        try {
            const files = fs.readdirSync(IMAGES_DIR);
            const images = files.filter(file => {
                const ext = path.extname(file).toLowerCase();
                return ALLOWED_EXTENSIONS.includes(ext);
            });

            res.writeHead(200);
            res.end(JSON.stringify({ images: images.sort() }));
        } catch (error) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: error.message }));
        }
    } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
    }
});

server.listen(PORT, () => {
    console.log(`✅ Server đang chạy tại http://localhost:${PORT}`);
    console.log(`📁 Đang quét thư mục: ${IMAGES_DIR}`);
    console.log(`🔗 Truy cập: http://localhost:${PORT}/list-images`);
});

