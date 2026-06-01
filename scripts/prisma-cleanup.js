const fs = require('fs');
const path = require('path');

const clientDir = path.resolve(__dirname, '..', 'apps', 'api', 'node_modules', '.prisma', 'client');
const patterns = ['query_engine-windows.dll.node', 'query_engine-windows.dll.node.tmp'];

function cleanupPrismaClientDir(dir) {
  if (!fs.existsSync(dir)) {
    return;
  }

  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (patterns.some((pattern) => file.startsWith(pattern))) {
      const filePath = path.join(dir, file);
      try {
        fs.rmSync(filePath, { force: true });
        console.log(`[prisma-cleanup] Removed stale file: ${filePath}`);
      } catch (error) {
        console.warn(`[prisma-cleanup] Could not remove ${filePath}: ${error.message}`);
      }
    }
  }
}

cleanupPrismaClientDir(clientDir);
