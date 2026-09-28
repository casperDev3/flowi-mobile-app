'use strict';

const { readFileSync } = require('node:fs');
const modern = require('image-size-modern');

// Metro 0.83 supplies either bytes or a local asset path. image-size 2 accepts
// bytes only; keep Metro's synchronous path contract with the patched parsers.
function imageSize(input) {
  return modern.imageSize(typeof input === 'string' ? readFileSync(input) : input);
}

module.exports = Object.assign(imageSize, modern, { default: imageSize, imageSize });
