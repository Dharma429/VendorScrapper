const nodemailer = require('nodemailer');
const { emailConfig, emailDefaults } = require('./emailConfig');
const FileUtils = require('./util');

class EmailService {
    constructor() {
        this.transporter = null;
        this.MAX_EMAIL_SIZE = 20 * 1024 * 1024; // 20MB (safe margin under 25MB)
        this.MAX_ATTACHMENT_SIZE = 15 * 1024 * 1024; // 15MB per file
        this.initializeTransporter();
    }

    /**
     * Initialize email transporter
     */
    initializeTransporter() {
        try {
            this.transporter = nodemailer.createTransport(emailConfig);
            console.log('✅ Email transporter initialized');
        } catch (error) {
            console.error('❌ Error initializing email transporter:', error.message);
            throw error;
        }
    }

    /**
     * Verify SMTP connection
     */
    async verifyConnection() {
        try {
            await this.transporter.verify();
            console.log('✅ SMTP connection verified');
            return true;
        } catch (error) {
            console.error('❌ SMTP connection failed:', error.message);
            return false;
        }
    }

    /**
     * Get attachments with size checking
     * @param {string} folderPath - Path to folder
     * @param {Array} allowedExtensions - File extensions to include
     * @returns {Object} Object containing attachments, totalSize, and oversizedFiles
     */
    async getAttachmentsWithSizeCheck(folderPath, allowedExtensions = []) {
        if (!folderPath || !FileUtils.ensureFolderExists(folderPath)) {
            return { attachments: [], totalSize: 0, oversizedFiles: [] };
        }

        const files = FileUtils.getFilesFromFolder(folderPath, allowedExtensions);
        const attachments = [];
        const oversizedFiles = [];
        let totalSize = 0;

        for (const file of files) {
            // Check individual file size
            if (file.size > this.MAX_ATTACHMENT_SIZE) {
                oversizedFiles.push({
                    filename: file.filename,
                    path: file.path,
                    size: file.size,
                    reason: 'Exceeds individual file size limit'
                });
                continue;
            }

            // Check if adding this file would exceed total size
            if (totalSize + file.size > this.MAX_EMAIL_SIZE) {
                oversizedFiles.push({
                    filename: file.filename,
                    path: file.path,
                    size: file.size,
                    reason: 'Would exceed total email size limit'
                });
                continue;
            }

            // File is within limits, add to attachments
            attachments.push({
                filename: file.filename,
                path: file.path,
                size: file.size
            });
            
            totalSize += file.size;
        }

        console.log(`📊 Size Summary: ${attachments.length} files within limits (${this.formatFileSize(totalSize)})`);
        
        if (oversizedFiles.length > 0) {
            console.log(`⚠️  ${oversizedFiles.length} files skipped due to size limits:`);
            oversizedFiles.forEach(file => {
                console.log(`   - ${file.filename} (${this.formatFileSize(file.size)}) - ${file.reason}`);
            });
        }

        return { attachments, totalSize, oversizedFiles };
    }

    /**
     * Send email with attachments from folder with size checking
     * @param {Object} options - Email options
     */
    async sendEmailWithFolderAttachments(options) {
        try {
            // Verify connection first
            const isConnected = await this.verifyConnection();
            if (!isConnected) {
                throw new Error('SMTP connection failed');
            }

            // Get attachments from folder with size checking
            let folderAttachments = [];
            let oversizedFiles = [];
            let totalSize = 0;

            if (options.attachmentFolder) {
                const sizeCheckResult = await this.getAttachmentsWithSizeCheck(
                    options.attachmentFolder, 
                    options.allowedExtensions
                );
                folderAttachments = sizeCheckResult.attachments;
                oversizedFiles = sizeCheckResult.oversizedFiles;
                totalSize = sizeCheckResult.totalSize;
            }

            // Check if email would be too large
            if (totalSize > this.MAX_EMAIL_SIZE) {
                throw new Error(
                    `Total attachment size (${this.formatFileSize(totalSize)}) exceeds Gmail limit (${this.formatFileSize(this.MAX_EMAIL_SIZE)}). ` +
                    `Found ${oversizedFiles.length} files that are too large.`
                );
            }

            // Combine with additional attachments (also check their sizes)
            let additionalAttachments = [];
            if (options.attachments) {
                for (const attachment of options.attachments) {
                    try {
                        const stats = require('fs').statSync(attachment.path);
                        if (stats.size > this.MAX_ATTACHMENT_SIZE) {
                            console.warn(`⚠️ Skipping large additional attachment: ${attachment.filename} (${this.formatFileSize(stats.size)})`);
                            continue;
                        }
                        if (totalSize + stats.size > this.MAX_EMAIL_SIZE) {
                            console.warn(`⚠️ Skipping additional attachment (would exceed limit): ${attachment.filename}`);
                            continue;
                        }
                        additionalAttachments.push(attachment);
                        totalSize += stats.size;
                    } catch (error) {
                        console.warn(`⚠️ Could not check size of additional attachment: ${attachment.filename}`);
                        additionalAttachments.push(attachment);
                    }
                }
            }

            const allAttachments = [
                ...folderAttachments,
                ...additionalAttachments
            ];

            console.log(`📧 Preparing email with ${allAttachments.length} attachments (Total: ${this.formatFileSize(totalSize)})`);

            const mailOptions = {
                from: `${emailDefaults.fromName} <${options.from || emailDefaults.from}>`,
                to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
                subject: options.subject,
                text: options.text || '',
                html: options.html || options.text || '',
                attachments: allAttachments,
                cc: options.cc,
                bcc: options.bcc,
                replyTo: options.replyTo
            };

            console.log("📨 Mail Options:", {
                to: mailOptions.to,
                subject: mailOptions.subject,
                attachments: allAttachments.length,
                totalSize: this.formatFileSize(totalSize)
            });

            const result = await this.transporter.sendMail(mailOptions);
            
            console.log(`✅ Email sent successfully to ${options.to} with ${allAttachments.length} attachments (${this.formatFileSize(totalSize)})`);
            
            return {
                success: true,
                messageId: result.messageId,
                attachmentsCount: allAttachments.length,
                totalSize: totalSize,
                oversizedFiles: oversizedFiles,
                attachmentNames: allAttachments.map(att => att.filename),
                response: result.response
            };
        } catch (error) {
            console.error('❌ Error sending email:', error.message);
            return {
                success: false,
                error: error.message,
                attachmentsCount: 0
            };
        }
    }

