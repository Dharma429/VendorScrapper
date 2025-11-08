const fs = require('fs');
const path = require('path');

class FileUtils {
    /**
     * Check if folder exists and create if it doesn't
     * @param {string} folderPath - Path to folder
     * @returns {string} The folder path
     */
    static ensureFolderExists(folderPath) {
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
            console.log(`✅ Created folder: ${folderPath}`);
        }
        return folderPath;
    }

    /**
     * Get all files from a folder
     * @param {string} folderPath - Path to folder
     * @param {Array} allowedExtensions - File extensions to include
     * @returns {Array} Array of file objects
     */
    static getFilesFromFolder(folderPath, allowedExtensions = []) {
        // Check if folder exists
        if (!folderPath || !fs.existsSync(folderPath)) {
            console.warn(`⚠️ Folder does not exist: ${folderPath}`);
            return [];
        }

        // Check if it's a directory
        const stats = fs.statSync(folderPath);
        if (!stats.isDirectory()) {
            console.warn(`⚠️ Path is not a directory: ${folderPath}`);
            return [];
        }

        try {
            const files = fs.readdirSync(folderPath);
            const fileList = [];

            files.forEach(file => {
                const filePath = path.join(folderPath, file);
                
                try {
                    const fileStats = fs.statSync(filePath);

                    if (fileStats.isFile()) {
                        const fileExt = path.extname(file).toLowerCase();
                        
                        // If no extensions specified, include all files
                        // If extensions specified, only include matching files
                        if (allowedExtensions.length === 0 || allowedExtensions.includes(fileExt)) {
                            fileList.push({
                                filename: file,
                                path: filePath,
                                size: fileStats.size,
                                modified: fileStats.mtime,
                                extension: fileExt
                            });
                        }
                    }
                } catch (error) {
                    console.warn(`⚠️ Could not read file: ${filePath}`, error.message);
                }
            });

            console.log(`📁 Found ${fileList.length} files in folder: ${folderPath}`);
            return fileList;
        } catch (error) {
            console.error(`❌ Error reading folder: ${folderPath}`, error.message);
            return [];
        }
    }

    /**
     * Convert files to email attachments format
     * @param {Array} files - Array of file objects
     * @returns {Array} Array of attachment objects
     */
    static filesToAttachments(files) {
        return files.map(file => ({
            filename: file.filename,
            path: file.path
        }));
    }

    /**
     * Get files by specific types
     * @param {string} folderPath - Path to folder
     * @param {Array} fileTypes - Array of file extensions
     * @returns {Array} Array of file objects
     */
    static getFilesByType(folderPath, fileTypes = ['.pdf', '.doc', '.docx', '.xlsx', '.jpg', '.png', '.txt']) {
        return this.getFilesFromFolder(folderPath, fileTypes);
    }

    /**
     * Get only recent files (modified in last X hours)
     * @param {string} folderPath - Path to folder
     * @param {number} hours - Hours threshold
     * @returns {Array} Array of file objects
     */
    static getRecentFiles(folderPath, hours = 24) {
        const files = this.getFilesFromFolder(folderPath);
        const cutoffTime = new Date(Date.now() - (hours * 60 * 60 * 1000));
        
        return files.filter(file => new Date(file.modified) > cutoffTime);
    }

    /**
     * Move files to another folder after processing
     * @param {Array} files - Array of file objects
     * @param {string} destinationFolder - Destination folder path
     */
    static moveFiles(files, destinationFolder) {
        this.ensureFolderExists(destinationFolder);
        
        files.forEach(file => {
            const destinationPath = path.join(destinationFolder, file.filename);
            try {
                fs.renameSync(file.path, destinationPath);
                console.log(`✅ Moved file: ${file.filename} to ${destinationFolder}`);
            } catch (error) {
                console.error(`❌ Error moving file: ${file.filename}`, error.message);
            }
        });
    }

    /**
     * Delete files after processing
     * @param {Array} files - Array of file objects
     */
    static deleteFiles(files) {
        files.forEach(file => {
            try {
                fs.unlinkSync(file.path);
                console.log(`✅ Deleted file: ${file.filename}`);
            } catch (error) {
                console.error(`❌ Error deleting file: ${file.filename}`, error.message);
            }
        });
    }
}

module.exports = FileUtils;