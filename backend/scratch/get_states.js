const fs = require('fs');
const https = require('https');
const path = require('path');

const url = 'https://raw.githubusercontent.com/sab99r/Indian-States-And-Districts/master/states-and-districts.json';
const dest = path.join(__dirname, '../../frontend/public/js/shared/states-districts.json');

https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            fs.writeFileSync(dest, JSON.stringify(json, null, 2));
            console.log('SUCCESS: Saved states-districts.json to', dest);
        } catch (e) {
            console.error('JSON parse error:', e.message);
        }
    });
}).on('error', (err) => {
    console.error('Request error:', err.message);
});
