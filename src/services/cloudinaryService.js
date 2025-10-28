const cloudinary = require('cloudinary').v2;
const { promisify } = require('util');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Promisify upload function
const uploadAsync = promisify(cloudinary.uploader.upload);

class CloudinaryService {
  /**
   * Upload image to Cloudinary
   * @param {Buffer|String} file - File buffer or base64 string
   * @param {Object} options - Upload options
   * @returns {Promise<Object>} Upload result
   */
  static async uploadImage(file, options = {}) {
    try {
      const defaultOptions = {
        folder: 'jaaiye/events',
        resource_type: 'auto',
        quality: 'auto',
        fetch_format: 'auto',
        ...options
      };

      // Support Buffer uploads via upload_stream for better compatibility
      if (Buffer.isBuffer(file)) {
        const uploadStream = () => new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(defaultOptions, (error, result) => {
            if (error) return reject(error);
            resolve(result);
          });
          stream.end(file);
        });

        const result = await uploadStream();
        return {
          success: true,
          url: result.secure_url,
          publicId: result.public_id,
          width: result.width,
          height: result.height,
          format: result.format,
          bytes: result.bytes
        };
      }

      const result = await uploadAsync(file, defaultOptions);
      console.log("2. ", result)

      return {
        success: true,
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes
      };
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Upload image from base64 string
   * @param {String} base64String - Base64 encoded image
   * @param {Object} options - Upload options
   * @returns {Promise<Object>} Upload result
   */
  static async uploadFromBase64(base64String, options = {}) {
    try {
      const result = await uploadAsync(base64String, options);

      return {
        success: true,
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes
      };
    } catch (error) {
      console.error('Cloudinary base64 upload error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete image from Cloudinary
   * @param {String} publicId - Public ID of the image
   * @returns {Promise<Object>} Delete result
   */
  static async deleteImage(publicId) {
    try {
      const destroyAsync = promisify(cloudinary.uploader.destroy);
      const result = await destroyAsync(publicId);

      return {
        success: true,
        result
      };
    } catch (error) {
      console.error('Cloudinary delete error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate image URL with transformations
   * @param {String} publicId - Public ID of the image
   * @param {Object} transformations - Cloudinary transformations
   * @returns {String} Transformed image URL
   */
  static getImageUrl(publicId, transformations = {}) {
    return cloudinary.url(publicId, transformations);
  }

  /**
   * Extract public ID from Cloudinary URL
   * @param {String} url - Cloudinary URL
   * @returns {String} Public ID
   */
  static extractPublicId(url) {
    const matches = url.match(/\/v\d+\/(.+)\.(jpg|jpeg|png|gif|webp)$/);
    return matches ? matches[1] : null;
  }
}

module.exports = CloudinaryService;
