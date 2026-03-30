const http = require('http');
async function getStats(socketPath, containerId) {
  return new Promise((resolve, reject) => {
    const options = {
      socketPath: socketPath,
      path: '/containers/' + containerId + '/stats?stream=false',
      method: 'GET'
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.end();
  });
}
async function main() {
  console.log("Fetching container list...");
  const options = { socketPath: '/var/run/docker.sock', path: '/containers/json', method: 'GET' };
  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', async () => {
      const containers = JSON.parse(data);
      console.log(`Found ${containers.length} containers. Fetching stats...`);
      const start = Date.now();
      const stats = await Promise.all(containers.map(c => getStats('/var/run/docker.sock', c.Id)));
      console.log(`Took ${Date.now() - start} ms!`);
      console.log(stats[0].memory_stats.usage);
    });
  });
  req.end();
}
main();