    /**
     * Send all files from a folder (with size checking)
     * @param {string} to - Recipient email
     * @param {string} subject - Email subject
     * @param {string} folderPath - Folder containing attachments
     * @param {string} bodyText - Email body text
     */
    async sendFolderContents(to, subject, folderPath, bodyText = 'Please find the attached files.') {
        return this.sendEmailWithFolderAttachments({
            to,
            subject,
            text: bodyText,
            html: `<p>${bodyText}</p>`,
            attachmentFolder: folderPath
        });
    }

    /**
     * Send only small files (under specified size)
     * @param {string} to - Recipient email
     * @param {string} subject - Email subject
     * @param {string} folderPath - Folder containing attachments
     * @param {number} maxSizeMB - Maximum file size in MB
     * @param {string} bodyText - Email body text
     */
    async sendSmallFilesOnly(to, subject, folderPath, maxSizeMB = 10, bodyText = 'Please find the attached files.') {
        const maxSize = maxSizeMB * 1024 * 1024;
        const files = FileUtils.getFilesFromFolder(folderPath);
        const smallFiles = files.filter(file => file.size <= maxSize);
        const largeFiles = files.filter(file => file.size > maxSize);

        console.log(`📁 Found ${smallFiles.length} files under ${maxSizeMB}MB and ${largeFiles.length} files over limit`);

        const attachments = FileUtils.filesToAttachments(smallFiles);

        if (largeFiles.length > 0) {
            bodyText += `\n\nNote: ${largeFiles.length} files were excluded as they exceed ${maxSizeMB}MB size limit.`;
        }

        return this.sendEmailWithFolderAttachments({
            to,
            subject: `${subject} (Files under ${maxSizeMB}MB)`,
            text: bodyText,
            html: `<p>${bodyText.replace(/\n/g, '<br>')}</p>`,
            attachments: attachments
        });
    }

    /**
     * Send files in batches to avoid size limits
     * @param {string} to - Recipient email
     * @param {string} subject - Email subject
     * @param {string} folderPath - Folder containing attachments
     * @param {number} batchSizeMB - Maximum batch size in MB
     * @param {string} bodyText - Email body text
     */
    async sendInBatches(to, subject, folderPath, batchSizeMB = 15, bodyText = 'Please find the attached files.') {
        const files = FileUtils.getFilesFromFolder(folderPath);
        const batches = this.createBatches(files, batchSizeMB * 1024 * 1024);
        
        console.log(`📦 Splitting ${files.length} files into ${batches.length} batches`);

        const results = [];
        
        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            const batchSize = batch.reduce((sum, file) => sum + file.size, 0);
            
            console.log(`\n📤 Sending batch ${i + 1}/${batches.length} (${batch.length} files, ${this.formatFileSize(batchSize)})`);
            
            const result = await this.sendEmailWithFolderAttachments({
                to,
                subject: `${subject} (Part ${i + 1} of ${batches.length})`,
                text: `${bodyText}\n\nThis is part ${i + 1} of ${batches.length}. Files in this batch: ${batch.length} (${this.formatFileSize(batchSize)})`,
                html: `<p>${bodyText}</p><p>This is part <strong>${i + 1}</strong> of <strong>${batches.length}</strong>. Files in this batch: ${batch.length} (${this.formatFileSize(batchSize)})</p>`,
                attachments: FileUtils.filesToAttachments(batch)
            });
            
            results.push(result);
        }

