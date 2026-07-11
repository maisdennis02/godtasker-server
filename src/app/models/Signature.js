import Sequelize, { Model } from 'sequelize';

import { fileProxyUrl } from '../utils/publicUrl';

class Signature extends Model {
  static init(sequelize) {
    super.init(
      {
        name: Sequelize.STRING,
        path: Sequelize.STRING,
        url: {
          type: Sequelize.VIRTUAL,
          get() {
            // Same private-bucket situation as File: stream through the public
            // proxy. Signatures live in the same S3 bucket, so /files/raw works.
            // Fall back to the key embedded in the S3 URL when only `path` was
            // selected (mirrors File.url).
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
export default Signature;
