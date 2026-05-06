const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200);
        res.end('ok');
        return;
    }

    const filePath = path.join(__dirname, 'index.html');
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(500);
            res.end('Server error');
            return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`Vizro Media running on port ${PORT}`);
});
