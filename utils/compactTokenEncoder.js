'use strict';

/**
 * Compact Token Encoder - Space-efficient token bundling
 * 
 * This module provides a more space-efficient token bundling solution using
 * techniques inspired by Cashu v4 token format:
 * - CBOR binary encoding
 * - Single-character field names
 * - Binary encoding for hex strings
 * - Efficient token grouping
 * 
 * See docs/compact_tokens.md for more information.
 */

const crypto = require('crypto');
const cbor = require('cbor');
const config = require('../config/config');
const tokenEncoder = require('./tokenEncoder');

/**
 * Bundles multiple tokens into a single compact CBOR encoded bundle
 * using space-efficient encoding inspired by Cashu v4
 * @param {Array<string>} tokens - Array of encoded tokens
 * @param {string} [customPrefix] - Optional custom prefix to use instead of the default
 * @returns {string} The compact token bundle as base64url
 */
function bundleTokensCompact(tokens, customPrefix) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    throw new Error('Tokens must be a non-empty array');
  }
  
  if (tokens.length > config.token.maxBundleSize) {
    throw new Error(`Bundle size exceeds maximum of ${config.token.maxBundleSize} tokens`);
  }
  
  // Group tokens by key ID using the more efficient scheme
  const tokensByKeyId = {};
  
  for (const token of tokens) {
    try {
      const decodedToken = tokenEncoder.decodeToken(token);
      
      if (!tokensByKeyId[decodedToken.keyId]) {
        tokensByKeyId[decodedToken.keyId] = [];
      }
      
      // Store each token with minimum field names and binary for hex strings
      tokensByKeyId[decodedToken.keyId].push({
        // a = amount (denomination)
        a: decodedToken.denomination,
        // s = secret (as is, since it will be validated during decode)
        s: decodedToken.secret,
        // c = signature (as binary buffer instead of hex string)
        c: Buffer.from(decodedToken.signature, 'hex')
      });
    } catch (error) {
      throw new Error(`Failed to process token for compact bundling: ${error.message}`);
    }
  }
  
  // Create efficient bundle structure
  // t = tokens array
  // each element has i = id (key ID) as binary and p = proofs array
  const bundle = {
    // V4-inspired format with single-character keys and binary data
    t: Object.entries(tokensByKeyId).map(([keyId, proofs]) => ({
      i: Buffer.from(keyId, 'hex'),
      p: proofs
    }))
  };
  
  // Encode as CBOR and then as base64url
  try {
    const cborBundle = cbor.encode(bundle);
    const encodedBundle = Buffer.from(cborBundle).toString('base64url');
    
    // Add the token prefix (either custom or from config)
    const prefix = customPrefix || config.token.prefix;
    console.log(`[compactTokenEncoder] Using prefix: ${prefix} for token bundle`);
    return `${prefix}${encodedBundle}`;
  } catch (error) {
    throw new Error(`Failed to encode compact token bundle: ${error.message}`);
  }
}

/**
 * Unbundles a compact token bundle into individual tokens
 * @param {string} bundle - The compact token bundle as base64url
 * @returns {Array<string>} Array of encoded tokens
 */
function unbundleTokensCompact(bundle) {
  try {
    // Remove prefix if present
    let processedBundle = bundle;
    
    // Create a list of prefixes to try
    const prefixesToTry = [
      config.token.prefix,
      'GM',
      'btcpins', 
      'giftmint',
      'TEST'
    ];

    // Try to remove prefix
    let foundPrefix = false;
    for (const prefix of prefixesToTry) {
      if (processedBundle.startsWith(prefix)) {
        processedBundle = processedBundle.substring(prefix.length);
        console.log(`[compactTokenEncoder] Removed prefix: ${prefix}`);
        foundPrefix = true;
        break;
      }
    }
    
    // If no prefix was found, assume there isn't one
    if (!foundPrefix) {
      console.log('[compactTokenEncoder] No recognized prefix found - assuming raw bundle');
    }
    
    // Decode base64url
    const bundleBuffer = Buffer.from(processedBundle, 'base64url');
    
    // Decode CBOR
    const bundleObj = cbor.decode(bundleBuffer);
    
    if (!bundleObj.t || !Array.isArray(bundleObj.t)) {
      throw new Error('Invalid compact bundle format. Missing tokens array');
    }
    
    const tokens = [];
    
    // Process each key ID group
    for (const keysetGroup of bundleObj.t) {
      if (!keysetGroup.i || !keysetGroup.p || !Array.isArray(keysetGroup.p)) {
        throw new Error('Invalid compact bundle format. Malformed token group');
      }
      
      const keyId = keysetGroup.i.toString('hex');
      
      // Process each token in the group
      for (const proof of keysetGroup.p) {
        if (proof.a === undefined || !proof.s || !proof.c) {
          throw new Error(`Invalid token data in compact bundle for key ID ${keyId}`);
        }
        
        // Create token object that meets all required fields
        const token = {
          keyId: keyId,
          denomination: proof.a,
          secret: typeof proof.s === 'string' ? proof.s : proof.s.toString('hex'),
          signature: Buffer.isBuffer(proof.c) ? proof.c.toString('hex') : proof.c
        };
        
        // Encode the token in standard format - encodeToken will validate
        try {
          tokens.push(tokenEncoder.encodeToken(token));
        } catch (encodeError) {
          console.error('Failed to encode token:', encodeError, 'token:', token);
          throw encodeError;
        }
      }
    }
    
    if (tokens.length === 0) {
      throw new Error('Compact bundle contains no valid tokens');
    }
    
    return tokens;
  } catch (error) {
    throw new Error(`Failed to unbundle compact tokens: ${error.message}`);
  }
}

/**
 * Compares the size of standard and compact bundled tokens
 * @param {Array<string>} tokens - Array of encoded tokens
 * @returns {Object} Size comparison stats
 */
function compareBundleSizes(tokens) {
  const standardBundle = tokenEncoder.bundleTokens(tokens);
  const compactBundle = bundleTokensCompact(tokens);
  
  return {
    standardSize: standardBundle.length,
    compactSize: compactBundle.length,
    reduction: standardBundle.length - compactBundle.length,
    percentSaved: Math.round((1 - (compactBundle.length / standardBundle.length)) * 100)
  };
}

module.exports = {
  bundleTokensCompact,
  unbundleTokensCompact,
  compareBundleSizes
};