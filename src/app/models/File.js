import Sequelize, { Model } from 'sequelize';

import { fileProxyUrl } from '../utils/publicUrl';

class File extends Model {
  static init(sequelize) {
    super.init(
      {
        name: Sequelize.STRING,
        path: Sequelize.STRING,
        url: {
          type: Sequelize.VIRTUAL,
          get() {
            // Objects in the S3 bucket are private (no public-read policy), so a
            // direct S3 URL 403s in an <img>. Serve them through the app's public
            // streaming proxy (GET /files/raw/:key) instead. `name` is the S3 key,
            // but some queries select only `path` — fall back to the key embedded
            // in the S3 URL so the proxy URL is built regardless of attributes.
            const key =
              this.name ||
              (this.path && decodeURIComponent(this.path.split('/').pop()));
            return key ? fileProxyUrl(key) : this.path;
          },
        },
      },
      {
        sequelize,
      }
    );
    return this;
  }
}
export default File;
