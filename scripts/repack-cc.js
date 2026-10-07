const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const scratchDir = 'C:/Users/Giang/.gemini/antigravity-ide/brain/1272e58d-e30f-432d-8edc-be69c390ccb5/scratch/package';
if (fs.existsSync(scratchDir)) fs.rmSync(scratchDir, { recursive: true, force: true });
fs.mkdirSync(path.join(scratchDir, 'src'), { recursive: true });

// Copy chaincode to scratchDir/src (excluding node_modules)
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDir('d:/datn/diplomachain/chaincode', path.join(scratchDir, 'src'));

process.chdir(scratchDir);
execSync('tar -czf code.tar.gz src');
fs.writeFileSync('metadata.json', JSON.stringify({ path: '../chaincode', type: 'node', label: 'educert_1.0' }));
execSync('tar -czf educert.tar.gz metadata.json code.tar.gz');

fs.copyFileSync('educert.tar.gz', 'd:/datn/diplomachain/blockchain-network/educert.tar.gz');
console.log('REPACK_SUCCESS');
