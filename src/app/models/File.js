import Sequelize, { Model } from 'sequelize';

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
            // streaming proxy (GET /files/raw/:key) instead. `name` is the S3 key.
            if (!this.name) return this.path;
            return `${process.env.APP_URL || ''}/files/raw/${encodeURIComponent(
              this.name
            )}`;
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
