/**
 * Queue Manager
 * 
 * This module manages the playback queue with features:
 * - Priority-based queuing
 * - Concurrency control
 * - Ducking support
 * - Job tracking and lifecycle management
 */

const PQueue = require('p-queue').default;
const { nanoid } = require('nanoid');

class QueueManager {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.concurrency = options.concurrency || 1;
    this.autoStart = options.autoStart !== false;
    
    // Initialize queue
    this.queue = new PQueue({
      concurrency: this.concurrency,
      autoStart: this.autoStart
    });
    
    // Job tracking
    this.jobs = new Map(); // jobId -> job object
    this.activeJobs = new Set();
    this.completedJobs = [];
    this.maxCompletedJobs = 100;
    
    // Statistics
    this.stats = {
      totalProcessed: 0,
      totalFailed: 0,
      totalCancelled: 0
    };
  }
  
  /**
   * Add a job to the queue
   * @param {Object} jobData - Job data
   * @param {Function} processor - Optional processor function
   * @returns {Promise<string>} Job ID
   */
  async add(jobData, processor = null) {
    const jobId = nanoid(10);
    
    const job = {
      id: jobId,
      ...jobData,
      status: 'queued',
      priority: jobData.priority || 0,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      error: null
    };
    
    this.jobs.set(jobId, job);
    
    // Add to queue with priority
    this.queue.add(
      async () => {
        return await this._processJob(job, processor);
      },
      { priority: job.priority }
    );
    
    this.logger.info(`[Queue] Job added: ${jobId} (priority: ${job.priority})`);
    
    return jobId;
  }
  
  /**
   * Process a job
   * @param {Object} job - Job object
   * @param {Function} processor - Optional processor function
   */
  async _processJob(job, processor) {
    try {
      job.status = 'processing';
      job.startedAt = new Date().toISOString();
      this.activeJobs.add(job.id);
      
      this.logger.info(`[Queue] Processing job: ${job.id}`);
      
      // If processor is provided, execute it
      if (processor && typeof processor === 'function') {
        await processor(job);
      }
      
      // Note: In the current implementation, the actual playback is handled
      // by the WebSocket broadcast to clients. The queue just tracks the job lifecycle.
      // Clients will report back when playback is complete via play-end message.
      
      job.status = 'completed';
      job.completedAt = new Date().toISOString();
      
      this.stats.totalProcessed++;
      
      // Move to completed
      this.activeJobs.delete(job.id);
      this._addToCompleted(job);
      
      this.logger.info(`[Queue] Job completed: ${job.id}`);
      
      return { success: true, jobId: job.id };
    } catch (error) {
      job.status = 'failed';
      job.error = error.message;
      job.completedAt = new Date().toISOString();
      
      this.stats.totalFailed++;
      
      this.activeJobs.delete(job.id);
      this._addToCompleted(job);
      
      this.logger.error(`[Queue] Job failed: ${job.id}`, error);
      
      throw error;
    }
  }
  
  /**
   * Cancel a job
   * @param {string} jobId - Job ID
   * @returns {boolean} True if cancelled
   */
  cancel(jobId) {
    const job = this.jobs.get(jobId);
    
    if (!job) {
      return false;
    }
    
    if (job.status === 'processing') {
      // Can't cancel already processing job
      return false;
    }
    
    if (job.status === 'queued') {
      job.status = 'cancelled';
      job.completedAt = new Date().toISOString();
      
      this.stats.totalCancelled++;
      
      this.jobs.delete(jobId);
      this._addToCompleted(job);
      
      this.logger.info(`[Queue] Job cancelled: ${jobId}`);
      
      return true;
    }
    
    return false;
  }
  
  /**
   * Get job by ID
   * @param {string} jobId - Job ID
   * @returns {Object|null} Job object
   */
  getJob(jobId) {
    return this.jobs.get(jobId) || null;
  }
  
  /**
   * Get all queued jobs
   * @returns {Array} Array of queued jobs
   */
  getQueuedJobs() {
    const queued = [];
    
    this.jobs.forEach(job => {
      if (job.status === 'queued') {
        queued.push(job);
      }
    });
    
    // Sort by priority (higher first)
    return queued.sort((a, b) => b.priority - a.priority);
  }
  
  /**
   * Get all active jobs
   * @returns {Array} Array of active jobs
   */
  getActiveJobs() {
    const active = [];
    
    this.activeJobs.forEach(jobId => {
      const job = this.jobs.get(jobId);
      if (job) {
        active.push(job);
      }
    });
    
    return active;
  }
  
  /**
   * Get recently completed jobs
   * @param {number} limit - Maximum number of jobs to return
   * @returns {Array} Array of completed jobs
   */
  getCompletedJobs(limit = 20) {
    return this.completedJobs.slice(-limit);
  }
  
  /**
   * Clear completed jobs
   */
  clearCompleted() {
    this.completedJobs = [];
    this.logger.info('[Queue] Completed jobs cleared');
  }
  
  /**
   * Get queue statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      queueSize: this.queue.size,
      pending: this.queue.pending,
      activeJobs: this.activeJobs.size,
      isPaused: this.queue.isPaused
    };
  }
  
  /**
   * Pause queue
   */
  pause() {
    this.queue.pause();
    this.logger.info('[Queue] Queue paused');
  }
  
  /**
   * Resume queue
   */
  resume() {
    this.queue.start();
    this.logger.info('[Queue] Queue resumed');
  }
  
  /**
   * Clear queue (cancel all pending jobs)
   */
  clear() {
    const queuedJobs = this.getQueuedJobs();
    
    queuedJobs.forEach(job => {
      this.cancel(job.id);
    });
    
    this.queue.clear();
    
    this.logger.info(`[Queue] Queue cleared (${queuedJobs.length} jobs cancelled)`);
  }
  
  /**
   * Update concurrency
   * @param {number} concurrency - New concurrency level
   */
  updateConcurrency(concurrency) {
    this.concurrency = concurrency;
    this.queue.concurrency = concurrency;
    
    this.logger.info(`[Queue] Concurrency updated to ${concurrency}`);
  }
  
  /**
   * Mark job as completed (called externally when playback finishes)
   * @param {string} jobId - Job ID
   * @param {Object} result - Result data
   */
  markJobCompleted(jobId, result = {}) {
    const job = this.jobs.get(jobId);
    
    if (!job) {
      this.logger.warn(`[Queue] Cannot mark unknown job as completed: ${jobId}`);
      return false;
    }
    
    if (job.status !== 'processing') {
      this.logger.warn(`[Queue] Cannot mark non-processing job as completed: ${jobId}`);
      return false;
    }
    
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.result = result;
    
    this.activeJobs.delete(jobId);
    this._addToCompleted(job);
    
    this.logger.info(`[Queue] Job externally marked as completed: ${jobId}`);
    
    return true;
  }
  
  /**
   * Mark job as failed (called externally when playback fails)
   * @param {string} jobId - Job ID
   * @param {string} error - Error message
   */
  markJobFailed(jobId, error) {
    const job = this.jobs.get(jobId);
    
    if (!job) {
      this.logger.warn(`[Queue] Cannot mark unknown job as failed: ${jobId}`);
      return false;
    }
    
    job.status = 'failed';
    job.error = error;
    job.completedAt = new Date().toISOString();
    
    this.stats.totalFailed++;
    
    this.activeJobs.delete(jobId);
    this._addToCompleted(job);
    
    this.logger.info(`[Queue] Job externally marked as failed: ${jobId}`);
    
    return true;
  }
  
  /**
   * Add job to completed history
   */
  _addToCompleted(job) {
    this.completedJobs.push({
      ...job,
      // Remove large data to save memory
      data: undefined
    });
    
    // Limit completed jobs
    if (this.completedJobs.length > this.maxCompletedJobs) {
      this.completedJobs = this.completedJobs.slice(-this.maxCompletedJobs);
    }
  }
  
  /**
   * Wait for queue to be idle (all jobs completed)
   * @returns {Promise<void>}
   */
  async onIdle() {
    await this.queue.onIdle();
  }
  
  /**
   * Cleanup and destroy queue
   */
  destroy() {
    this.queue.clear();
    this.jobs.clear();
    this.activeJobs.clear();
    this.completedJobs = [];
    
    this.logger.info('[Queue] Queue destroyed');
  }
}

module.exports = QueueManager;
