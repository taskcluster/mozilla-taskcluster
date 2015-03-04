process.$start = Date.now();
require('babel/register')({
  cache: true,
  experimental: true
});
