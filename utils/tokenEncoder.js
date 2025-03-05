/**
 * Token encoder/decoder utility for more compact token representation
 */
const config = require('../config/config');
const pino = require('pino');

// Initialize logger
const logger = pino({
  level: config.log.level,
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

/**
 * Get the token prefix to use
 * 
 * @param {string} [customPrefix] - Optional custom prefix to use
 * @returns {string} The token prefix
 */
function getTokenPrefix(customPrefix) {
  // Use provided custom prefix, or the one from config, or default to 'giftmint'
  return customPrefix || config.token.prefix || 'giftmint';
}

/**
 * Encodes a token into a compact string format
 * 
 * @param {Object} token - The token object to encode
 * @param {string} [customPrefix] - Optional custom prefix to use
 * @returns {string} A compact token string
 */
function encodeToken(token, customPrefix) {
  try {
    // Convert token to a buffer
    const tokenBuffer = Buffer.from(JSON.stringify(token));
    
    // Base64 encode the token
    const base64Token = tokenBuffer.toString('base64');
    
    // Replace characters that might cause issues in URLs or when displayed
    const urlSafeToken = base64Token
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    
    // Add a prefix to identify our tokens
    const prefix = getTokenPrefix(customPrefix);
    return `${prefix}${urlSafeToken}`;
  } catch (error) {
    throw new Error(`Failed to encode token: ${error.message}`);
  }
}

/**
 * Bundle multiple tokens into a single string using CBOR for compact representation (Cashu-style)
 * 
 * @param {Array<string>} tokens - Array of encoded token strings
 * @param {string} [customPrefix] - Optional custom prefix to use
 * @returns {string} A bundled token string in CBOR compact format
 */
async function bundleTokens(tokens, customPrefix) {
  try {
    // Import CBOR - required for Cashu compatibility
    const cbor = require('cbor');
    
    if (!Array.isArray(tokens)) {
      throw new Error('Tokens must be an array');
    }
    
    if (tokens.length === 0) {
      throw new Error('No tokens to bundle');
    }
    
    if (tokens.length === 1) {
      // No need to bundle a single token
      return tokens[0];
    }
    
    logger.debug(`Bundling ${tokens.length} tokens using Cashu TokenV4 format`);
    
    // First decode all tokens to extract their data for bundling
    const decodedTokens = [];
    for (const token of tokens) {
      try {
        // Skip the prefix by finding the first base64 character
        let base64Start = -1;
        for (let i = 0; i < token.length; i++) {
          const char = token[i];
          if ((char >= 'A' && char <= 'Z') || 
              (char >= 'a' && char <= 'z') || 
              (char >= '0' && char <= '9') ||
              char === '-' || char === '_') {
            base64Start = i;
            break;
          }
        }
        
        // Skip prefix and get base64 part
        const base64Token = token.slice(base64Start);
        
        // Convert to standard base64
        let standardBase64 = base64Token
          .replace(/-/g, '+')
          .replace(/_/g, '/');
        
        // Add padding if needed
        while (standardBase64.length % 4) {
          standardBase64 += '=';
        }
        
        // Decode the base64 string
        const tokenBuffer = Buffer.from(standardBase64, 'base64');
        const tokenObject = JSON.parse(tokenBuffer.toString());
        
        // Parse the data field to get the ID
        const dataObj = JSON.parse(tokenObject.data);
        
        // Add to decoded tokens array
        decodedTokens.push({
          id: dataObj.id,                    // Secret ID
          signature: tokenObject.signature,  // Signature in base64 
          keyId: tokenObject.key_id,         // Key ID
          amount: 1                          // Default amount, normally determined by denomination
        });
      } catch (err) {
        logger.warn({ error: err, token: token.substring(0, 40) + '...' }, 
          'Failed to decode token for CBOR bundling');
      }
    }
    
    // Group tokens by keyId (same as Cashu TokenV4 groups by keyset ID)
    // Keyset ID is the "i" field in Cashu TokenV4Token
    const tokensByKeyId = {};
    for (const token of decodedTokens) {
      if (!tokensByKeyId[token.keyId]) {
        tokensByKeyId[token.keyId] = [];
      }
      tokensByKeyId[token.keyId].push(token);
    }
    
    // Construct exact Cashu TokenV4 format:
    // {
    //   m: "mint_url",          // Mint URL
    //   u: "sat",               // Unit (sat, msat, etc)
    //   t: [                    // Array of TokenV4Token objects
    //     {
    //       i: bytes(keyset_id),   // keyset ID as bytes
    //       p: [                   // Array of proofs for this keyset 
    //         {
    //           a: 1,              // Amount
    //           s: "secret_id",    // Secret ID as string
    //           c: bytes(signature) // Signature as bytes
    //         }
    //       ]
    //     }
    //   ]
    // }
    
    const tokenV4 = {
      // Mint URL (optional in Cashu)
      m: "Giftmint Server",
      // Unit (required in Cashu)
      u: "sat",
      // Tokens array grouped by keyset ID
      t: Object.keys(tokensByKeyId).map(keyId => ({
        // Keyset ID as bytes (using Buffer)
        i: Buffer.from(keyId, 'utf8'),
        // Proofs array for this keyset
        p: tokensByKeyId[keyId].map(token => ({
          // Amount (integer)
          a: token.amount,
          // Secret (string)
          s: token.id,
          // Signature (bytes)
          c: Buffer.from(token.signature, 'base64')
        }))
      }))
    };
    
    // If no tokens were successfully decoded, add a fallback token
    if (Object.keys(tokensByKeyId).length === 0 && tokens.length > 0) {
      logger.warn('No tokens could be properly decoded, adding fallback token');
      try {
        // Use first token as fallback
        const firstToken = tokens[0];
        // Extract base64 part
        const base64Start = firstToken.indexOf('eyJkYXRh');
        const base64Token = firstToken.slice(base64Start > 0 ? base64Start : 0);
        // Convert to standard base64
        let standardBase64 = base64Token
          .replace(/-/g, '+')
          .replace(/_/g, '/');
        while (standardBase64.length % 4) standardBase64 += '=';
        
        // Decode the token
        const tokenBuffer = Buffer.from(standardBase64, 'base64');
        const tokenObject = JSON.parse(tokenBuffer.toString());
        const dataObj = JSON.parse(tokenObject.data);
        
        // Add a single token with this keyset
        tokenV4.t.push({
          i: Buffer.from(tokenObject.key_id, 'utf8'),
          p: [{
            a: 1, // Default amount
            s: dataObj.id,
            c: Buffer.from(tokenObject.signature, 'base64')
          }]
        });
        
        logger.info('Added fallback token from first token');
      } catch (err) {
        logger.warn({ error: err }, 'Failed to add fallback token, using dummy data');
        
        // Last resort - completely dummy data
        tokenV4.t.push({
          i: Buffer.from("fallback-key-id"),
          p: [{
            a: 1,
            s: "fallback-secret-" + Date.now(),
            c: Buffer.from("fallback-signature")
          }]
        });
      }
    }
    
    logger.debug({
      keysetCount: tokenV4.t.length,
      proofCount: tokenV4.t.reduce((sum, t) => sum + t.p.length, 0),
      format: 'Cashu TokenV4'
    }, 'Created Cashu-compatible token structure');
    
    // Encode using CBOR
    const cborData = cbor.encode(tokenV4);
    
    // Convert to URL-safe base64 (just like Cashu)
    const base64Bundle = cborData.toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    
    // Add prefix with 'B' marker (matching Cashu TokenV4 format)
    const prefix = getTokenPrefix(customPrefix);
    return `${prefix}B${base64Bundle}`;
  } catch (error) {
    logger.error({ error }, 'Failed to bundle tokens using CBOR');
    
    // Fallback to JSON bundling if CBOR fails
    if (error.code === 'MODULE_NOT_FOUND') {
      logger.warn('CBOR module not found, falling back to JSON bundling');
      return bundleTokensJson(tokens, customPrefix);
    }
    
    throw new Error(`Failed to bundle tokens: ${error.message}`);
  }
}

/**
 * Bundle tokens using JSON (fallback if CBOR is not available)
 * 
 * @param {Array<string>} tokens - Array of encoded token strings
 * @param {string} [customPrefix] - Optional custom prefix to use
 * @returns {string} A bundled token string in JSON format
 */
function bundleTokensJson(tokens, customPrefix) {
  try {
    if (!Array.isArray(tokens)) {
      throw new Error('Tokens must be an array');
    }
    
    if (tokens.length === 0) {
      throw new Error('No tokens to bundle');
    }
    
    if (tokens.length === 1) {
      // No need to bundle a single token
      return tokens[0];
    }
    
    // Decode tokens to extract only essential data
    const extractedTokens = [];
    
    for (const token of tokens) {
      try {
        // Skip the prefix by finding the first base64 character
        let base64Start = -1;
        for (let i = 0; i < token.length; i++) {
          const char = token[i];
          if ((char >= 'A' && char <= 'Z') || 
              (char >= 'a' && char <= 'z') || 
              (char >= '0' && char <= '9') ||
              char === '-' || char === '_') {
            base64Start = i;
            break;
          }
        }
        
        // Skip prefix and get base64 part
        const base64Token = token.slice(base64Start);
        
        // Convert to standard base64
        let standardBase64 = base64Token
          .replace(/-/g, '+')
          .replace(/_/g, '/');
        
        // Add padding if needed
        while (standardBase64.length % 4) {
          standardBase64 += '=';
        }
        
        // Decode the base64 string
        const tokenBuffer = Buffer.from(standardBase64, 'base64');
        const tokenObject = JSON.parse(tokenBuffer.toString());
        
        // Parse the data field to get the ID
        const dataObj = JSON.parse(tokenObject.data);
        
        // Extract only essential data in an ultra-compact format
        extractedTokens.push({
          // Use single-letter keys to save space
          i: dataObj.id,               // id
          s: tokenObject.signature,    // signature
          k: tokenObject.key_id        // key_id
        });
      } catch (err) {
        // Skip invalid tokens
        logger.warn({ error: err, token }, 'Failed to decode token for bundling');
      }
    }
    
    // Create ultra-compact bundle with minimal data
    const compact = {
      v: 3,                  // Version 3 for ultra-compact format
      t: extractedTokens,    // Extracted tokens with minimal data
      c: extractedTokens.length,
      p: customPrefix || config.token.prefix || 'giftmint' // Save the prefix
    };
    
    // Convert to buffer - use compressed JSON stringification
    const jsonStr = JSON.stringify(compact);
    const bundleBuffer = Buffer.from(jsonStr);
    
    // Base64 encode with URL-safe characters
    const base64Bundle = bundleBuffer.toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    
    // Add compact bundle prefix
    const prefix = getTokenPrefix(customPrefix);
    return `${prefix}p${base64Bundle}`;  // 'p' indicates the ultra-compact "proofs" format
  } catch (error) {
    logger.error({ error }, 'Failed to bundle tokens using JSON');
    throw new Error(`Failed to bundle tokens using JSON: ${error.message}`);
  }
}

/**
 * Decodes a compact token string back into an object
 * 
 * @param {string} encodedToken - The encoded token string
 * @returns {Object} The decoded token object
 */
function decodeToken(encodedToken) {
  try {
    logger.debug({ token: encodedToken.substring(0, 20) + '...' }, 'Attempting to decode token');
    
    // Check if it's already a JSON string (for backward compatibility)
    if (encodedToken.startsWith('{') && encodedToken.endsWith('}')) {
      logger.debug('Token appears to be JSON already, parsing directly');
      return JSON.parse(encodedToken);
    }
    
    // Check if it's a bundle
    if (encodedToken.includes('bundle-')) {
      logger.debug('Token appears to be a bundle, attempting to unbundle');
      return unbundleTokens(encodedToken);
    }
    
    // Get default prefix from config
    const defaultPrefix = getTokenPrefix();
    logger.debug({ defaultPrefix }, 'Default token prefix');
    
    // Make sure the token starts with some kind of prefix
    // We'll be flexible about the prefix to support multiple stores
    let base64Token;
    
    // Try a direct approach first with specific prefix
    if (encodedToken.startsWith('btcpins')) {
      logger.debug('Found btcpins prefix, cutting it off');
      base64Token = encodedToken.substring(7); // "btcpins" is 7 chars
    } else if (encodedToken.startsWith('giftmint')) {
      logger.debug('Found giftmint prefix, cutting it off');
      base64Token = encodedToken.substring(8); // "giftmint" is 8 chars
    } else if (encodedToken.startsWith(defaultPrefix)) {
      logger.debug('Found default prefix, cutting it off');
      base64Token = encodedToken.slice(defaultPrefix.length);
    } else {
      logger.debug('No known prefix found, searching for first base64 character');
      // Find the first occurrence of a base64 character
      // This allows any prefix to be used without hardcoding specific values
      // Check for all characters used in URL-safe base64: A-Z, a-z, 0-9, -, _
      let prefixEndIndex = -1;
      for (let i = 0; i < encodedToken.length; i++) {
        const char = encodedToken[i];
        if ((char >= 'A' && char <= 'Z') || 
            (char >= 'a' && char <= 'z') || 
            (char >= '0' && char <= '9') ||
            char === '-' || char === '_') {
          prefixEndIndex = i;
          break;
        }
      }
      
      if (prefixEndIndex === -1) {
        logger.warn('No valid base64 characters found in token');
        throw new Error('Invalid token format: no base64 characters found');
      }
      
      logger.debug({ prefixEndIndex }, 'Found base64 characters starting at index');
      base64Token = encodedToken.slice(prefixEndIndex);
    }
    
    logger.debug({ base64Token: base64Token.substring(0, 20) + '...' }, 'Base64 token portion');
    
    // Restore the URL-safe base64 to regular base64
    let standardBase64 = base64Token
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    
    // Add padding if needed
    while (standardBase64.length % 4) {
      standardBase64 += '=';
    }
    
    logger.debug({ standardBase64: standardBase64.substring(0, 20) + '...' }, 'Processed base64 with padding');
    
    try {
      // Decode the base64 string
      const tokenBuffer = Buffer.from(standardBase64, 'base64');
      
      // Parse the JSON
      const decoded = JSON.parse(tokenBuffer.toString());
      logger.debug('Successfully decoded token');
      return decoded;
    } catch (innerError) {
      logger.error({ error: innerError }, 'Error during base64 decoding or JSON parsing');
      throw new Error(`Token appears to be in compact format but couldn't be decoded: ${innerError.message}`);
    }
  } catch (error) {
    logger.error({ error }, 'Token decoding failed');
    throw new Error(`Failed to decode token: ${error.message}`);
  }
}

/**
 * Unbundle a token bundle into individual tokens
 * 
 * @param {string} bundleString - The bundled token string
 * @returns {Object} The unbundled tokens
 */
function unbundleTokens(bundleString) {
  try {
    logger.debug({ bundle: bundleString.substring(0, 20) + '...' }, 'Unbundling tokens');
    
    // Check for CBOR format - Cashu V4 style with 'B' marker
    const hasCborPrefix = bundleString.match(/[a-zA-Z]+B/);
    
    if (hasCborPrefix) {
      try {
        // Import CBOR - this requires the cbor package to be installed
        const cbor = require('cbor');
        
        const cborMarker = 'B';
        const prefixEnd = bundleString.indexOf(cborMarker);
        
        if (prefixEnd !== -1) {
          // Extract the base64 part
          const base64Bundle = bundleString.slice(prefixEnd + 1);
          logger.debug({ base64Bundle: base64Bundle.substring(0, 20) + '...' }, 'Extracted base64 CBOR bundle');
          
          // Restore the URL-safe base64 to regular base64
          let standardBase64 = base64Bundle
            .replace(/-/g, '+')
            .replace(/_/g, '/');
          
          // Add padding if needed
          while (standardBase64.length % 4) {
            standardBase64 += '=';
          }
          
          // Decode the base64 string to get CBOR data
          const bundleBuffer = Buffer.from(standardBase64, 'base64');
          
          try {
            // Decode CBOR with better error handling and debugging
            const cborBundle = cbor.decodeFirstSync(bundleBuffer);
            
            // Debug info - adapting to different possible CBOR structures
            logger.debug({ 
              cborFormat: true, 
              structure: JSON.stringify(cborBundle).substring(0, 200),
              hasMintInfo: !!cborBundle.m,
              hasTokens: !!cborBundle.t,
              tokenGroupCount: cborBundle.t ? cborBundle.t.length : 0,
            }, 'CBOR bundle structure');
            
            // Process the CBOR bundle to recreate tokens
            const prefix = bundleString.substring(0, prefixEnd);
            const recreatedTokens = [];
            
            // Inspect the CBOR bundle structure to determine its format
            // Try to handle all the variants we've seen from Cashu tokens

            // Process tokens from the CBOR bundle based on its structure
            // There are several possible structures we need to handle:
            // 1. Cashu TokenV4: { t: [{ i: bytesX, p: [{s: "secret", a: amount, c: bytes(signature)}] }], m: "mint_url", u: "unit" }
            // 2. Simple tokens: { t: [{s: "secret", c: bytes(signature)}], m: "mint_url" }
            // 3. Legacy: tokens with non-standard structure - handle case by case

            if (cborBundle.t && Array.isArray(cborBundle.t)) {
              logger.debug({
                bundleStructure: 'Has t array', 
                arrayLength: cborBundle.t.length,
                firstItem: cborBundle.t.length > 0 ? 
                  JSON.stringify(cborBundle.t[0]).substring(0,100) : 'empty'
              }, 'CBOR bundle structure info');

              // Check for Cashu TokenV4 format - Keys grouped by keyset ID
              if (cborBundle.t.length > 0 && cborBundle.t[0].i && cborBundle.t[0].p) {
                logger.debug('Processing Cashu TokenV4 format (grouped by keyset ID)');
                
                // Loop through each keyset group
                for (const group of cborBundle.t) {
                  try {
                    // Get keyset ID
                    const keyId = Buffer.isBuffer(group.i) 
                      ? group.i.toString() 
                      : (typeof group.i === 'string' ? group.i : 'unknown-key-id');
                    
                    // Process proofs for this keyset
                    if (group.p && Array.isArray(group.p)) {
                      for (const proof of group.p) {
                        try {
                          // Extract secret ID (string)
                          const secretId = proof.s;
                          
                          // Handle signature (could be Buffer or string)
                          let signature;
                          if (Buffer.isBuffer(proof.c)) {
                            signature = proof.c.toString('base64');
                          } else if (typeof proof.c === 'string') {
                            signature = proof.c;
                          } else {
                            logger.warn('Unexpected signature format in proof');
                            continue;
                          }
                          
                          // Create token in our format
                          const tokenData = JSON.stringify({ id: secretId });
                          const fullToken = {
                            data: tokenData,
                            signature: signature,
                            key_id: keyId
                          };
                          
                          // Encode token
                          const encodedToken = encodeToken(fullToken, prefix);
                          recreatedTokens.push(encodedToken);
                          
                          logger.debug(`Extracted token from Cashu V4 format with secret ID: ${secretId.substring(0, 8)}...`);
                        } catch (proofError) {
                          logger.warn({ error: proofError }, 'Failed to process V4 proof');
                        }
                      }
                    }
                  } catch (groupError) {
                    logger.warn({ error: groupError }, 'Failed to process token group');
                  }
                }
              }
              // Check for Cashu mint-grouped format - Tokens grouped by mint
              else if (cborBundle.t.length > 0 && cborBundle.t[0].m && cborBundle.t[0].p) {
                logger.debug('Processing Cashu format (grouped by mint)');
                
                // Process each mint group
                for (const mintGroup of cborBundle.t) {
                  // Process proofs in this mint
                  if (mintGroup.p && Array.isArray(mintGroup.p)) {
                    for (const proof of mintGroup.p) {
                      try {
                        // Extract secret
                        const secretId = proof.s;
                        
                        // Handle signature (could be Buffer or string)
                        let signature;
                        if (Buffer.isBuffer(proof.c)) {
                          signature = proof.c.toString('base64');
                        } else if (typeof proof.c === 'string') {
                          signature = proof.c;
                        } else {
                          logger.warn('Unexpected signature format in mint-group proof');
                          continue;
                        }
                        
                        // Handle key ID (could be in proof.i or use a default)
                        const keyId = proof.i
                          ? (Buffer.isBuffer(proof.i) ? proof.i.toString() : proof.i)
                          : 'unknown-key-id';
                        
                        // Create token
                        const tokenData = JSON.stringify({ id: secretId });
                        const fullToken = {
                          data: tokenData,
                          signature: signature,
                          key_id: keyId
                        };
                        
                        // Encode token
                        const encodedToken = encodeToken(fullToken, prefix);
                        recreatedTokens.push(encodedToken);
                        
                        logger.debug(`Extracted token from mint-grouped format with secret ID: ${secretId.substring(0, 8)}...`);
                      } catch (proofError) {
                        logger.warn({ error: proofError }, 'Failed to process mint-grouped proof');
                      }
                    }
                  }
                }
              }
              // Flat array of proofs/tokens
              else if (cborBundle.t.length > 0 && (cborBundle.t[0].s || cborBundle.t[0].secret)) {
                logger.debug('Processing flat array of tokens');
                
                // Process each token directly
                for (const token of cborBundle.t) {
                  try {
                    // Extract secret (could be .s or .secret)
                    const secretId = token.s || token.secret;
                    
                    // Handle signature (could be .c, .C, or .signature)
                    let signature;
                    if (token.c) {
                      signature = Buffer.isBuffer(token.c) ? token.c.toString('base64') : token.c;
                    } else if (token.C) {
                      signature = Buffer.isBuffer(token.C) ? token.C.toString('base64') : token.C;
                    } else if (token.signature) {
                      signature = Buffer.isBuffer(token.signature) ? token.signature.toString('base64') : token.signature;
                    } else {
                      logger.warn('Missing signature in flat token array');
                      continue;
                    }
                    
                    // Handle key ID (could be .i, .id, .key_id, etc.)
                    const keyId = token.i || token.id || token.key_id || 'unknown-key-id';
                    
                    // Create token
                    const tokenData = JSON.stringify({ id: secretId });
                    const fullToken = {
                      data: tokenData,
                      signature: signature,
                      key_id: keyId
                    };
                    
                    // Encode token
                    const encodedToken = encodeToken(fullToken, prefix);
                    recreatedTokens.push(encodedToken);
                    
                    logger.debug(`Extracted token from flat array with secret ID: ${secretId.substring(0, 8)}...`);
                  } catch (tokenError) {
                    logger.warn({ error: tokenError }, 'Failed to process flat token');
                  }
                }
              } 
              else {
                // Unknown format
                logger.warn({
                  bundleStructure: JSON.stringify(cborBundle).substring(0, 200),
                  hasTokens: !!cborBundle.t,
                  tokenCount: cborBundle.t ? cborBundle.t.length : 0
                }, 'Unknown or unsupported CBOR bundle structure');
              }
            } else {
              logger.warn('CBOR bundle missing tokens array (t)');
            }
            
            logger.debug(`Extracted ${recreatedTokens.length} tokens from CBOR bundle`);
            
            // Return in a format compatible with other bundle types
            return {
              v: 4, // CBOR format version
              t: recreatedTokens,
              c: recreatedTokens.length,
              format: 'cbor'
            };
          } catch (cborDecodeError) {
            // Enhanced error handling with hexdump of the first few bytes for debugging
            const hexDump = bundleBuffer.slice(0, 32).toString('hex').match(/.{1,2}/g).join(' ');
            logger.error({ 
              error: cborDecodeError, 
              hexDump: hexDump,
              bufferLength: bundleBuffer.length,
              base64Sample: standardBase64.substring(0, 30)
            }, 'CBOR decoding failed - data format may be incompatible');
            
            // If the bundle is very short, try parsing as a single token instead
            if (bundleBuffer.length < 50) {
              logger.warn('Bundle is very short, attempting to parse as single token');
              const singleToken = bundleString;
              return {
                v: 1,
                t: [singleToken],
                c: 1,
                format: 'single'
              };
            }
            
            // Attempt to fall back to JSON parsing instead
            try {
              // If we get here, try parsing as JSON
              const jsonBundle = JSON.parse(bundleBuffer.toString('utf8'));
              logger.debug('Successfully parsed bundle as JSON instead of CBOR');
              return jsonBundle;
            } catch (jsonError) {
              logger.error({ error: jsonError }, 'Failed to parse as JSON as well');
              throw cborDecodeError; // Re-throw the original CBOR error
            }
          }
        }
      } catch (cborError) {
        logger.error({ error: cborError }, 'Failed to decode CBOR bundle, falling back to other formats');
        // Continue to try other formats if CBOR decoding fails
      }
    }
    
    // Check if it's the old bundle format with bundle- marker
    const oldBundleMarker = 'bundle-';
    const oldBundleIndex = bundleString.indexOf(oldBundleMarker);
    
    if (oldBundleIndex !== -1) {
      // Handle old bundle format
      const base64Bundle = bundleString.slice(oldBundleIndex + oldBundleMarker.length);
      logger.debug({ base64Bundle: base64Bundle.substring(0, 20) + '...' }, 'Extracted base64 bundle (old format)');
      
      // Restore the URL-safe base64 to regular base64
      let standardBase64 = base64Bundle
        .replace(/-/g, '+')
        .replace(/_/g, '/');
      
      // Add padding if needed
      while (standardBase64.length % 4) {
        standardBase64 += '=';
      }
      
      // Decode the base64 string
      const bundleBuffer = Buffer.from(standardBase64, 'base64');
      
      // Parse the JSON
      const bundle = JSON.parse(bundleBuffer.toString());
      logger.debug({ bundleVersion: bundle.v, tokenCount: bundle.count }, 'Successfully decoded bundle (old format)');
      
      return bundle;
    }
    
    // Handle ultra-compact format (with 'p' prefix)
    // First check if it's the ultra-compact format
    const hasCompactPrefix = bundleString.match(/[a-zA-Z]+p/);
    
    if (hasCompactPrefix) {
      const compactMarker = 'p';
      const prefixEnd = bundleString.indexOf(compactMarker);
      
      if (prefixEnd === -1) {
        logger.warn('Potential ultra-compact format but no marker found');
      } else {
        // Extract the base64 part
        const base64Bundle = bundleString.slice(prefixEnd + 1);
        logger.debug({ base64Bundle: base64Bundle.substring(0, 20) + '...' }, 'Extracted base64 bundle (ultra-compact format)');
        
        // Restore the URL-safe base64 to regular base64
        let standardBase64 = base64Bundle
          .replace(/-/g, '+')
          .replace(/_/g, '/');
        
        // Add padding if needed
        while (standardBase64.length % 4) {
          standardBase64 += '=';
        }
        
        // Decode the base64 string
        const bundleBuffer = Buffer.from(standardBase64, 'base64');
        
        // Parse the JSON
        const compactBundle = JSON.parse(bundleBuffer.toString());
        logger.debug({ bundleVersion: compactBundle.v, tokenCount: compactBundle.c }, 'Successfully decoded bundle (ultra-compact format)');
        
        // Recreate full tokens from compact format
        if (compactBundle.v === 3) {
          // Handle ultra-compact format (version 3)
          const prefix = compactBundle.p || 'giftmint';
          const recreatedTokens = [];
          
          for (const extractedToken of compactBundle.t) {
            // Recreate token data
            const tokenData = JSON.stringify({ id: extractedToken.i });
            
            // Recreate full token
            const fullToken = {
              data: tokenData,
              signature: extractedToken.s,
              key_id: extractedToken.k
            };
            
            // Encode it back to compact format with proper prefix
            const encodedToken = encodeToken(fullToken, prefix);
            recreatedTokens.push(encodedToken);
          }
          
          // Return in format compatible with version 2
          return {
            v: 3,
            t: recreatedTokens,
            c: recreatedTokens.length,
            format: 'json'
          };
        }
        
        return compactBundle;
      }
    }
    
    // Handle compact format (with 'token' prefix)
    const tokenMarker = 'token';
    const tokenIndex = bundleString.indexOf(tokenMarker);
    
    if (tokenIndex === -1) {
      logger.warn('Not a recognized bundle format');
      throw new Error('Not a valid token bundle');
    }
    
    // Extract the base64 part
    const base64Bundle = bundleString.slice(tokenIndex + tokenMarker.length);
    logger.debug({ base64Bundle: base64Bundle.substring(0, 20) + '...' }, 'Extracted base64 bundle (compact format)');
    
    // Restore the URL-safe base64 to regular base64
    let standardBase64 = base64Bundle
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    
    // Add padding if needed
    while (standardBase64.length % 4) {
      standardBase64 += '=';
    }
    
    // Decode the base64 string
    const bundleBuffer = Buffer.from(standardBase64, 'base64');
    
    // Parse the JSON
    const bundle = JSON.parse(bundleBuffer.toString());
    logger.debug({ bundleVersion: bundle.v, tokenCount: bundle.c }, 'Successfully decoded bundle (compact format)');
    
    return bundle;
  } catch (error) {
    logger.error({ error }, 'Failed to unbundle tokens');
    throw new Error(`Failed to unbundle tokens: ${error.message}`);
  }
}

module.exports = {
  encodeToken,
  decodeToken,
  bundleTokens,
  unbundleTokens
};