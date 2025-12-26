/**
 * AWS S3 Configuration
 * Handles S3 client setup and multer-s3 storage configuration
 */

const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const multerS3 = require('multer-s3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Validate required environment variables
const requiredEnvVars = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET_NAME'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);

if (missingVars.length > 0) {
    console.error('\n╔══════════════════════════════════════════════════════════════╗');
    console.error('║  ⚠️  AWS S3 Configuration Error                               ║');
    console.error('╠══════════════════════════════════════════════════════════════╣');
    console.error('║  Missing required environment variables:                      ║');
    missingVars.forEach(v => {
        console.error(`║    - ${v.padEnd(52)}║`);
    });
    console.error('║                                                              ║');
    console.error('║  Please configure your .env file:                            ║');
    console.error('║    1. cp server/.env.example server/.env                     ║');
    console.error('║    2. Add your AWS credentials to server/.env                ║');
    console.error('║                                                              ║');
    console.error('║  See docs/AWS_SETUP.md for detailed instructions.            ║');
    console.error('╚══════════════════════════════════════════════════════════════╝\n');
    process.exit(1);
}

// Initialize S3 client
const region = process.env.AWS_REGION || 'ap-south-1';
const s3Client = new S3Client({
    region: region,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const bucketName = process.env.AWS_S3_BUCKET_NAME;

// Log successful configuration
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  ✅ AWS S3 Configuration Loaded                              ║');
console.log('╠══════════════════════════════════════════════════════════════╣');
console.log(`║  Bucket: ${bucketName.padEnd(52)}║`);
console.log(`║  Region: ${region.padEnd(52)}║`);
console.log('╚══════════════════════════════════════════════════════════════╝\n');

/**
 * Generate the public URL for an S3 object
 */
function getS3Url(key) {
    return `https://${bucketName}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${key}`;
}

/**
 * Delete an object from S3
 */
async function deleteFromS3(key) {
    console.log(`[S3 DELETE] Attempting to delete: ${key}`);
    try {
        await s3Client.send(new DeleteObjectCommand({
            Bucket: bucketName,
            Key: key
        }));
        console.log(`[S3 DELETE] ✅ Successfully deleted: ${key}`);
        return true;
    } catch (error) {
        console.error(`[S3 DELETE] ❌ Failed to delete: ${key}`, error.message);
        return false;
    }
}

/**
 * Extract S3 key from a full S3 URL
 */
function getKeyFromUrl(url) {
    if (!url) return null;
    
    // Handle full S3 URLs
    if (url.includes('.s3.') && url.includes('.amazonaws.com/')) {
        const match = url.match(/\.amazonaws\.com\/(.+)$/);
        return match ? match[1] : null;
    }
    
    // Handle legacy local paths - extract just the filename
    if (url.startsWith('/uploads/')) {
        return null; // Local file, not in S3
    }
    
    return null;
}

/**
 * Create multer-s3 storage configuration
 */
function createS3Storage(folder) {
    return multerS3({
        s3: s3Client,
        bucket: bucketName,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: (req, file, cb) => {
            const ext = path.extname(file.originalname);
            const filename = `${uuidv4()}${ext}`;
            const key = `${folder}/${filename}`;
            console.log(`[S3 UPLOAD] 📤 Uploading file:`);
            console.log(`[S3 UPLOAD]    Original name: ${file.originalname}`);
            console.log(`[S3 UPLOAD]    Content type: ${file.mimetype}`);
            console.log(`[S3 UPLOAD]    S3 Key: ${key}`);
            console.log(`[S3 UPLOAD]    Bucket: ${bucketName}`);
            cb(null, key);
        }
    });
}

// Pre-configured storage instances for each file type
const seriesThumbnailStorage = createS3Storage('series-thumbnails');
const thumbnailStorage = createS3Storage('thumbnails');
const mediaStorage = createS3Storage('media');
const musicStorage = createS3Storage('music');

module.exports = {
    s3Client,
    bucketName,
    getS3Url,
    deleteFromS3,
    getKeyFromUrl,
    createS3Storage,
    seriesThumbnailStorage,
    thumbnailStorage,
    mediaStorage,
    musicStorage
};
