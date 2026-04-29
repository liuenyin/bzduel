const https = require('https');
const fs = require('fs');
const path = require('path');

const download = (url, dest) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
};

async function main() {
  const dir = path.join(__dirname, 'public', 'photos');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Use raw github content or generic placeholders that look like anime characters
  // We'll use miHoYo's official BBS avatar URLs which are very reliable
  const chars = [
    { name: 'march_7th.png', url: 'https://upload-bbs.mihoyo.com/game_record/hkrpg/character_icon/1001.png' },
    { name: 'dan_heng.png', url: 'https://upload-bbs.mihoyo.com/game_record/hkrpg/character_icon/1002.png' }
  ];

  for (const c of chars) {
    console.log(`Downloading ${c.name}...`);
    try {
      await download(c.url, path.join(dir, c.name));
      console.log(`Success: ${c.name}`);
    } catch (e) {
      console.error(`Failed: ${c.name}`, e);
    }
  }
}

main();
