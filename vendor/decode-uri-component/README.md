Compatibility copy of decode-uri-component 0.5.0 (MIT), published by Sam Verschueren.

Source: https://github.com/SamVerschueren/decode-uri-component
Advisory: https://github.com/advisories/GHSA-vcc3-ghjq-m6fr

Only change: the default ESM export is replaced by module.exports, for query-string 7 in Expo Router 6. The upstream bounded decoding implementation is unchanged. Remove this override when Expo Router uses a patched decoder with a compatible module format. Do not replace with an ESM-only override: query-string expects require() to return a function.