        return results;
    }

    /**
     * Create batches of files that don't exceed size limit
     * @param {Array} files - Array of file objects
     * @param {number} batchSizeLimit - Maximum batch size in bytes
     * @returns {Array} Array of batches
     */
    createBatches(files, batchSizeLimit) {
        const batches = [];
        let currentBatch = [];
        let currentBatchSize = 0;

        // Sort files by size (largest first) for better packing
        const sortedFiles = [...files].sort((a, b) => b.size - a.size);

        sortedFiles.forEach(file => {
            if (currentBatchSize + file.size > batchSizeLimit && currentBatch.length > 0) {
                // Start new batch
                batches.push([...currentBatch]);
                currentBatch = [file];
                currentBatchSize = file.size;
            } else {
                // Add to current batch
                currentBatch.push(file);
                currentBatchSize += file.size;
            }
        });

        // Add the last batch
        if (currentBatch.length > 0) {
            batches.push(currentBatch);
        }

        return batches;
    }

    /**
     * Get folder size summary
     * @param {string} folderPath - Path to folder
     * @returns {Object} Size summary object
     */
    getFolderSizeSummary(folderPath) {
        const files = FileUtils.getFilesFromFolder(folderPath);
        const totalSize = files.reduce((sum, file) => sum + file.size, 0);
        const oversizedFiles = files.filter(file => file.size > this.MAX_ATTACHMENT_SIZE);
        
        return {
            totalFiles: files.length,
            totalSize: this.formatFileSize(totalSize),
            sendableFiles: files.length - oversizedFiles.length,
            sendableSize: this.formatFileSize(totalSize - oversizedFiles.reduce((sum, file) => sum + file.size, 0)),
            oversizedFiles: oversizedFiles.length,
            oversizedFilesList: oversizedFiles.map(f => ({
                name: f.filename,
                size: this.formatFileSize(f.size)
            })),
            recommendation: this.getSizeRecommendation(files)
        };
    }

    /**
     * Get recommendation based on file sizes
     * @param {Array} files - Array of file objects
     * @returns {string} Recommendation message
     */
    getSizeRecommendation(files) {
        const totalSize = files.reduce((sum, file) => sum + file.size, 0);
        const largeFiles = files.filter(file => file.size > this.MAX_ATTACHMENT_SIZE);

        if (totalSize > this.MAX_EMAIL_SIZE) {
            const batchesNeeded = Math.ceil(totalSize / (15 * 1024 * 1024));
            return `Split into ${batchesNeeded} batches using sendInBatches()`;
        } else if (largeFiles.length > 0) {
            return `Use sendSmallFilesOnly() or handle large files separately`;
        } else {
            return `All files can be sent in one email`;
        }
    }

    /**
     * Format file size for display
     * @param {number} bytes - File size in bytes
     * @returns {string} Formatted file size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Send specific file types from folder (with size checking)
     * @param {string} to - Recipient email
     * @param {string} subject - Email subject
     * @param {string} folderPath - Folder containing attachments
     * @param {Array} fileTypes - Array of file extensions
     * @param {string} bodyText - Email body text
     */
    async sendSpecificFileTypes(to, subject, folderPath, fileTypes, bodyText = 'Please find the attached files.') {
        return this.sendEmailWithFolderAttachments({
            to,
            subject,
            text: bodyText,
            html: `<p>${bodyText}</p>`,
            attachmentFolder: folderPath,
            allowedExtensions: fileTypes
        });
    }

    /**
     * Send recent files from folder (modified in last X hours) with size checking
     * @param {string} to - Recipient email
     * @param {string} subject - Email subject
     * @param {string} folderPath - Folder containing attachments
     * @param {number} hours - Hours threshold
     * @param {string} bodyText - Email body text
     */
    async sendRecentFiles(to, subject, folderPath, hours = 24, bodyText = 'Please find the recent files.') {
        const files = FileUtils.getRecentFiles(folderPath, hours);
        const attachments = FileUtils.filesToAttachments(files);

        return this.sendEmailWithFolderAttachments({
            to,
            subject,
            text: bodyText,
            html: `<p>${bodyText}</p>`,
            attachments: attachments
        });
    }

    /**
     * Send email and move files to archive (with size checking)
     * @param {Object} options - Email options
     * @param {string} archiveFolder - Archive folder path
     */
    async sendAndArchive(options, archiveFolder) {
        const result = await this.sendEmailWithFolderAttachments(options);
        
        if (result.success && options.attachmentFolder) {
            const files = FileUtils.getFilesFromFolder(options.attachmentFolder);
            FileUtils.moveFiles(files, archiveFolder);
            console.log(`📦 Moved ${files.length} files to archive: ${archiveFolder}`);
        }
        
        return result;
    }

    /**
     * Send email and delete files after sending (with size checking)
     * @param {Object} options - Email options
     */
    async sendAndCleanup(options) {
        let files = [];
        if (options.attachmentFolder) {
            files = FileUtils.getFilesFromFolder(options.attachmentFolder);
        }

        const result = await this.sendEmailWithFolderAttachments(options);
        
        if (result.success && files.length > 0) {
            FileUtils.deleteFiles(files);
            console.log(`🧹 Deleted ${files.length} files after sending`);
        }
        
        return result;
    }
}

module.exports = EmailService;