/**
 * Local Storage Module
 * 
 * This module handles local sound file storage with features:
 * - File read/write operations
 * - Checksum-based deduplication
 * - File size limits
 * - MIME type checking
 * - Secure path handling
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { isSafeLocalPath, sanitizeFilename, isValidAudioMimeType } = require('../utils/validators');

class LocalStorage {
  constructor(options = {}) {
    this.soundDir = options.soundDir || path.join(__dirname, '../../sounds');
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB default
    this.logger = options.logger || console;
    
    this.init();
  }
  
  async init() {
    try {
      await fs.mkdir(this.soundDir, { recursive: true });
      this.logger.info(`[LocalStorage] Sound directory created at ${this.soundDir}`);
    } catch (error) {
      this.logger.error('[LocalStorage] Failed to create sound directory:', error);
    }
  }
  
  /**
   * Save a sound file
   * @param {Buffer} buffer - File buffer
   * @param {string} filename - Original filename
   * @param {Object} options - Save options
   * @returns {Promise<Object>} File info
   */
  async saveFile(buffer, filename, options = {}) {
    const {
      mimeType = null,
      deduplicate = true,
      metadata = {}
    } = options;
    
    // Validate file size
    if (buffer.length > this.maxFileSize) {
      throw new Error(`File too large: ${buffer.length} bytes (max: ${this.maxFileSize})`);
    }
    
    // Validate MIME type if provided
    if (mimeType && !isValidAudioMimeType(mimeType)) {
      throw new Error(`Invalid MIME type: ${mimeType}`);
    }
    
    // Sanitize filename
    const sanitized = sanitizeFilename(filename);
    if (!sanitized) {
      throw new Error('Invalid filename');
    }
    
    // Calculate checksum for deduplication
    const checksum = this._calculateChecksum(buffer);
    
    // Check if file already exists with same checksum
    if (deduplicate) {
      const existing = await this._findByChecksum(checksum);
      if (existing) {
        this.logger.info(`[LocalStorage] File already exists: ${existing.filename}`);
        return existing;
      }
    }
    
    // Generate unique filename if needed
    let finalFilename = sanitized;
    let counter = 1;
    
    while (await this._fileExists(finalFilename)) {
      const ext = path.extname(sanitized);
      const base = path.basename(sanitized, ext);
      finalFilename = `${base}_${counter}${ext}`;
      counter++;
    }
    
    // Save file
    const filePath = path.join(this.soundDir, finalFilename);
    await fs.writeFile(filePath, buffer);
    
    // Save metadata
    const fileInfo = {
      filename: finalFilename,
      path: filePath,
      size: buffer.length,
      checksum: checksum,
      mimeType: mimeType,
      metadata: metadata,
      createdAt: new Date().toISOString()
    };
    
    await this._saveMetadata(finalFilename, fileInfo);
    
    this.logger.info(`[LocalStorage] File saved: ${finalFilename} (${buffer.length} bytes)`);
    
    return fileInfo;
  }
  
  /**
   * Read a sound file
   * @param {string} filename - Filename to read
   * @returns {Promise<Buffer>} File buffer
   */
  async readFile(filename) {
    // Validate path safety
    if (!isSafeLocalPath(filename, this.soundDir)) {
      throw new Error('Invalid file path');
    }
    
    const filePath = path.join(this.soundDir, filename);
    
    try {
      const buffer = await fs.readFile(filePath);
      this.logger.debug(`[LocalStorage] File read: ${filename} (${buffer.length} bytes)`);
      return buffer;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${filename}`);
      }
      throw error;
    }
  }
  
  /**
   * Delete a sound file
   * @param {string} filename - Filename to delete
   * @returns {Promise<void>}
   */
  async deleteFile(filename) {
    // Validate path safety
    if (!isSafeLocalPath(filename, this.soundDir)) {
      throw new Error('Invalid file path');
    }
    
    const filePath = path.join(this.soundDir, filename);
    const metaPath = this._getMetadataPath(filename);
    
    try {
      await fs.unlink(filePath);
      
      // Try to delete metadata file (ignore if doesn't exist)
      try {
        await fs.unlink(metaPath);
      } catch (error) {
        // Ignore
      }
      
      this.logger.info(`[LocalStorage] File deleted: ${filename}`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${filename}`);
      }
      throw error;
    }
  }
  
  /**
   * List all sound files
   * @returns {Promise<Array>} Array of file info objects
   */
  async listFiles() {
    try {
      const files = await fs.readdir(this.soundDir);
      const audioFiles = files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.mp3', '.wav', '.ogg', '.opus', '.webm', '.aac', '.m4a'].includes(ext);
      });
      
      const fileInfos = await Promise.all(
        audioFiles.map(async (file) => {
          const meta = await this._loadMetadata(file);
          if (meta) {
            return meta;
          }
          
          // If no metadata, create basic info
          const filePath = path.join(this.soundDir, file);
          const stat = await fs.stat(filePath);
          
          return {
            filename: file,
            path: filePath,
            size: stat.size,
            createdAt: stat.birthtime.toISOString(),
            modifiedAt: stat.mtime.toISOString()
          };
        })
      );
      
      return fileInfos;
    } catch (error) {
      this.logger.error('[LocalStorage] Failed to list files:', error);
      return [];
    }
  }
  
  /**
   * Get file info
   * @param {string} filename - Filename
   * @returns {Promise<Object>} File info
   */
  async getFileInfo(filename) {
    // Validate path safety
    if (!isSafeLocalPath(filename, this.soundDir)) {
      throw new Error('Invalid file path');
    }
    
    const meta = await this._loadMetadata(filename);
    if (meta) {
      return meta;
    }
    
    // If no metadata, get basic info
    const filePath = path.join(this.soundDir, filename);
    const stat = await fs.stat(filePath);
    
    return {
      filename: filename,
      path: filePath,
      size: stat.size,
      createdAt: stat.birthtime.toISOString(),
      modifiedAt: stat.mtime.toISOString()
    };
  }
  
  /**
   * Update file metadata
   * @param {string} filename - Filename
   * @param {Object} metadata - Metadata to update
   * @returns {Promise<void>}
   */
  async updateMetadata(filename, metadata) {
    // Validate path safety
    if (!isSafeLocalPath(filename, this.soundDir)) {
      throw new Error('Invalid file path');
    }
    
    const existing = await this._loadMetadata(filename);
    if (!existing) {
      throw new Error(`File not found: ${filename}`);
    }
    
    const updated = {
      ...existing,
      metadata: {
        ...existing.metadata,
        ...metadata
      },
      updatedAt: new Date().toISOString()
    };
    
    await this._saveMetadata(filename, updated);
    this.logger.info(`[LocalStorage] Metadata updated for: ${filename}`);
  }
  
  /**
   * Calculate file checksum
   */
  _calculateChecksum(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }
  
  /**
   * Check if file exists
   */
  async _fileExists(filename) {
    const filePath = path.join(this.soundDir, filename);
    try {
      await fs.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Find file by checksum
   */
  async _findByChecksum(checksum) {
    const files = await this.listFiles();
    return files.find(file => file.checksum === checksum);
  }
  
  /**
   * Get metadata file path
   */
  _getMetadataPath(filename) {
    const base = path.basename(filename, path.extname(filename));
    return path.join(this.soundDir, `.${base}.meta.json`);
  }
  
  /**
   * Save metadata to file
   */
  async _saveMetadata(filename, metadata) {
    const metaPath = this._getMetadataPath(filename);
    await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2), 'utf8');
  }
  
  /**
   * Load metadata from file
   */
  async _loadMetadata(filename) {
    const metaPath = this._getMetadataPath(filename);
    
    try {
      const data = await fs.readFile(metaPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Get storage statistics
   */
  async getStats() {
    const files = await this.listFiles();
    const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);
    
    return {
      fileCount: files.length,
      totalSize: totalSize,
      maxFileSize: this.maxFileSize,
      soundDir: this.soundDir
    };
  }
}

module.exports = LocalStorage;
